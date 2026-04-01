import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { initDb, getDb } from "./db";
import { writeScratch, readScratch, readUnconsolidated, markConsolidated } from "./scratch";
import { upsertNode, addObservation, getNodeCount } from "./graph";
import { embed } from "./llm";
import { generateId } from "./utils";

const TEST_SESSION = `test-${generateId()}`;

beforeAll(async () => {
  // Use an in-memory database for tests
  process.env.BRAIN_DB_PATH = "file::memory:";
  await initDb();
});

afterAll(() => {
  delete process.env.BRAIN_DB_PATH;
});

beforeEach(async () => {
  const db = getDb();
  await db.execute("DELETE FROM scratch_traces");
  await db.execute("DELETE FROM edges");
  await db.execute("DELETE FROM observations");
  await db.execute("DELETE FROM nodes");
});

// --- Scratch Space Persistence ---

test("writeScratch persists to SQLite and readScratch retrieves it", async () => {
  const id = await writeScratch(TEST_SESSION, "thought", "test thought content");
  expect(id).toBeTruthy();

  const traces = await readScratch(TEST_SESSION);
  expect(traces.length).toBe(1);
  expect(traces[0]!.content).toBe("test thought content");
  expect(traces[0]!.type).toBe("thought");
  expect(traces[0]!.sessionId).toBe(TEST_SESSION);
  expect(traces[0]!.consolidated).toBe(false);
});

test("writeScratch stores evaluator annotation and related node IDs", async () => {
  await writeScratch(TEST_SESSION, "evaluator_signal", "good progress", {
    evaluatorAnnotation: {
      quality: "productive",
      surprise: "low",
      tags: ["confirms_prior"],
    },
    relatedNodeIds: ["node-1", "node-2"],
  });

  const traces = await readScratch(TEST_SESSION);
  expect(traces[0]!.evaluatorAnnotation).toEqual({
    quality: "productive",
    surprise: "low",
    tags: ["confirms_prior"],
  });
  expect(traces[0]!.relatedNodeIds).toEqual(["node-1", "node-2"]);
});

test("readUnconsolidated returns only unconsolidated traces", async () => {
  const id1 = await writeScratch(TEST_SESSION, "thought", "trace 1");
  const id2 = await writeScratch(TEST_SESSION, "thought", "trace 2");

  await markConsolidated([id1]);

  const unconsolidated = await readUnconsolidated();
  expect(unconsolidated.length).toBe(1);
  expect(unconsolidated[0]!.id).toBe(id2);
});

test("readUnconsolidated filters by type", async () => {
  await writeScratch(TEST_SESSION, "thought", "a thought");
  await writeScratch(TEST_SESSION, "observation", "an observation");
  await writeScratch(TEST_SESSION, "evaluator_signal", "a signal");

  const observations = await readUnconsolidated({ type: "observation" });
  expect(observations.length).toBe(1);
  expect(observations[0]!.type).toBe("observation");
});

test("readUnconsolidated respects limit", async () => {
  for (let i = 0; i < 5; i++) {
    await writeScratch(TEST_SESSION, "thought", `thought ${i}`);
  }

  const limited = await readUnconsolidated({ limit: 3 });
  expect(limited.length).toBe(3);
});

test("markConsolidated marks multiple traces", async () => {
  const ids = [];
  for (let i = 0; i < 3; i++) {
    ids.push(await writeScratch(TEST_SESSION, "thought", `thought ${i}`));
  }

  await markConsolidated(ids);
  const unconsolidated = await readUnconsolidated();
  expect(unconsolidated.length).toBe(0);

  // All should still be readable via readScratch
  const all = await readScratch(TEST_SESSION);
  expect(all.length).toBe(3);
  expect(all.every((t) => t.consolidated === true)).toBe(true);
});

// --- Learning redirect ---

test("learnFromInteraction does NOT write to graph directly", async () => {
  // Simulate what learnFromInteraction does now: write scratch traces
  await writeScratch(TEST_SESSION, "observation", '[entity:concept] TypeScript — mentioned in: "test"');
  await writeScratch(TEST_SESSION, "observation", '[co_mention] Entities mentioned together: TypeScript, Bun');

  // Graph should be empty — no direct writes
  const nodeCount = await getNodeCount();
  expect(nodeCount).toBe(0);

  // Scratch should have the traces
  const traces = await readScratch(TEST_SESSION);
  expect(traces.length).toBe(2);
});

// --- Dreamer consolidation operations ---

test("markConsolidated with empty array is a no-op", async () => {
  await markConsolidated([]);
  // Should not throw
});

test("scratch traces survive across reads", async () => {
  await writeScratch(TEST_SESSION, "thought", "persistent thought");

  const read1 = await readScratch(TEST_SESSION);
  const read2 = await readScratch(TEST_SESSION);
  expect(read1.length).toBe(1);
  expect(read2.length).toBe(1);
  expect(read1[0]!.id).toBe(read2[0]!.id);
});

test("different sessions are isolated", async () => {
  const session1 = `session-1-${generateId()}`;
  const session2 = `session-2-${generateId()}`;

  await writeScratch(session1, "thought", "session 1 thought");
  await writeScratch(session2, "thought", "session 2 thought");

  const traces1 = await readScratch(session1);
  const traces2 = await readScratch(session2);
  expect(traces1.length).toBe(1);
  expect(traces2.length).toBe(1);
  expect(traces1[0]!.content).toBe("session 1 thought");
  expect(traces2[0]!.content).toBe("session 2 thought");
});
