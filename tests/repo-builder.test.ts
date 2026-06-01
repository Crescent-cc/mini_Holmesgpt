import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildJavaRepoFixture } from "../src/fixtures/repo-builder.ts";
import { ToolCall } from "../src/tools/base.ts";
import { ToolExecutor } from "../src/tools/executor.ts";
import { createRagDiagnosticToolset } from "../src/tools/rag/index.ts";
import { ToolRegistry } from "../src/tools/registry.ts";

const testRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testRoot, "fixtures/java-rag-app");

test("buildJavaRepoFixture extracts Spring routes from Java controllers", async () => {
  const fixture = await buildJavaRepoFixture({
    repoRoot,
    id: "java-rag-app",
    name: "Java RAG app",
  });

  assert.deepEqual(fixture.springRoutes, [
    {
      method: "GET",
      path: "/api/rag-chat",
      handler: "RagChatController.listSessions",
      source: "app/src/main/java/demo/RagChatController.java:14",
    },
    {
      method: "POST",
      path: "/api/rag-chat/sessions/{sessionId}/messages/stream",
      handler: "RagChatController.sendMessageStream",
      source: "app/src/main/java/demo/RagChatController.java:19",
    },
    {
      method: "GET",
      path: "/api/rag-chat/sessions/{sessionId}",
      handler: "RagChatController.getSession",
      source: "app/src/main/java/demo/RagChatController.java:24",
    },
  ]);
});

test("buildJavaRepoFixture extracts frontend API calls and route mismatches", async () => {
  const fixture = await buildJavaRepoFixture({
    repoRoot,
    id: "java-rag-app",
    name: "Java RAG app",
  });

  assert.match(JSON.stringify(fixture.codeReferences), /POST \/api\/rag\/chat\/sessions\/\{sessionId\}\/messages\/stream/);
  assert.match(JSON.stringify(fixture.codeReferences), /GET \/api\/rag-chat/);
  assert.match(JSON.stringify(fixture.codeReferences), /GET \/api\/rag-chat\/sessions\/\{sessionId\}/);
  assert.match(JSON.stringify(fixture.codeReferences), /No matching Spring route/);
  assert.match(JSON.stringify(fixture.codeReferences), /closest Spring route: POST \/api\/rag-chat\/sessions\/\{sessionId\}\/messages\/stream/);
  assert.doesNotMatch(JSON.stringify(fixture.codeReferences), /No matching Spring route for GET \/api\/rag-chat/);
  assert.deepEqual(fixture.routeContracts?.map((contract) => ({
    frontend: `${contract.frontend.method} ${contract.frontend.path}`,
    matched: contract.matched,
    mismatchType: contract.mismatchType,
    closest: contract.closestBackendRoute
      ? `${contract.closestBackendRoute.method} ${contract.closestBackendRoute.path}`
      : null,
  })), [
    {
      frontend: "GET /api/rag-chat",
      matched: true,
      mismatchType: "none",
      closest: null,
    },
    {
      frontend: "POST /api/rag/chat/sessions/{sessionId}/messages/stream",
      matched: false,
      mismatchType: "similar_path_mismatch",
      closest: "POST /api/rag-chat/sessions/{sessionId}/messages/stream",
    },
    {
      frontend: "GET /api/rag-chat/sessions/{sessionId}",
      matched: true,
      mismatchType: "none",
      closest: null,
    },
  ]);
});

test("buildJavaRepoFixture extracts RAG prompt and config evidence", async () => {
  const fixture = await buildJavaRepoFixture({
    repoRoot,
    id: "java-rag-app",
    name: "Java RAG app",
  });

  assert.match(JSON.stringify(fixture.codeReferences), /knowledgebase-query-system\.st/);
  assert.match(JSON.stringify(fixture.codeReferences), /不编造/);
  assert.match(JSON.stringify(fixture.codeReferences), /app\.ai\.rag\.search\.topk-short=20/);
  assert.match(JSON.stringify(fixture.codeReferences), /app\.ai\.rag\.search\.min-score-default=0\.28/);
});

test("repo-built fixture can feed inspect_route_contract through the RAG toolset", async () => {
  const fixture = await buildJavaRepoFixture({
    repoRoot,
    id: "java-rag-app",
    name: "Java RAG app",
  });
  const registry = new ToolRegistry();
  registry.registerToolset(createRagDiagnosticToolset(fixture));
  const executor = new ToolExecutor(registry);

  const result = await executor.executeOne(
    new ToolCall("call_route_contract", "inspect_route_contract", {
      path: "/api/rag/chat",
      mismatchOnly: true,
    }),
  );

  assert.equal(result.success, true);
  assert.match(JSON.stringify(result.data), /similar_path_mismatch/);
  assert.match(JSON.stringify(result.data), /frontend\/src\/api\/ragChat\.ts/);
  assert.match(JSON.stringify(result.data), /RagChatController\.sendMessageStream/);
});
