/**
 * Prompt Benchmark — evaluate how different models perform on the brain's
 * specific prompt tasks: extraction, reasoning, evaluation.
 *
 * Usage:
 *   bun run evals/prompt-bench.ts                           # run all tasks on default models
 *   bun run evals/prompt-bench.ts --models gpt-5.2,gpt-5.1-codex-mini
 *   bun run evals/prompt-bench.ts --tasks extraction,reasoning
 *   bun run evals/prompt-bench.ts --models gpt-5.2 --tasks reasoning
 *
 * Output: a comparison table showing per-task scores for each model,
 * plus a detailed breakdown saved to evals/runs/prompt-bench-<timestamp>.json
 */

import { callLLM, extractJson } from "../src/llm";
import { CONFIG } from "../src/config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestCase {
  id: string;
  task: string; // extraction | reasoning | evaluation
  name: string;
  prompt: { role: "system" | "user"; content: string }[];
  /** Scoring function: takes raw model output, returns 0.0-1.0 score + details */
  score: (output: string) => { score: number; details: string };
}

interface ModelResult {
  model: string;
  testId: string;
  task: string;
  name: string;
  score: number;
  details: string;
  durationMs: number;
  rawOutput: string;
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= argv.length) return undefined;
  return argv[idx + 1];
}

const defaultModels = [CONFIG.reasoningModel, CONFIG.evaluatorModel];
const requestedModels = getArg("models")?.split(",").map(s => s.trim()) ?? defaultModels;
const requestedTasks = getArg("tasks")?.split(",").map(s => s.trim()) ?? null;

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function jsonParse(output: string): any {
  try {
    const raw = extractJson(output);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Check if a set of expected entity names appear in the output entities */
function entityRecall(
  output: string,
  expectedNames: string[]
): { found: string[]; missing: string[]; recall: number } {
  const parsed = jsonParse(output);
  if (!parsed) return { found: [], missing: expectedNames, recall: 0 };

  // Handle the new extraction format: { entities: [...], edges: [...] }
  const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
  const allNames = entities.map((e: any) => (e.name ?? "").toLowerCase());

  const found: string[] = [];
  const missing: string[] = [];
  for (const name of expectedNames) {
    if (allNames.some((n: string) => n.includes(name.toLowerCase()))) {
      found.push(name);
    } else {
      missing.push(name);
    }
  }
  return { found, missing, recall: expectedNames.length > 0 ? found.length / expectedNames.length : 1 };
}

/** Check if expected edges appear in the output */
function edgeRecall(
  output: string,
  checks: { source: string; target: string }[]
): { matched: number; total: number; recall: number; details: string[] } {
  const parsed = jsonParse(output);
  if (!parsed) return { matched: 0, total: checks.length, recall: 0, details: ["parse error"] };

  const edges = Array.isArray(parsed.edges) ? parsed.edges : [];
  const edgePairs = edges.map((e: any) => ({
    source: (e.source ?? "").toLowerCase(),
    target: (e.target ?? "").toLowerCase(),
  }));

  let matched = 0;
  const details: string[] = [];
  for (const check of checks) {
    const src = check.source.toLowerCase();
    const tgt = check.target.toLowerCase();
    const found = edgePairs.some(e => e.source.includes(src) && e.target.includes(tgt));
    if (found) { matched++; details.push(`${check.source}→${check.target}:yes`); }
    else { details.push(`${check.source}→${check.target}:no`); }
  }

  return { matched, total: checks.length, recall: checks.length > 0 ? matched / checks.length : 1, details };
}

// ---------------------------------------------------------------------------
// Shared prompts (must match the actual prompts used in the system)
// ---------------------------------------------------------------------------

const DREAMER_EXTRACT_SYSTEM = `You are the Dreamer — the consolidation engine of a brain-inspired agent. You extract structured knowledge from reasoning traces that led to successful outcomes.

Extract entities (name, type) and relationships (source, relation, target) from the traces below.

Entity types: person, technology, concept, organization, project, process, tool, service, or any other appropriate type.

Return JSON:
{
  "entities": [{"name": "...", "type": "..."}],
  "edges": [{"source": "entity name", "target": "entity name", "relation": "..."}]
}

Rules:
- Extract only factual information, not operational details (like "responded successfully")
- Prefer specific names over generic descriptions
- Keep entity names concise (1-3 words)
- Edge relations should be verb phrases (e.g., "uses", "is part of", "manages")`;

function dreamerExtractWithContext(existingNames: string[]): string {
  return DREAMER_EXTRACT_SYSTEM + `\n\nThese nodes already exist in the knowledge graph:\n${existingNames.map(n => `- ${n}`).join("\n")}\n\nReuse these exact names when the entity matches (case-insensitive). Always include ALL entities mentioned in the traces in your entities list — even if they already exist — so we can record the new observation.`;
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

const testCases: TestCase[] = [
  // --- EXTRACTION: entity recall ---
  {
    id: "ext-1",
    task: "extraction",
    name: "extract technology stack entities",
    prompt: [
      { role: "system", content: DREAMER_EXTRACT_SYSTEM },
      { role: "user", content: `Extract knowledge from these 1 traces:\n\n[0] id=t1 type=action_result content="respond: success — Stack: Go backend, TypeScript tooling, Kubernetes orchestration, Terraform IaC, ArgoCD for CD, Datadog metrics, Grafana dashboards, PagerDuty alerting."` },
    ],
    score: (output) => {
      const expected = ["go", "typescript", "kubernetes", "terraform", "argocd", "datadog", "grafana", "pagerduty"];
      const { found, missing, recall } = entityRecall(output, expected);
      return { score: recall, details: `recall=${(recall * 100).toFixed(0)}% found=[${found.join(",")}] missing=[${missing.join(",")}]` };
    },
  },
  {
    id: "ext-2",
    task: "extraction",
    name: "extract deployment config entities",
    prompt: [
      { role: "system", content: DREAMER_EXTRACT_SYSTEM },
      { role: "user", content: `Extract knowledge from these 1 traces:\n\n[0] id=t2 type=action_result content="respond: success — api_gateway uses Envoy proxy. Canary deployment: 5% → 25% → 100% traffic shift over 30 minutes. HPA scales pods, circuit breaker with 50% error threshold."` },
    ],
    score: (output) => {
      const expected = ["envoy", "api_gateway"];
      const { found, missing, recall } = entityRecall(output, expected);
      return { score: recall, details: `recall=${(recall * 100).toFixed(0)}% found=[${found.join(",")}] missing=[${missing.join(",")}]` };
    },
  },

  // --- EXTRACTION: edge recall ---
  {
    id: "ext-3",
    task: "extraction",
    name: "extract ownership and dependency edges",
    prompt: [
      { role: "system", content: DREAMER_EXTRACT_SYSTEM },
      { role: "user", content: `Extract knowledge from these 1 traces:\n\n[0] id=t3 type=action_result content="respond: success — The platform_team owns api_gateway. api_gateway depends on Redis for rate limiting and PostgreSQL for config storage."` },
    ],
    score: (output) => {
      const { recall, details } = edgeRecall(output, [
        { source: "platform_team", target: "api_gateway" },
        { source: "api_gateway", target: "redis" },
        { source: "api_gateway", target: "postgres" },
      ]);
      return { score: recall, details: `edge_recall=${(recall * 100).toFixed(0)}% ${details.join(" ")}` };
    },
  },

  // --- EXTRACTION: reuse existing names ---
  {
    id: "ext-4",
    task: "extraction",
    name: "reuse existing node names from graph context",
    prompt: [
      { role: "system", content: dreamerExtractWithContext(["Kubernetes", "AWS", "Platform Team"]) },
      { role: "user", content: `Extract knowledge from these 1 traces:\n\n[0] id=t4 type=action_result content="respond: success — The platform team uses Kubernetes in production and AWS for cloud hosting."` },
    ],
    score: (output) => {
      const parsed = jsonParse(output);
      if (!parsed) return { score: 0, details: "parse error" };
      const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
      const names = entities.map((e: any) => e.name as string);

      let score = 0;
      const checks: string[] = [];
      // Should reuse "Kubernetes" not "kubernetes" or "K8s"
      const k8s = names.find((n: string) => n.toLowerCase().includes("kubernetes"));
      if (k8s === "Kubernetes") { score += 0.5; checks.push("k8s=exact"); }
      else if (k8s) { score += 0.25; checks.push(`k8s=partial(${k8s})`); }
      else { checks.push("k8s=missing"); }

      const aws = names.find((n: string) => n.toLowerCase().includes("aws"));
      if (aws === "AWS") { score += 0.5; checks.push("aws=exact"); }
      else if (aws) { score += 0.25; checks.push(`aws=partial(${aws})`); }
      else { checks.push("aws=missing"); }

      return { score, details: `entities=[${names.join(",")}] ${checks.join(" ")}` };
    },
  },

  // --- EXTRACTION: noise rejection ---
  {
    id: "ext-5",
    task: "extraction",
    name: "extract nothing from operational noise",
    prompt: [
      { role: "system", content: DREAMER_EXTRACT_SYSTEM },
      { role: "user", content: `Extract knowledge from these 1 traces:\n\n[0] id=t5 type=action_result content="sense: success — [object Object]"` },
    ],
    score: (output) => {
      const parsed = jsonParse(output);
      if (!parsed) return { score: 0.5, details: "parse error (acceptable for noise)" };
      const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
      // Should extract 0 entities from noise
      if (entities.length === 0) return { score: 1.0, details: "correctly extracted nothing" };
      return { score: 0.0, details: `extracted ${entities.length} entities from noise: [${entities.map((e: any) => e.name).join(",")}]` };
    },
  },

  // --- EXTRACTION: multi-trace batch ---
  {
    id: "ext-6",
    task: "extraction",
    name: "extract from mixed batch of traces",
    prompt: [
      { role: "system", content: DREAMER_EXTRACT_SYSTEM },
      { role: "user", content: `Extract knowledge from these 3 traces:\n\n[0] id=t6a type=action_result content="respond: success — The auth-service uses Keycloak for identity management and OIDC for SSO."\n[1] id=t6b type=thought content="I should check if rate limiting is configured on the gateway."\n[2] id=t6c type=action_result content="respond: success — Redis handles rate limiting at 1000 req/min per client."` },
    ],
    score: (output) => {
      const expected = ["keycloak", "redis"];
      const { found, missing, recall } = entityRecall(output, expected);
      // Also check edges exist — weight: 80% entity recall, 20% has edges
      const parsed = jsonParse(output);
      const edges = Array.isArray(parsed?.edges) ? parsed.edges : [];
      const edgeScore = edges.length > 0 ? 1.0 : 0.0;
      const score = recall * 0.8 + edgeScore * 0.2;
      return { score, details: `entity_recall=${(recall * 100).toFixed(0)}% found=[${found.join(",")}] missing=[${missing.join(",")}] edges=${edges.length}` };
    },
  },

  // --- REASONING (PFC-style) ---
  {
    id: "rsn-1",
    task: "reasoning",
    name: "produce valid PFC response with facts",
    prompt: [
      { role: "system", content: `You are the PFC (prefrontal cortex) of an AI agent. Given a user query and context, produce a JSON response. For thoughts: {"kind":"thought","content":"your reasoning"}. For actions: {"kind":"action","effectorId":"respond|sense|act","payload":{...}}` },
      { role: "user", content: `User query: "What deployment window is allowed for payments-service?"\n\nActivated context:\n- payments-service: deploy window Mon-Thu 9am-4pm ET. Hotfixes require VP approval.\n\nProduce your response.` },
    ],
    score: (output) => {
      const parsed = jsonParse(output);
      if (!parsed) return { score: 0, details: "invalid JSON" };
      if (!parsed.kind) return { score: 0.2, details: "missing 'kind' field" };
      if (parsed.kind === "action" && parsed.effectorId === "respond") {
        const msg = (parsed.payload?.message ?? "").toLowerCase();
        const hasDays = msg.includes("mon") || msg.includes("thu");
        const hasTime = msg.includes("9") || msg.includes("4");
        const score = 0.5 + (hasDays ? 0.25 : 0) + (hasTime ? 0.25 : 0);
        return { score, details: `respond action, days=${hasDays} time=${hasTime}` };
      }
      if (parsed.kind === "thought") {
        return { score: 0.6, details: "thought (acceptable but could respond directly)" };
      }
      return { score: 0.3, details: `kind=${parsed.kind} effector=${parsed.effectorId}` };
    },
  },
  {
    id: "rsn-2",
    task: "reasoning",
    name: "recognize empty context and use sense",
    prompt: [
      { role: "system", content: `You are the PFC. Activated context is empty — the knowledge graph has nothing relevant. You can use effectors: "respond" to answer, "sense" to investigate files/code, "act" to execute changes. Produce a single JSON: {"kind":"thought"|"action","content"|"effectorId":...}` },
      { role: "user", content: `User query: "What's the CPU usage trend for the auth service over the last week?"\n\nActivated context: (empty)\n\nProduce your response.` },
    ],
    score: (output) => {
      const parsed = jsonParse(output);
      if (!parsed) return { score: 0, details: "invalid JSON" };
      if (parsed.kind === "action" && parsed.effectorId === "sense") return { score: 1.0, details: "correctly chose sense" };
      if (parsed.kind === "action" && parsed.effectorId === "respond") {
        const msg = (parsed.payload?.message ?? "").toLowerCase();
        if (msg.includes("don't have") || msg.includes("no data") || msg.includes("cannot")) return { score: 0.7, details: "admitted lack of data (ok)" };
        return { score: 0.3, details: "responded without investigating" };
      }
      if (parsed.kind === "thought") return { score: 0.6, details: "thinking first (acceptable)" };
      return { score: 0.2, details: `unexpected: kind=${parsed.kind}` };
    },
  },

  // --- EVALUATION ---
  {
    id: "eval-1",
    task: "evaluation",
    name: "mark respond action as done",
    prompt: [
      { role: "system", content: `You are an evaluator for a brain-inspired agent. Given the agent's output, judge whether to continue or stop. Return JSON: {"status":"done"|"continue"|"redirect","quality":"productive"|"neutral"|"counterproductive","surprise":"none"|"low"|"high"|"critical","rationale":"..."}` },
      { role: "user", content: `Agent output: {"kind":"action","effectorId":"respond","payload":{"message":"The deploy window is Mon-Thu 9am-4pm ET."}}\n\nGoal: "Respond to: What deployment window is allowed?"` },
    ],
    score: (output) => {
      const parsed = jsonParse(output);
      if (!parsed) return { score: 0, details: "invalid JSON" };
      let score = 0;
      const checks: string[] = [];
      if (parsed.status === "done") { score += 0.5; checks.push("status=done:yes"); } else { checks.push(`status=done:no(${parsed.status})`); }
      if (parsed.quality === "productive") { score += 0.25; checks.push("quality=productive:yes"); } else { checks.push(`quality:${parsed.quality}`); }
      if (parsed.surprise === "none") { score += 0.25; checks.push("surprise=none:yes"); } else { checks.push(`surprise:${parsed.surprise}`); }
      return { score, details: checks.join(" ") };
    },
  },
  {
    id: "eval-2",
    task: "evaluation",
    name: "flag repeated sense as counterproductive",
    prompt: [
      { role: "system", content: `You are an evaluator. The agent has already called sense 3 times on the same file with no new results. Return JSON: {"status":"done"|"continue"|"redirect","quality":"productive"|"neutral"|"counterproductive","surprise":"none"|"low"|"high"|"critical","rationale":"...","redirectHint":"..."}` },
      { role: "user", content: `Agent output: {"kind":"action","effectorId":"sense","payload":{"task":"Read config.yaml","source":"/app"}}\n\nWorking memory shows 3 previous sense calls to the same source, all returning empty results.\n\nGoal: "Find the service configuration"` },
    ],
    score: (output) => {
      const parsed = jsonParse(output);
      if (!parsed) return { score: 0, details: "invalid JSON" };
      let score = 0;
      const checks: string[] = [];
      if (parsed.status === "redirect") { score += 0.4; checks.push("redirect:yes"); } else { checks.push(`status:${parsed.status}`); }
      if (parsed.quality === "counterproductive") { score += 0.3; checks.push("counterproductive:yes"); } else { checks.push(`quality:${parsed.quality}`); }
      if (parsed.redirectHint) { score += 0.3; checks.push("hasHint:yes"); } else { checks.push("hasHint:no"); }
      return { score, details: checks.join(" ") };
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runBenchmark() {
  const filteredCases = requestedTasks
    ? testCases.filter(tc => requestedTasks.includes(tc.task))
    : testCases;

  console.log(`\nPrompt Benchmark`);
  console.log(`Models: ${requestedModels.join(", ")}`);
  console.log(`Tasks: ${[...new Set(filteredCases.map(tc => tc.task))].join(", ")}`);
  console.log(`Test cases: ${filteredCases.length}`);
  console.log("");

  const allResults: ModelResult[] = [];

  for (const model of requestedModels) {
    console.log(`--- ${model} ---`);
    for (const tc of filteredCases) {
      const start = performance.now();
      try {
        const raw = await callLLM(tc.prompt, { model, json: true });
        const durationMs = performance.now() - start;
        const { score, details } = tc.score(raw);

        const result: ModelResult = {
          model, testId: tc.id, task: tc.task, name: tc.name,
          score, details, durationMs, rawOutput: raw.slice(0, 500),
        };
        allResults.push(result);

        const bar = "█".repeat(Math.round(score * 10)) + "░".repeat(10 - Math.round(score * 10));
        console.log(`  ${bar} ${(score * 100).toFixed(0).padStart(3)}%  ${tc.id} ${tc.name}  (${durationMs.toFixed(0)}ms)`);
        if (score < 1.0) console.log(`         ${details}`);
      } catch (err: any) {
        const durationMs = performance.now() - start;
        allResults.push({
          model, testId: tc.id, task: tc.task, name: tc.name,
          score: 0, details: `ERROR: ${err.message}`, durationMs, rawOutput: "",
        });
        console.log(`  ░░░░░░░░░░   0%  ${tc.id} ${tc.name}  ERROR: ${err.message}`);
      }
    }
    console.log("");
  }

  // --- Summary table ---
  console.log("\n=== COMPARISON TABLE ===\n");

  // Group by task
  const tasks = [...new Set(filteredCases.map(tc => tc.task))];

  // Header
  const modelHeaders = requestedModels.map(m => m.padStart(25)).join("");
  console.log(`${"Task".padEnd(20)}${"Test".padEnd(50)}${modelHeaders}`);
  console.log("-".repeat(20 + 50 + requestedModels.length * 25));

  for (const task of tasks) {
    const taskCases = filteredCases.filter(tc => tc.task === task);
    for (const tc of taskCases) {
      const scores = requestedModels.map(model => {
        const r = allResults.find(r => r.model === model && r.testId === tc.id);
        return r ? `${(r.score * 100).toFixed(0)}%` : "N/A";
      });
      console.log(`${task.padEnd(20)}${tc.name.slice(0, 48).padEnd(50)}${scores.map(s => s.padStart(25)).join("")}`);
    }
  }

  // Per-task averages
  console.log("-".repeat(20 + 50 + requestedModels.length * 25));
  for (const task of tasks) {
    const avgs = requestedModels.map(model => {
      const taskResults = allResults.filter(r => r.model === model && r.task === task);
      const avg = taskResults.length > 0
        ? taskResults.reduce((sum, r) => sum + r.score, 0) / taskResults.length
        : 0;
      return `${(avg * 100).toFixed(0)}%`;
    });
    console.log(`${(task + " avg").padEnd(70)}${avgs.map(s => s.padStart(25)).join("")}`);
  }

  // Overall averages
  const overallAvgs = requestedModels.map(model => {
    const modelResults = allResults.filter(r => r.model === model);
    const avg = modelResults.length > 0
      ? modelResults.reduce((sum, r) => sum + r.score, 0) / modelResults.length
      : 0;
    return `${(avg * 100).toFixed(0)}%`;
  });
  console.log(`${"OVERALL avg".padEnd(70)}${overallAvgs.map(s => s.padStart(25)).join("")}`);

  // Timing
  console.log("\n--- Avg latency per call ---");
  for (const model of requestedModels) {
    const modelResults = allResults.filter(r => r.model === model);
    const avgMs = modelResults.reduce((sum, r) => sum + r.durationMs, 0) / modelResults.length;
    console.log(`  ${model}: ${avgMs.toFixed(0)}ms`);
  }

  // Save detailed results
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = `evals/runs/prompt-bench-${timestamp}.json`;
  await Bun.write(outPath, JSON.stringify({
    timestamp,
    models: requestedModels,
    results: allResults,
  }, null, 2));
  console.log(`\nDetailed results saved to: ${outPath}`);
}

runBenchmark().catch(console.error);
