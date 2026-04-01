/**
 * End-to-end integration test for the full pipeline:
 * Input → Sensor → Graph Activation → PFC Loop → Scratch Traces → Dreamer → Graph
 */
import { initDb, getDb } from "./db";
import { processTextInput } from "./sensor";
import { activate, getNodeCount, getRecentNodes } from "./graph";
import { runPFCLoop } from "./pfc";
import { writeScratch, readScratch, readUnconsolidated } from "./scratch";
import { consolidate, backlogSize } from "./dreamer";
import { generateId } from "./utils";

// Use a fresh test DB
process.env.BRAIN_DB_PATH = "file:test_e2e.db";

const sessionId = generateId();

async function run() {
  console.log("=== E2E Integration Test ===\n");

  // 1. Init
  console.log("1. Initializing database...");
  await initDb();
  const initialNodeCount = await getNodeCount();
  console.log(`   Graph: ${initialNodeCount} nodes (should be 0 for fresh DB)\n`);

  // 2. Sensor processing
  const input = "Bun is a JavaScript runtime built on JavaScriptCore. It was created by Jarred Sumner. It competes with Node.js and Deno.";
  console.log(`2. Processing input: "${input.slice(0, 60)}..."`);
  const sensorOutput = await processTextInput(input);
  console.log(`   Entities: ${sensorOutput.entities.map((e) => `${e.name} (${e.type})`).join(", ")}`);
  console.log(`   Embedding dims: ${sensorOutput.embedding.length}`);

  // 3. Graph activation (should be empty on cold start)
  console.log("\n3. Activating knowledge graph...");
  const activated = await activate(sensorOutput);
  console.log(`   Activated: ${activated.nodes.length} nodes (expected 0 on cold start)`);

  // 4. PFC Loop
  console.log("\n4. Running PFC loop...");
  const response = await runPFCLoop(sensorOutput, activated, sessionId);
  console.log(`   Response: "${response.slice(0, 150)}..."\n`);

  // 5. Simulate learnFromInteraction (writes scratch traces, NOT graph)
  console.log("5. Learning from interaction (writing to scratch, not graph)...");
  for (const entity of sensorOutput.entities) {
    await writeScratch(sessionId, "observation",
      `[entity:${entity.type}] ${entity.name} — mentioned in: "${input.slice(0, 200)}"`,
      { relatedNodeIds: [] }
    );
  }
  const entityNames = sensorOutput.entities.map((e) => e.name);
  if (entityNames.length > 1) {
    await writeScratch(sessionId, "observation",
      `[co_mention] Entities mentioned together: ${entityNames.join(", ")} — in: "${input.slice(0, 200)}"`
    );
  }

  // 6. Check state BEFORE dreamer
  const tracesBefore = await readScratch(sessionId);
  const nodesBefore = await getNodeCount();
  const backlog = await backlogSize();
  console.log(`   Scratch traces: ${tracesBefore.length}`);
  console.log(`   Unconsolidated backlog: ${backlog}`);
  console.log(`   Graph nodes: ${nodesBefore} (should still be 0 — Dreamer hasn't run)\n`);

  // 7. Run the Dreamer
  console.log("6. Running Dreamer consolidation...");
  const results = await consolidate();
  console.log(`   Consolidation results: ${results.length} traces processed`);
  const summary = results.reduce(
    (acc, r) => { acc[r.action] = (acc[r.action] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );
  console.log(`   Actions: ${JSON.stringify(summary)}`);

  // 8. Check state AFTER dreamer
  const nodesAfter = await getNodeCount();
  const recentNodes = await getRecentNodes(20);
  const remainingBacklog = await backlogSize();
  console.log(`\n7. Post-Dreamer state:`);
  console.log(`   Graph nodes: ${nodesAfter}`);
  console.log(`   Remaining backlog: ${remainingBacklog} (should be 0)`);
  console.log(`   Nodes in graph:`);
  for (const n of recentNodes) {
    console.log(`     [${n.type}] ${n.name}`);
  }

  // 9. Check edges
  const db = getDb();
  const edges = await db.execute("SELECT e.*, ns.name as src_name, nt.name as tgt_name FROM edges e JOIN nodes ns ON ns.id = e.source_id JOIN nodes nt ON nt.id = e.target_id");
  console.log(`   Edges: ${edges.rows.length}`);
  for (const e of edges.rows) {
    console.log(`     ${e.src_name} --[${e.relation}]--> ${e.tgt_name} (weight: ${e.weight})`);
  }

  // 10. Validation summary
  console.log("\n=== Validation ===");
  const pass = (label: string, ok: boolean) => console.log(`  ${ok ? "✅" : "❌"} ${label}`);

  pass("Sensor extracted entities", sensorOutput.entities.length > 0);
  pass("Cold start handled (no activation crash)", activated.nodes.length === 0);
  pass("PFC produced a response", response.length > 0);
  pass("Scratch traces written", tracesBefore.length > 0);
  pass("Graph was empty before Dreamer", nodesBefore === 0);
  pass("Dreamer processed traces", results.length > 0);
  pass("Graph has nodes after Dreamer", nodesAfter > 0);
  pass("Backlog cleared", remainingBacklog === 0);

  const allPassed = [
    sensorOutput.entities.length > 0,
    activated.nodes.length === 0,
    response.length > 0,
    tracesBefore.length > 0,
    nodesBefore === 0,
    results.length > 0,
    nodesAfter > 0,
    remainingBacklog === 0,
  ].every(Boolean);

  console.log(`\n${allPassed ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}`);

  // Cleanup
  await db.execute("DELETE FROM scratch_traces");
  await db.execute("DELETE FROM edges");
  await db.execute("DELETE FROM observations");
  await db.execute("DELETE FROM nodes");

  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
