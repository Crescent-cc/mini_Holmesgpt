import test from "node:test";
import assert from "node:assert/strict";

import { BaseTool, RiskLevel, ToolCall } from "../src/tools/base.ts";
import { ToolExecutor } from "../src/tools/executor.ts";
import { ToolRegistry } from "../src/tools/registry.ts";

class EchoTool extends BaseTool<{ value: string }, { echoed: string }> {
  name = "echo";
  description = "Echoes an input value";
  parameters = {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
  };

  async run(args: { value: string }) {
    return { echoed: args.value };
  }
}

class DangerousTool extends EchoTool {
  name = "dangerous_echo";
  riskLevel = RiskLevel.Dangerous;
}

test("ToolExecutor executes safe tools and wraps successful results", async () => {
  const registry = new ToolRegistry();
  registry.register(new EchoTool());
  const executor = new ToolExecutor(registry);

  const result = await executor.executeOne(new ToolCall("call_1", "echo", { value: "hi" }));

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { echoed: "hi" });
  assert.equal(result.toolCallId, "call_1");
});

test("ToolExecutor refuses dangerous tools by default", async () => {
  const registry = new ToolRegistry();
  registry.register(new DangerousTool());
  const executor = new ToolExecutor(registry);

  const result = await executor.executeOne(
    new ToolCall("call_2", "dangerous_echo", { value: "drop" }),
  );

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /DANGEROUS/);
});

test("ToolRegistry exports OpenAI-compatible tool schemas", () => {
  const registry = new ToolRegistry();
  registry.register(new EchoTool());

  assert.deepEqual(registry.toOpenAISchema(), [
    {
      type: "function",
      function: {
        name: "echo",
        description: "Echoes an input value",
        parameters: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
        },
      },
    },
  ]);
});
