/**
 * Manual run of eval scenario I02: Surprise-Driven Reactivation
 *
 * Seeds the graph with AuthService knowledge (v3.2.1, stable),
 * stages a health check file showing v4.0.0-rc1 with Keycloak,
 * and asks "check on AuthService for me".
 *
 * Expected: prediction error → high surprise → reactivation pulls in migration RFC
 */
import { initDb, getDb } from "./db";
import { processTextInput } from "./sensor";
import { activate, upsertNode, addObservation, addEdge } from "./graph";
import { runPFCLoop } from "./pfc";
import { readScratch } from "./scratch";
import { embed } from "./llm";
import { resetStaleState } from "./evaluator";
import { generateId } from "./utils";
import { mkdirSync, writeFileSync, rmSync } from "fs";

process.env.BRAIN_DB_PATH = "file:test_i02.db";

const graphJson = {
  nodes: [
    {
      name: "auth-service",
      type: "service",
      observations: [
        { content: "AuthService handles all authentication for the customer-facing platform. Runs on Kubernetes namespace 'auth-prod'.", confidence: 0.9 },
        { content: "AuthService uses Redis for session storage. Redis cluster: redis-auth-prod-01.", confidence: 0.9 },
        { content: "AuthService current version: v3.2.1, deployed 2026-02-15. Stable, no known issues.", confidence: 0.85 },
        { content: "AuthService health status can be checked by reading the file /tmp/brain-eval-i02/healthz.json.", confidence: 0.9 },
      ],
    },
    {
      name: "redis-auth-cluster",
      type: "infrastructure",
      observations: [
        { content: "redis-auth-prod-01 is a 3-node Redis Sentinel cluster. Last failover: 2025-11-03.", confidence: 0.85 },
        { content: "Redis auth cluster memory utilization typically runs at 40-55%.", confidence: 0.8 },
      ],
    },
    {
      name: "k8s-auth-namespace",
      type: "infrastructure",
      observations: [
        { content: "Kubernetes namespace 'auth-prod' hosts AuthService and its sidecar proxies.", confidence: 0.85 },
        { content: "auth-prod namespace has a PodDisruptionBudget requiring minAvailable: 2.", confidence: 0.8 },
      ],
    },
    {
      name: "auth-migration-rfc",
      type: "document",
      observations: [
        { content: "RFC-2024-041 proposes migrating AuthService from custom token validation to OpenID Connect via Keycloak. Status: approved, target Q1 2026.", confidence: 0.9 },
        { content: "The migration involves replacing the /auth/token endpoint and adding Keycloak as an upstream dependency.", confidence: 0.85 },
      ],
    },
  ],
  edges: [
    { source: "auth-service", target: "redis-auth-cluster", relation: "depends_on", weight: 0.9 },
    { source: "auth-service", target: "k8s-auth-namespace", relation: "deployed_in", weight: 0.9 },
    { source: "auth-service", target: "auth-migration-rfc", relation: "subject_of", weight: 0.7 },
  ],
};

const healthzJson = {
  status: "healthy",
  version: "v4.0.0-rc1",
  uptime_seconds: 3847,
  dependencies: {
    keycloak: "connected",
    redis: "connected",
  },
};

async function seedGraph() {
  const nodeMap = new Map<string, string>(); // name → id

  for (const node of graphJson.nodes) {
    const n = await upsertNode(node.name, node.type);
    nodeMap.set(node.name, n.id);

    for (const obs of node.observations) {
      const obsEmb = await embed(`${node.name}: ${obs.content}`);
      await addObservation(n.id, obs.content, obsEmb, obs.confidence);
    }
  }

  for (const edge of graphJson.edges) {
    const sourceId = nodeMap.get(edge.source);
    const targetId = nodeMap.get(edge.target);
    if (sourceId && targetId) {
      await addEdge(sourceId, targetId, edge.relation, edge.weight);
    }
  }

  return nodeMap;
}

async function run() {
  console.log("=== I02: Surprise-Driven Reactivation ===\n");

  await initDb();
  const db = getDb();

  // Clean slate
  await db.execute("DELETE FROM scratch_traces");
  await db.execute("DELETE FROM edges");
  await db.execute("DELETE FROM observations");
  await db.execute("DELETE FROM nodes");

  // Step 1: Seed graph
  console.log("1. Seeding knowledge graph...");
  const nodeMap = await seedGraph();
  console.log(`   Nodes: ${nodeMap.size}`);
  for (const [name, id] of nodeMap) console.log(`     ${name} → ${id.slice(0, 8)}`);

  // Step 2: Stage health check file
  console.log("\n2. Staging context files...");
  mkdirSync("/tmp/brain-eval-i02", { recursive: true });
  writeFileSync("/tmp/brain-eval-i02/healthz.json", JSON.stringify(healthzJson, null, 2));
  console.log("   Written: /tmp/brain-eval-i02/healthz.json");
  console.log(`   Content: ${JSON.stringify(healthzJson)}`);

  // Step 3: Run the agent
  console.log("\n3. Sending prompt...\n");
  resetStaleState();
  const sid = generateId();
  const prompt = "Can you check on AuthService for me? I want to make sure it's healthy.";

  const sensor = await processTextInput(prompt);
  console.log(`   Entities: ${sensor.entities.map((e) => `${e.name} (${e.type})`).join(", ")}`);

  const activated = await activate(sensor);
  console.log(`   Initial activation: ${activated.nodes.length} nodes`);
  for (const n of activated.nodes) {
    console.log(`     [${n.node.type}] ${n.node.name} (score: ${n.activationScore.toFixed(3)}, hops: ${n.hopsFromSeed})`);
    for (const obs of n.relevantObservations) {
      console.log(`       "${obs.content.slice(0, 80)}..."`);
    }
  }
  console.log();

  const response = await runPFCLoop(sensor, activated, sid);

  // Step 4: Analyze
  console.log(`\n4. Final response:\n"${response}"\n`);

  const traces = await readScratch(sid);
  const thoughts = traces.filter((t) => t.type === "thought");
  const actions = traces.filter((t) => t.type === "action_result");
  const evals = traces.filter((t) => t.type === "evaluator_signal");
  const reactivations = traces.filter((t) => t.content.includes("[REACTIVATION"));

  console.log("=== Trace Summary ===");
  console.log(`  Thoughts: ${thoughts.length}`);
  console.log(`  Actions: ${actions.length}`);
  console.log(`  Evaluator signals: ${evals.length}`);
  console.log(`  Reactivation events: ${reactivations.length}`);

  console.log("\n  All evaluator signals:");
  for (const e of evals) console.log(`    ${e.content.slice(0, 200)}`);

  if (reactivations.length > 0) {
    console.log("\n  Reactivation details:");
    for (const r of reactivations) console.log(`    ${r.content.slice(0, 200)}`);
  }

  console.log("\n=== Grading (I02 criteria) ===");
  const pass = (label: string, ok: boolean) => console.log(`  ${ok ? "✅" : "❌"} ${label}`);

  // D4: Prediction calibration — did PFC predict v3.2.1?
  const actionTraces = traces.filter((t) => t.type === "action_result");
  // D5: Reactivation — did it fire?
  pass("D5: Reactivation fired", reactivations.length > 0);
  // D6: Self-correction — does response mention version change?
  pass("D6: Response mentions version change (v3.2.1 → v4.0.0)", /v3\.2\.1|v4\.0\.0|version.*change|upgrade|migrat/i.test(response));
  pass("D6: Response mentions Keycloak", /keycloak/i.test(response));
  pass("D6: Response mentions RFC or migration", /rfc|migration/i.test(response));
  // D8: Output quality — healthy + context
  pass("D8: Response confirms healthy", /healthy/i.test(response));
  pass("D8: Response explains the discrepancy", /previously|was.*v3|graph.*v3|stored|outdated|stale|contradiction|changed|updated|now.*v4/i.test(response));

  // Cleanup
  rmSync("/tmp/brain-eval-i02", { recursive: true, force: true });
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
