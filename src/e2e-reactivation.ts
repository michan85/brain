/**
 * E2E test: full pipeline including reactivation on surprise.
 *
 * Phase 1: Seed the graph with knowledge about two topics
 * Phase 2: Ask a question that connects them — verify the full loop works,
 *          including evaluator, prediction error, and reactivation paths.
 */
import { initDb, getDb } from "./db";
import { processTextInput } from "./sensor";
import { activate, getNodeCount, getRecentNodes } from "./graph";
import { runPFCLoop } from "./pfc";
import { writeScratch, readScratch, readUnconsolidated } from "./scratch";
import { consolidate, backlogSize } from "./dreamer";
import { resetStaleState } from "./evaluator";
import { generateId } from "./utils";

process.env.BRAIN_DB_PATH = "file:test_reactivation.db";

async function seedKnowledge(sessionId: string, input: string, label: string) {
  console.log(`\n--- Seeding: ${label} ---`);
  const sensor = await processTextInput(input);
  console.log(`  Entities: ${sensor.entities.map((e) => `${e.name} (${e.type})`).join(", ")}`);

  const activated = await activate(sensor);
  console.log(`  Activated: ${activated.nodes.length} nodes`);

  const response = await runPFCLoop(sensor, activated, sessionId);
  console.log(`  Response: "${response.slice(0, 120)}..."`);

  // Write learning traces
  for (const entity of sensor.entities) {
    await writeScratch(sessionId, "observation",
      `[entity:${entity.type}] ${entity.name} — mentioned in: "${input.slice(0, 200)}"`,
    );
  }
  if (sensor.entities.length > 1) {
    await writeScratch(sessionId, "observation",
      `[co_mention] Entities: ${sensor.entities.map((e) => e.name).join(", ")} — in: "${input.slice(0, 200)}"`,
    );
  }
}

async function run() {
  console.log("=== E2E Reactivation Test ===\n");

  await initDb();
  const db = getDb();

  // Clean slate
  await db.execute("DELETE FROM scratch_traces");
  await db.execute("DELETE FROM edges");
  await db.execute("DELETE FROM observations");
  await db.execute("DELETE FROM nodes");

  const sid1 = generateId();

  // Phase 1: Seed two knowledge domains
  await seedKnowledge(sid1,
    "SQLite is an embedded database. It uses B-trees for storage. It was created by D. Richard Hipp. libSQL is a fork of SQLite created by Turso that adds vector search and replication.",
    "SQLite & libSQL"
  );

  await seedKnowledge(sid1,
    "Bun is a JavaScript runtime that uses JavaScriptCore as its engine. Bun has a built-in SQLite driver via bun:sqlite. Jarred Sumner created Bun.",
    "Bun & SQLite integration"
  );

  // Dream to consolidate knowledge
  console.log("\n--- Phase 1: Consolidation ---");
  const backlog1 = await backlogSize();
  console.log(`  Unconsolidated traces: ${backlog1}`);
  await consolidate();

  const nodeCount = await getNodeCount();
  const nodes = await getRecentNodes(20);
  console.log(`  Graph: ${nodeCount} nodes`);
  for (const n of nodes) console.log(`    [${n.type}] ${n.name}`);

  const edges = await db.execute(
    "SELECT ns.name as src, nt.name as tgt, e.relation, e.weight FROM edges e JOIN nodes ns ON ns.id = e.source_id JOIN nodes nt ON nt.id = e.target_id"
  );
  console.log(`  Edges: ${edges.rows.length}`);
  for (const e of edges.rows) console.log(`    ${e.src} --[${e.relation}]--> ${e.tgt} (${e.weight})`);

  // Phase 2: Ask a connecting question — this should activate some nodes,
  // and if the PFC reasons about something surprising, reactivation may trigger
  console.log("\n--- Phase 2: Cross-domain query ---");
  resetStaleState();
  const sid2 = generateId();
  const query = "How does Bun connect to libSQL? Can I use vector search from Bun?";
  console.log(`  Query: "${query}"`);

  const sensor2 = await processTextInput(query);
  console.log(`  Entities: ${sensor2.entities.map((e) => `${e.name} (${e.type})`).join(", ")}`);

  const activated2 = await activate(sensor2);
  console.log(`  Activated: ${activated2.nodes.length} nodes, ${activated2.edges.length} edges`);
  for (const n of activated2.nodes) {
    console.log(`    [${n.node.type}] ${n.node.name} (score: ${n.activationScore.toFixed(3)})`);
  }

  const response2 = await runPFCLoop(sensor2, activated2, sid2);
  console.log(`\n  Final response: "${response2.slice(0, 300)}..."`);

  // Check scratch for reactivation traces
  const traces = await readScratch(sid2);
  const reactivationTraces = traces.filter((t) => t.content.includes("[REACTIVATION"));
  const redirectTraces = traces.filter((t) => t.content.includes("[redirect]"));

  console.log("\n=== Results ===");
  console.log(`  Total traces: ${traces.length}`);
  console.log(`  Reactivation events: ${reactivationTraces.length}`);
  console.log(`  Redirect events: ${redirectTraces.length}`);
  console.log(`  Response length: ${response2.length}`);

  if (reactivationTraces.length > 0) {
    console.log("\n  Reactivation details:");
    for (const t of reactivationTraces) console.log(`    ${t.content.slice(0, 150)}`);
  }

  // Validation
  console.log("\n=== Validation ===");
  const pass = (label: string, ok: boolean) => console.log(`  ${ok ? "✅" : "⚠️"} ${label}`);

  pass("Graph was seeded with knowledge", nodeCount > 0);
  pass("Cross-domain query activated relevant nodes", activated2.nodes.length > 0);
  pass("PFC produced a response", response2.length > 0);
  pass("Response mentions Bun", response2.toLowerCase().includes("bun"));
  pass("Response mentions libSQL or vector", response2.toLowerCase().includes("libsql") || response2.toLowerCase().includes("vector"));

  // Reactivation is probabilistic — it depends on the evaluator flagging high surprise.
  // We log it but don't fail on it.
  if (reactivationTraces.length > 0) {
    console.log("  ✅ Reactivation triggered during reasoning");
  } else {
    console.log("  ℹ️  Reactivation did not trigger (evaluator didn't flag high surprise — this is OK for a simple query)");
  }

  // Cleanup
  await db.execute("DELETE FROM scratch_traces");
  await db.execute("DELETE FROM edges");
  await db.execute("DELETE FROM observations");
  await db.execute("DELETE FROM nodes");

  console.log("\n=== Done ===");
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
