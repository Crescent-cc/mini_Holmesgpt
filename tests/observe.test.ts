import test from "node:test";
import assert from "node:assert/strict";

import { ObservationCompressor } from "../src/observe/compressor.ts";
import { InMemoryEvidenceStore } from "../src/observe/evidence-store.ts";
import { ToolResult } from "../src/tools/base.ts";

test("ObservationCompressor keeps explain output focused on key fields", () => {
  const compressor = new ObservationCompressor({ maxChars: 1000 });
  const text = compressor.compress("explain_query", {
    table: "orders",
    type: "ALL",
    key: null,
    rows: 1200,
    ignored: "noise",
  });

  assert.match(text, /orders/);
  assert.match(text, /ALL/);
  assert.doesNotMatch(text, /ignored/);
});

test("InMemoryEvidenceStore saves complete tool results with generated ids", () => {
  const store = new InMemoryEvidenceStore();
  const record = store.saveToolResult(
    new ToolResult("call_1", "query_logs", true, { rows: [1, 2, 3] }),
    { iteration: 2 },
  );

  assert.match(record.id, /^ev_/);
  assert.equal(record.toolName, "query_logs");
  assert.deepEqual(store.get(record.id)?.data, { rows: [1, 2, 3] });
  assert.deepEqual(store.list().map((item) => item.id), [record.id]);
});
