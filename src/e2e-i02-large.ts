/**
 * I02 with a larger graph — enough nodes that the migration RFC
 * doesn't make it into the initial activation, forcing reactivation
 * to actually pull in new nodes.
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

process.env.BRAIN_DB_PATH = "file:test_i02_large.db";

// The RFC is disconnected from auth-service and uses vocabulary
// that won't match "AuthService health" queries. It WILL match
// "Keycloak migration" queries though.
const graphData = {
  // Core auth cluster — these will dominate initial activation
  core: [
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
        { content: "redis-auth-prod-01 is a 3-node Redis Sentinel cluster used by auth-service.", confidence: 0.85 },
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
  ],
  // Noise nodes — other services that will compete for seed slots
  noise: [
    {
      name: "billing-service",
      type: "service",
      observations: [
        { content: "BillingService processes all payment transactions. Uses Stripe as payment gateway.", confidence: 0.9 },
        { content: "BillingService runs on k8s namespace billing-prod, currently v2.8.3.", confidence: 0.85 },
      ],
    },
    {
      name: "notification-service",
      type: "service",
      observations: [
        { content: "NotificationService sends emails, SMS, and push notifications to users.", confidence: 0.9 },
        { content: "Notification service integrates with SendGrid for email and Twilio for SMS.", confidence: 0.85 },
      ],
    },
    {
      name: "user-service",
      type: "service",
      observations: [
        { content: "UserService manages user profiles, preferences, and account settings.", confidence: 0.9 },
        { content: "User service stores data in PostgreSQL cluster user-db-prod.", confidence: 0.85 },
      ],
    },
    {
      name: "api-gateway",
      type: "infrastructure",
      observations: [
        { content: "API gateway routes all external traffic. Handles rate limiting and auth token validation.", confidence: 0.9 },
        { content: "API gateway forwards auth headers to auth-service for session verification.", confidence: 0.85 },
      ],
    },
    {
      name: "monitoring-stack",
      type: "infrastructure",
      observations: [
        { content: "Monitoring uses Prometheus for metrics collection and Grafana for dashboards.", confidence: 0.9 },
        { content: "Alert rules fire to PagerDuty for P1 incidents on all production services.", confidence: 0.85 },
      ],
    },
    {
      name: "ci-cd-pipeline",
      type: "infrastructure",
      observations: [
        { content: "CI/CD runs on GitHub Actions. All services deploy via ArgoCD to production k8s.", confidence: 0.9 },
        { content: "Deployment pipeline requires passing unit tests, integration tests, and security scan.", confidence: 0.85 },
      ],
    },
    {
      name: "search-service",
      type: "service",
      observations: [
        { content: "SearchService provides full-text search using Elasticsearch cluster.", confidence: 0.9 },
        { content: "Search service indexes user content, products, and help articles.", confidence: 0.85 },
      ],
    },
    {
      name: "cdn-config",
      type: "infrastructure",
      observations: [
        { content: "CDN is Cloudflare. Static assets served from edge nodes globally.", confidence: 0.9 },
        { content: "CDN cache TTL is 1 hour for static assets, 0 for API responses.", confidence: 0.85 },
      ],
    },
    {
      name: "logging-pipeline",
      type: "infrastructure",
      observations: [
        { content: "All services ship logs to Loki via Promtail agents on each k8s node.", confidence: 0.9 },
        { content: "Log retention is 30 days in Loki, 90 days in cold storage (S3).", confidence: 0.85 },
      ],
    },
    {
      name: "database-cluster",
      type: "infrastructure",
      observations: [
        { content: "Primary PostgreSQL cluster runs on RDS with multi-AZ failover.", confidence: 0.9 },
        { content: "Database backups run daily at 03:00 UTC with 30 day retention.", confidence: 0.85 },
      ],
    },
  ],
  // The RFC — uses Keycloak/OpenID vocabulary, NOT "auth-service health" vocabulary
  // Deliberately disconnected from auth-service in the graph
  rfc: {
    name: "identity-platform-rfc",
    type: "document",
    observations: [
      { content: "RFC-2024-041: Proposal to adopt OpenID Connect via Keycloak as the identity provider. Replaces custom token validation. Target: Q1 2026.", confidence: 0.9 },
      { content: "Keycloak migration involves replacing the /auth/token endpoint. Adds Keycloak as upstream dependency. Major version bump to v4.0.0.", confidence: 0.85 },
    ],
  },
};

async function seedGraph() {
  const nodeMap = new Map<string, string>();

  // Seed all nodes
  const allNodes = [...graphData.core, ...graphData.noise, graphData.rfc];
  for (const node of allNodes) {
    const n = await upsertNode(node.name, node.type);
    nodeMap.set(node.name, n.id);
    for (const obs of node.observations) {
      const obsEmb = await embed(`${node.name}: ${obs.content}`);
      await addObservation(n.id, obs.content, obsEmb, obs.confidence);
    }
  }

  // Edges — auth cluster only, RFC is NOT connected
  await addEdge(nodeMap.get("auth-service")!, nodeMap.get("redis-auth-cluster")!, "depends_on", 0.9);
  await addEdge(nodeMap.get("auth-service")!, nodeMap.get("k8s-auth-namespace")!, "deployed_in", 0.9);
  await addEdge(nodeMap.get("api-gateway")!, nodeMap.get("auth-service")!, "forwards_to", 0.8);
  // Some noise edges
  await addEdge(nodeMap.get("billing-service")!, nodeMap.get("database-cluster")!, "uses", 0.8);
  await addEdge(nodeMap.get("user-service")!, nodeMap.get("database-cluster")!, "uses", 0.8);
  await addEdge(nodeMap.get("search-service")!, nodeMap.get("database-cluster")!, "uses", 0.7);

  return nodeMap;
}

async function run() {
  console.log("=== I02 Large Graph: Surprise-Driven Reactivation ===\n");

  await initDb();
  const db = getDb();
  await db.execute("DELETE FROM scratch_traces");
  await db.execute("DELETE FROM edges");
  await db.execute("DELETE FROM observations");
  await db.execute("DELETE FROM nodes");

  // Step 1: Seed
  console.log("1. Seeding knowledge graph (14 nodes, RFC disconnected)...");
  const nodeMap = await seedGraph();
  console.log(`   Total nodes: ${nodeMap.size}`);

  // Step 2: Stage health check file
  console.log("\n2. Staging context files...");
  mkdirSync("/tmp/brain-eval-i02", { recursive: true });
  writeFileSync("/tmp/brain-eval-i02/healthz.json", JSON.stringify({
    status: "healthy",
    version: "v4.0.0-rc1",
    uptime_seconds: 3847,
    dependencies: { keycloak: "connected", redis: "connected" },
  }, null, 2));

  // Step 3: Run
  console.log("\n3. Running agent...\n");
  resetStaleState();
  const sid = generateId();
  const prompt = "Can you check on AuthService for me? I want to make sure it's healthy.";

  const sensor = await processTextInput(prompt);
  const activated = await activate(sensor);

  console.log(`   Initial activation: ${activated.nodes.length} nodes`);
  const rfcInInitial = activated.nodes.some((n) => n.node.name === "identity-platform-rfc");
  console.log(`   RFC in initial activation: ${rfcInInitial ? "YES (test may not work)" : "NO (good — reactivation needed)"}`);
  for (const n of activated.nodes) {
    console.log(`     [${n.node.type}] ${n.node.name} (score: ${n.activationScore.toFixed(3)})`);
  }
  console.log();

  const response = await runPFCLoop(sensor, activated, sid);
  console.log(`\n4. Final response:\n"${response}"\n`);

  // Analyze
  const traces = await readScratch(sid);
  const evals = traces.filter((t) => t.type === "evaluator_signal");
  const reactivations = traces.filter((t) => t.content.includes("[REACTIVATION"));

  console.log("=== Trace Summary ===");
  console.log(`  Total traces: ${traces.length}`);
  console.log(`  Evaluator signals: ${evals.length}`);
  console.log(`  Reactivation events: ${reactivations.length}`);

  console.log("\n  Evaluator signals:");
  for (const e of evals) console.log(`    ${e.content.slice(0, 200)}`);

  if (reactivations.length > 0) {
    console.log("\n  Reactivation details:");
    for (const r of reactivations) console.log(`    ✅ ${r.content.slice(0, 200)}`);
  }

  console.log("\n=== Grading ===");
  const pass = (label: string, ok: boolean) => console.log(`  ${ok ? "✅" : "❌"} ${label}`);

  pass("RFC NOT in initial activation", !rfcInInitial);
  pass("Reactivation fired", reactivations.length > 0);
  pass("Reactivation added new nodes", reactivations.some((r) => !r.content.includes("Added 0 nodes")));
  pass("Response mentions version change", /v3\.2\.1|v4\.0\.0|version.*change|upgrade|migrat/i.test(response));
  pass("Response mentions Keycloak", /keycloak/i.test(response));
  pass("Response mentions RFC or migration", /rfc|migration|openid/i.test(response));
  pass("Response confirms healthy", /healthy/i.test(response));

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
