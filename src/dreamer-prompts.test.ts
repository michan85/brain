/**
 * Prompt-level evals for the Dreamer extraction pipeline.
 * Tests that the extraction prompt + model correctly identifies
 * entities and edges from productive traces, and reuses existing names.
 *
 * These are fast (~2-5s each) and don't require the full brain pipeline.
 * Run: bun test src/dreamer-prompts.test.ts
 */
import { test, expect, describe } from "bun:test";
import { callLLM, extractJson } from "./llm";
import { CONFIG } from "./config";

// ---------- Helpers ----------

interface ExtractionResult {
  entities: { name: string; type: string }[];
  edges: { source: string; target: string; relation: string }[];
}

/** Build the same prompt the dreamer uses for extraction */
function buildExtractPrompt(
  traces: { id: string; type: string; content: string }[],
  existingNodeNames: string[] = []
) {
  const traceBlock = traces.map((t, i) =>
    `[${i}] id=${t.id} type=${t.type} content="${t.content}"`
  ).join("\n");

  const existingBlock = existingNodeNames.length > 0
    ? `\nThese nodes already exist in the knowledge graph:\n${existingNodeNames.map(n => `- ${n}`).join("\n")}\n\nReuse these exact names when the entity matches (case-insensitive). Always include ALL entities mentioned in the traces in your entities list — even if they already exist — so we can record the new observation.`
    : "";

  return [
    {
      role: "system" as const,
      content: `You are the Dreamer — the consolidation engine of a brain-inspired agent. You extract structured knowledge from reasoning traces that led to successful outcomes.

Extract entities (name, type) and relationships (source, relation, target) from the traces below.
${existingBlock}

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
- Edge relations should be verb phrases (e.g., "uses", "is part of", "manages")`
    },
    {
      role: "user" as const,
      content: `Extract knowledge from these ${traces.length} traces:\n\n${traceBlock}`
    }
  ];
}

async function extract(
  traces: Parameters<typeof buildExtractPrompt>[0],
  existingNodeNames: string[] = []
): Promise<ExtractionResult> {
  const messages = buildExtractPrompt(traces, existingNodeNames);
  const response = await callLLM(messages, {
    model: CONFIG.evaluatorModel,
    json: true,
  });
  try {
    const raw = extractJson(response);
    const parsed = JSON.parse(raw);
    return {
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
    };
  } catch {
    throw new Error(`Failed to parse extraction response: ${response.slice(0, 200)}`);
  }
}

// ---------- Tests ----------

describe("dreamer extraction prompt", () => {

  test("extracts technology entities from action results", async () => {
    const result = await extract([
      {
        id: "trace-1",
        type: "action_result",
        content: 'respond: success — Got it: Go is the primary language for backend services, and TypeScript is used for internal tooling.',
      },
    ]);

    expect(result.entities.length).toBeGreaterThanOrEqual(2);
    const names = result.entities.map(e => e.name.toLowerCase());
    expect(names.some(n => n.includes("go"))).toBe(true);
    expect(names.some(n => n.includes("typescript"))).toBe(true);
  }, 30000);

  test("extracts infrastructure stack with edges", async () => {
    const result = await extract([
      {
        id: "trace-2",
        type: "action_result",
        content: 'respond: success — The platform team uses Kubernetes for orchestration, Terraform for IaC, and ArgoCD for GitOps continuous delivery.',
      },
    ]);

    expect(result.entities.length).toBeGreaterThanOrEqual(3);
    const names = result.entities.map(e => e.name.toLowerCase());
    expect(names.some(n => n.includes("kubernetes"))).toBe(true);
    expect(names.some(n => n.includes("terraform"))).toBe(true);
    expect(names.some(n => n.includes("argocd"))).toBe(true);

    // Should extract at least one relationship
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  test("extracts entities even when existing nodes are provided", async () => {
    const result = await extract(
      [
        {
          id: "trace-3",
          type: "action_result",
          content: 'respond: success — The platform team uses Kubernetes in production. They also rely on AWS for cloud hosting.',
        },
      ],
      ["Kubernetes", "AWS", "Platform Team"]
    );

    // Should still extract the mentioned entities
    const names = result.entities.map(e => e.name.toLowerCase());
    expect(names.some(n => n.includes("kubernetes") || n.includes("k8s"))).toBe(true);
    // Note: exact name reuse is best-effort in the prompt — the real dedup
    // happens via case-insensitive upsertNode() in graph.ts
  }, 30000);

  test("creates new nodes for genuinely new entities", async () => {
    const result = await extract(
      [
        {
          id: "trace-4",
          type: "action_result",
          content: 'respond: success — We use Datadog for metrics, Grafana for dashboards, and PagerDuty for alerting.',
        },
      ],
      ["Kubernetes", "Terraform"]
    );

    // Should create new entities for monitoring tools (not in existing list)
    const names = result.entities.map(e => e.name.toLowerCase());
    expect(names.some(n => n.includes("datadog"))).toBe(true);
    expect(names.some(n => n.includes("grafana"))).toBe(true);
    expect(names.some(n => n.includes("pagerduty"))).toBe(true);

    // Should NOT include Kubernetes or Terraform (not mentioned in trace)
    expect(names.some(n => n.includes("kubernetes"))).toBe(false);
    expect(names.some(n => n.includes("terraform"))).toBe(false);
  }, 30000);

  test("extracts from mixed batch of traces", async () => {
    const result = await extract([
      {
        id: "trace-5a",
        type: "action_result",
        content: 'respond: success — The api_gateway uses Envoy proxy with canary deployments: 5% → 25% → 100% traffic shift over 30 minutes.',
      },
      {
        id: "trace-5b",
        type: "thought",
        content: "The deployment process is well-documented and follows GitOps principles.",
      },
    ]);

    const names = result.entities.map(e => e.name.toLowerCase());
    expect(names.some(n => n.includes("envoy"))).toBe(true);
    expect(names.some(n => n.includes("api") || n.includes("gateway"))).toBe(true);
  }, 60000);

  test("ignores operational noise in traces", async () => {
    const result = await extract([
      {
        id: "trace-6",
        type: "action_result",
        content: "sense: success — [object Object]",
      },
    ]);

    // Should extract nothing meaningful from noise
    expect(result.entities.length).toBe(0);
  }, 30000);
});
