import test from "node:test";
import assert from "node:assert/strict";

import { createRagDiagnosticToolset } from "../src/tools/rag/index.ts";
import type { RagDiagnosticFixture } from "../src/tools/rag/fixtures.ts";
import { ToolCall } from "../src/tools/base.ts";
import { ToolExecutor } from "../src/tools/executor.ts";
import { ToolRegistry } from "../src/tools/registry.ts";

const fixture: RagDiagnosticFixture = {
  id: "interview-guide-rag-404",
  name: "interview-guide RAG path mismatch",
  logs: [
    {
      timestamp: "2026-04-06T10:15:12.000Z",
      service: "frontend",
      level: "error",
      message: "POST /api/rag/chat/sessions/42/messages/stream failed with 404",
      requestId: "req_404",
    },
  ],
  gatewayRoutes: [
    {
      id: "rag-chat",
      path: "/api/rag-chat/**",
      target: "interview-guide-app:8080",
    },
  ],
  springRoutes: [
    {
      method: "POST",
      path: "/api/rag-chat/sessions/{sessionId}/messages/stream",
      handler: "RagChatController.sendMessageStream",
      source: "app/src/main/java/interview/guide/modules/knowledgebase/RagChatController.java:101",
    },
  ],
  codeReferences: [
    {
      path: "frontend/src/api/ragChat.ts",
      line: 91,
      symbol: "sendMessageStream",
      snippet: "fetch(`${API_BASE_URL}/api/rag/chat/sessions/${sessionId}/messages/stream`, ...)",
    },
    {
      path: "app/src/main/java/interview/guide/modules/knowledgebase/RagChatController.java",
      line: 101,
      symbol: "sendMessageStream",
      snippet: "@PostMapping(value = \"/api/rag-chat/sessions/{sessionId}/messages/stream\")",
    },
  ],
  routeContracts: [
    {
      frontend: {
        method: "POST",
        path: "/api/rag/chat/sessions/{sessionId}/messages/stream",
        source: "frontend/src/api/ragChat.ts",
        line: 91,
        snippet: "fetch(`${API_BASE_URL}/api/rag/chat/sessions/${sessionId}/messages/stream`, ...)",
      },
      matched: false,
      mismatchType: "similar_path_mismatch",
      closestBackendRoute: {
        method: "POST",
        path: "/api/rag-chat/sessions/{sessionId}/messages/stream",
        handler: "RagChatController.sendMessageStream",
        source: "app/src/main/java/interview/guide/modules/knowledgebase/RagChatController.java:101",
      },
      summary: "No matching Spring route for POST /api/rag/chat/sessions/{sessionId}/messages/stream; closest Spring route: POST /api/rag-chat/sessions/{sessionId}/messages/stream",
    },
  ],
  ragTraces: [
    {
      id: "trace_empty",
      requestId: "req_empty",
      question: "Redis",
      rewrittenQuery: "Redis 缓存与限流相关面试题",
      knowledgeBaseIds: [7],
      searchParams: { topK: 20, minScore: 0.25 },
      vectorHits: [],
      answer: "抱歉，在选定的知识库中未检索到相关信息。请换一个更具体的关键词或补充上下文后再试。",
      failureLabel: "empty_retrieval",
    },
  ],
  vectorSearches: [
    {
      query: "Redis 缓存与限流相关面试题",
      knowledgeBaseIds: [7],
      topK: 20,
      minScore: 0.25,
      hits: [],
    },
  ],
};

test("RAG diagnostic toolset registers Holmes-style read-only tools", () => {
  const toolset = createRagDiagnosticToolset(fixture);
  const registry = new ToolRegistry();

  registry.registerToolset(toolset);

  assert.equal(toolset.name, "rag-diagnostics");
  assert.deepEqual(registry.toolNames.sort(), [
    "inspect_rag_trace",
    "inspect_route_contract",
    "list_gateway_routes",
    "list_spring_routes",
    "search_code",
    "search_logs",
    "search_vector_hits",
  ]);
  assert.deepEqual(registry.toolsetDescriptions, [
    {
      name: "rag-diagnostics",
      description: "Read-only tools for investigating RAG API, retrieval, and grounding failures.",
      enabled: true,
      tools: registry.toolNames,
    },
  ]);
});

test("RAG diagnostic tools expose route contract mismatches as first-class evidence", async () => {
  const registry = new ToolRegistry();
  registry.registerToolset(createRagDiagnosticToolset(fixture));
  const executor = new ToolExecutor(registry);

  const contractResult = await executor.executeOne(
    new ToolCall("call_contract", "inspect_route_contract", {
      path: "/api/rag/chat",
      mismatchOnly: true,
    }),
  );

  assert.equal(contractResult.success, true);
  assert.match(JSON.stringify(contractResult.data), /similar_path_mismatch/);
  assert.match(JSON.stringify(contractResult.data), /\/api\/rag\/chat\/sessions/);
  assert.match(JSON.stringify(contractResult.data), /\/api\/rag-chat\/sessions/);
});

test("RAG diagnostic tools expose path evidence for a 404 investigation", async () => {
  const registry = new ToolRegistry();
  registry.registerToolset(createRagDiagnosticToolset(fixture));
  const executor = new ToolExecutor(registry);

  const logResult = await executor.executeOne(
    new ToolCall("call_1", "search_logs", { query: "/api/rag/chat", limit: 5 }),
  );
  const codeResult = await executor.executeOne(
    new ToolCall("call_2", "search_code", { query: "/api/rag/chat" }),
  );
  const springResult = await executor.executeOne(
    new ToolCall("call_3", "list_spring_routes", { path: "/api/rag-chat" }),
  );
  const gatewayResult = await executor.executeOne(
    new ToolCall("call_4", "list_gateway_routes", { path: "/api/rag/chat" }),
  );

  assert.equal(logResult.success, true);
  assert.match(JSON.stringify(logResult.data), /404/);
  assert.match(JSON.stringify(codeResult.data), /frontend\/src\/api\/ragChat\.ts/);
  assert.match(JSON.stringify(springResult.data), /RagChatController\.sendMessageStream/);
  assert.match(JSON.stringify(gatewayResult.data), /no gateway route matched/);
});

test("RAG diagnostic tools expose retrieval trace and vector evidence", async () => {
  const registry = new ToolRegistry();
  registry.registerToolset(createRagDiagnosticToolset(fixture));
  const executor = new ToolExecutor(registry);

  const traceResult = await executor.executeOne(
    new ToolCall("call_5", "inspect_rag_trace", { requestId: "req_empty" }),
  );
  const vectorResult = await executor.executeOne(
    new ToolCall("call_6", "search_vector_hits", {
      query: "Redis 缓存与限流相关面试题",
      knowledgeBaseIds: [7],
    }),
  );

  assert.equal(traceResult.success, true);
  assert.match(JSON.stringify(traceResult.data), /empty_retrieval/);
  assert.match(JSON.stringify(traceResult.data), /topK/);
  assert.equal(vectorResult.success, true);
  assert.match(JSON.stringify(vectorResult.data), /0 vector hits/);
});
