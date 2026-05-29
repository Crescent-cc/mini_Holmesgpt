import test from "node:test";
import assert from "node:assert/strict";

import { ContextManager } from "../src/agent/context.ts";

test("ContextManager exports OpenAI messages without null fields", () => {
  const context = new ContextManager("system");
  context.addUserMessage("hello");
  context.addAssistantMessage(null, [
    {
      id: "call_1",
      type: "function",
      function: { name: "inspect", arguments: "{}" },
    },
  ]);
  context.addToolResult("call_1", "inspect", "result");

  assert.deepEqual(context.getMessages(), [
    { role: "system", content: "system" },
    { role: "user", content: "hello" },
    {
      role: "assistant",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "inspect", arguments: "{}" },
        },
      ],
    },
    { role: "tool", content: "result", tool_call_id: "call_1", name: "inspect" },
  ]);
});

test("ContextManager prunes whole rounds without splitting assistant tool pairs", () => {
  const context = new ContextManager("system", { maxRounds: 1 });
  context.addUserMessage("old question");
  context.addAssistantMessage(null, [
    {
      id: "old_call",
      type: "function",
      function: { name: "inspect", arguments: "{}" },
    },
  ]);
  context.addToolResult("old_call", "inspect", "old result");
  context.addUserMessage("new question");
  context.addAssistantMessage("new answer");

  assert.deepEqual(context.getMessages(), [
    { role: "system", content: "system" },
    { role: "user", content: "new question" },
    { role: "assistant", content: "new answer" },
  ]);
});
