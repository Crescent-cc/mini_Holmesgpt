import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildJavaRepoFixture } from "../src/fixtures/repo-builder.ts";

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
