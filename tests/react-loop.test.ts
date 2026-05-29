import test from "node:test";
import assert from "node:assert/strict";

import { ContextManager } from "../src/agent/context.ts";
import { LLMResponse, type LLMClientLike } from "../src/agent/llm-client.ts";
import { ReActLoop } from "../src/agent/react-loop.ts";
import { ObservationCompressor } from "../src/observe/compressor.ts";
import { InMemoryEvidenceStore } from "../src/observe/evidence-store.ts";
import { BaseTool } from "../src/tools/base.ts";
import { ToolExecutor } from "../src/tools/executor.ts";
import { ToolRegistry } from "../src/tools/registry.ts";

class InspectTool extends BaseTool<{ target: string }, { status: string }> {
  name = "inspect";
  description = "Inspects a target";
  parameters = {
    type: "object",
    properties: { target: { type: "string" } },
    required: ["target"],
  };

  async run(args: { target: string }) {
    return { status: `${args.target}:ok` };
  }
}

class ScriptedLLM implements LLMClientLike {
  calls = 0;

  async chat() {
    this.calls += 1;
    if (this.calls === 1) {
      return new LLMResponse(null, [
        {
          id: "call_1",
          type: "function",
          function: { name: "inspect", arguments: "{\"target\":\"rag\"}" },
        },
      ]);
    }
    return new LLMResponse("根因分析：已确认。");
  }
}

test("ReActLoop executes tool calls, stores evidence, and returns final answer", async () => {
  const registry = new ToolRegistry();
  registry.register(new InspectTool());
  const evidenceStore = new InMemoryEvidenceStore();
  const loop = new ReActLoop({
    llmClient: new ScriptedLLM(),
    toolExecutor: new ToolExecutor(registry),
    contextManager: new ContextManager("system"),
    compressor: new ObservationCompressor(),
    evidenceStore,
  });

  const result = await loop.runResult("RAG 挂了");

  assert.equal(result.answer, "根因分析：已确认。");
  assert.equal(result.iterations, 2);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.success, true);
  assert.equal(result.evidenceIds.length, 1);
  assert.equal(evidenceStore.list().length, 1);
});
