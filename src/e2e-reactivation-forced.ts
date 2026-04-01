/**
 * E2E test that actually triggers reactivation.
 *
 * Strategy: Seed the graph with knowledge that CONTRADICTS what the PFC will
 * find when it investigates. The PFC will predict one thing, the effector will
 * return something different, and the evaluator should flag high surprise →
 * triggering reactivation.
 *
 * Setup:
 * 1. Seed graph: "Project Nexus status is blocked by auth dependency"
 * 2. Create a file that says "Project Nexus shipped to production yesterday"
 * 3. Ask: "What's the status of Project Nexus?"
 * 4. The PFC sees "blocked" in its activated context, but when it investigates
 *    the file it finds "shipped" — that's a contradiction → high surprise →
 *    reactivation should fire.
 */
import { initDb, getDb } from "./db";
import { processTextInput } from "./sensor";
import { activate, upsertNode, addObservation, addEdge, getNodeCount } from "./graph";
import { runPFCLoop } from "./pfc";
import { readScratch } from "./scratch";
import { consolidate } from "./dreamer";
import { embed } from "./llm";
import { resetStaleState } from "./evaluator";
import { generateId } from "./utils";
import { writeFileSync, mkdirSync, rmSync } from "fs";

process.env.BRAIN_DB_PATH = "file:test_reactivation_forced.db";

const TEMP_DIR = "/tmp/brain-e2e-reactivation";

async function run() {
  console.log("=== E2E Forced Reactivation Test ===\n");

  await initDb();
  const db = getDb();

  // Clean slate
  await db.execute("DELETE FROM scratch_traces");
  await db.execute("DELETE FROM edges");
  await db.execute("DELETE FROM observations");
  await db.execute("DELETE FROM nodes");

  // --- Step 1: Seed graph with STALE knowledge ---
  console.log("1. Seeding graph with stale knowledge...");

  const nexus = await upsertNode("Project Nexus", "project");
  const auth = await upsertNode("auth dependency", "dependency");
  const nexusEmb = await embed("Project Nexus status blocked");
  const authEmb = await embed("auth dependency blocker");

  await addObservation(nexus.id, "Project Nexus is blocked by the auth dependency. Cannot proceed until auth team resolves the issue.", nexusEmb);
  await addObservation(auth.id, "The auth dependency has a critical bug that blocks Project Nexus deployment.", authEmb);
  await addEdge(nexus.id, auth.id, "blocked_by", 0.8);

  const nodeCount = await getNodeCount();
  console.log(`   Graph: ${nodeCount} nodes, knowledge says Nexus is BLOCKED\n`);

  // --- Step 2: Create a file with CONTRADICTING information ---
  console.log("2. Creating file with contradicting info...");
  mkdirSync(TEMP_DIR, { recursive: true });
  writeFileSync(`${TEMP_DIR}/nexus-status.txt`, `
PROJECT NEXUS — STATUS UPDATE
Date: 2026-03-31

Status: SHIPPED TO PRODUCTION ✅

The auth dependency was resolved on March 28th. The team deployed Nexus
to production on March 30th. All integration tests passing. Performance
metrics are within expected bounds.

Key metrics post-launch:
- P99 latency: 45ms
- Error rate: 0.02%
- Active users: 12,400
`);
  console.log(`   Written: ${TEMP_DIR}/nexus-status.txt\n`);

  // --- Step 3: Ask about Nexus with enough iterations for investigation ---
  console.log("3. Asking about Project Nexus (max 8 iterations)...\n");
  resetStaleState();
  const sid = generateId();
  const query = `What's the current status of Project Nexus? Check the status file at ${TEMP_DIR}/nexus-status.txt`;

  const sensor = await processTextInput(query);
  console.log(`   Entities: ${sensor.entities.map((e) => `${e.name} (${e.type})`).join(", ")}`);

  const activated = await activate(sensor);
  console.log(`   Activated: ${activated.nodes.length} nodes`);
  for (const n of activated.nodes) {
    console.log(`     [${n.node.type}] ${n.node.name} (score: ${n.activationScore.toFixed(3)})`);
    for (const obs of n.relevantObservations) {
      console.log(`       obs: "${obs.content.slice(0, 80)}..."`);
    }
  }
  console.log();

  const response = await runPFCLoop(sensor, activated, sid);
  console.log(`\n   Final response: "${response.slice(0, 400)}"\n`);

  // --- Step 4: Check what happened ---
  const traces = await readScratch(sid);
  const reactivationTraces = traces.filter((t) => t.content.includes("[REACTIVATION"));
  const redirectTraces = traces.filter((t) => t.content.includes("[redirect]"));
  const evalTraces = traces.filter((t) => t.type === "evaluator_signal");

  console.log("=== Trace Analysis ===");
  console.log(`  Total traces: ${traces.length}`);
  console.log(`  Evaluator signals: ${evalTraces.length}`);
  console.log(`  Reactivation events: ${reactivationTraces.length}`);
  console.log(`  Redirect events: ${redirectTraces.length}`);

  if (evalTraces.length > 0) {
    console.log("\n  Evaluator signals:");
    for (const t of evalTraces) console.log(`    ${t.content.slice(0, 150)}`);
  }

  if (reactivationTraces.length > 0) {
    console.log("\n  Reactivation details:");
    for (const t of reactivationTraces) console.log(`    ${t.content.slice(0, 200)}`);
  }

  console.log("\n=== Validation ===");
  const pass = (label: string, ok: boolean) => console.log(`  ${ok ? "✅" : "❌"} ${label}`);

  pass("PFC produced a response", response.length > 0);
  pass("Response mentions shipped/production/deployed", /ship|production|deploy|launched/i.test(response));
  pass("Response acknowledges the status change (was blocked, now shipped)", /block|was|previously|changed|resolved|updated/i.test(response));

  if (reactivationTraces.length > 0) {
    pass("Reactivation triggered on surprise", true);
  } else {
    console.log("  ❌ Reactivation did NOT trigger — the evaluator didn't flag high surprise");
    console.log("     This means the code path is untested.");
  }

  // Cleanup
  rmSync(TEMP_DIR, { recursive: true, force: true });
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
