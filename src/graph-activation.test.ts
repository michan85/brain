import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { initDb, getDb } from "./db";
import { upsertNode, addObservation, activate } from "./graph";
import { embed } from "./llm";

beforeAll(async () => {
  process.env.BRAIN_DB_PATH = "file::memory:";
  await initDb();
});

afterAll(() => {
  delete process.env.BRAIN_DB_PATH;
});

beforeEach(async () => {
  const db = getDb();
  await db.execute("DELETE FROM edges");
  await db.execute("DELETE FROM observations");
  await db.execute("DELETE FROM nodes");
});

test("greeting message does not activate unrelated nodes", async () => {
  // Seed: a technical node completely unrelated to greetings
  const node = await upsertNode("database-migration", "task");
  const obsEmbedding = await embed(
    "Migrate PostgreSQL schema from v3 to v4 with zero downtime using blue-green deployment"
  );
  await addObservation(
    node.id,
    "Migrate PostgreSQL schema from v3 to v4 with zero downtime using blue-green deployment",
    obsEmbedding,
    0.9
  );

  // Query: a generic greeting — semantically unrelated
  const queryEmbedding = await embed("hi");
  const result = await activate({
    modality: "text",
    timestamp: Date.now(),
    raw: "hi",
    entities: [],
    embedding: queryEmbedding,
    metadata: {},
    urgency: 0.5,
  });

  expect(result.nodes.length).toBe(0);
});

test("relevant query activates matching nodes", async () => {
  // Seed: same technical node
  const node = await upsertNode("database-migration", "task");
  const obsEmbedding = await embed(
    "Migrate PostgreSQL schema from v3 to v4 with zero downtime using blue-green deployment"
  );
  await addObservation(
    node.id,
    "Migrate PostgreSQL schema from v3 to v4 with zero downtime using blue-green deployment",
    obsEmbedding,
    0.9
  );

  // Query: semantically related
  const queryEmbedding = await embed("How do I migrate the database schema?");
  const result = await activate({
    modality: "text",
    timestamp: Date.now(),
    raw: "How do I migrate the database schema?",
    entities: [],
    embedding: queryEmbedding,
    metadata: {},
    urgency: 0.5,
  });

  expect(result.nodes.length).toBeGreaterThanOrEqual(1);
  expect(result.nodes[0]!.node.name).toBe("database-migration");
});
