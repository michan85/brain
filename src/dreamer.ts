import { callLLM, extractJson, embed } from "./llm";
import { CONFIG } from "./config";
import { readUnconsolidated, markConsolidated } from "./scratch";
import { upsertNode, addObservation, addEdge } from "./graph";
import { getDb } from "./db";
import type { ScratchTrace } from "./types";

// --- Types ---

type Classification = "promote" | "consolidate" | "prune" | "strengthen" | "weaken";

interface ClassifiedTrace {
  traceId: string;
  classification: Classification;
  /** For promote: new node name + type. For strengthen/weaken: existing target. */
  entities: { name: string; type: string }[];
  edges: { source: string; target: string; relation: string }[];
  /** Why this classification was chosen. */
  rationale: string;
  priority: number;
}

export interface ConsolidationResult {
  traceId: string;
  action: Classification;
  createdNodeIds: string[];
  modifiedNodeIds: string[];
  removedNodeIds: string[];
  timestamp: number;
}

// --- Classification ---

function buildClassifyPrompt(traces: ScratchTrace[]): { role: "system" | "user"; content: string }[] {
  const traceBlock = traces.map((t, i) =>
    `[${i}] id=${t.id} type=${t.type} content="${t.content}"${
      t.evaluatorAnnotation
        ? ` quality=${t.evaluatorAnnotation.quality} surprise=${t.evaluatorAnnotation.surprise}`
        : ""
    }`
  ).join("\n");

  return [
    {
      role: "system",
      content: `You are the Dreamer — the consolidation engine of a brain-inspired agent. You process scratch traces from reasoning sessions and decide what enters long-term knowledge.

For each trace, classify it as one of:
- "promote": Novel, high-quality information that should become a new node/edge in the knowledge graph. Extract entities (name + type) and edges (source → relation → target).
- "strengthen": Confirms something already in the graph. Identify which entities to strengthen.
- "weaken": Contradicts something in the graph. Identify what to weaken.
- "consolidate": Redundant with other traces in this batch. Group with the best version.
- "prune": Low-value operational noise. Discard.

Prioritize: high surprise + high quality → promote. Low surprise + low quality → prune.
Evaluator signals (type=evaluator_signal) should not be promoted as knowledge — use them to inform your classification of adjacent traces, then prune them.

Return a JSON array of classifications. Each element:
{
  "traceId": "the trace id",
  "classification": "promote" | "consolidate" | "prune" | "strengthen" | "weaken",
  "entities": [{"name": "...", "type": "..."}],
  "edges": [{"source": "entity name", "target": "entity name", "relation": "..."}],
  "rationale": "brief reason",
  "priority": 0.0-1.0
}`
    },
    {
      role: "user",
      content: `Classify these ${traces.length} traces:\n\n${traceBlock}`
    }
  ];
}

async function classifyTraces(traces: ScratchTrace[]): Promise<ClassifiedTrace[]> {
  if (traces.length === 0) return [];

  const response = await callLLM(buildClassifyPrompt(traces), {
    model: CONFIG.reasoningModel,
    json: true,
  });

  try {
    const raw = extractJson(response);
    // Handle both bare array and wrapped object
    const parsed = JSON.parse(raw);
    const arr: ClassifiedTrace[] = Array.isArray(parsed) ? parsed : parsed.classifications ?? parsed.traces ?? [];
    // Validate and fill defaults
    return arr.map((c: any) => ({
      traceId: c.traceId ?? c.trace_id ?? "",
      classification: (["promote", "consolidate", "prune", "strengthen", "weaken"].includes(c.classification)
        ? c.classification
        : "prune") as Classification,
      entities: Array.isArray(c.entities) ? c.entities : [],
      edges: Array.isArray(c.edges) ? c.edges : [],
      rationale: c.rationale ?? "",
      priority: typeof c.priority === "number" ? c.priority : 0.5,
    }));
  } catch {
    // If classification fails, prune everything rather than losing data silently
    console.error("[dreamer] Failed to parse classification response, pruning batch");
    return traces.map((t) => ({
      traceId: t.id,
      classification: "prune" as Classification,
      entities: [],
      edges: [],
      rationale: "classification parse failure",
      priority: 0,
    }));
  }
}

// --- Execution ---

async function executePromote(classified: ClassifiedTrace): Promise<ConsolidationResult> {
  const createdNodeIds: string[] = [];
  const nodeNameToId = new Map<string, string>();

  // Create/upsert nodes for each entity, each with its own observation + embedding
  for (const entity of classified.entities) {
    const node = await upsertNode(entity.name, entity.type);
    createdNodeIds.push(node.id);
    nodeNameToId.set(entity.name.toLowerCase(), node.id);

    const obsEmbedding = await embed(entity.name);
    await addObservation(node.id, `[dreamer] ${entity.name}: ${classified.rationale}`, obsEmbedding);
  }

  // Create edges
  for (const edge of classified.edges) {
    const sourceId = nodeNameToId.get(edge.source.toLowerCase());
    const targetId = nodeNameToId.get(edge.target.toLowerCase());
    if (sourceId && targetId) {
      await addEdge(sourceId, targetId, edge.relation, 0.5);
    }
  }

  return {
    traceId: classified.traceId,
    action: "promote",
    createdNodeIds,
    modifiedNodeIds: [],
    removedNodeIds: [],
    timestamp: Date.now(),
  };
}

async function executeStrengthen(classified: ClassifiedTrace): Promise<ConsolidationResult> {
  const db = getDb();
  const modifiedNodeIds: string[] = [];

  for (const entity of classified.entities) {
    // Find the node and strengthen its edges
    const result = await db.execute({
      sql: "SELECT id FROM nodes WHERE LOWER(name) = LOWER(?)",
      args: [entity.name],
    });
    if (result.rows.length > 0) {
      const nodeId = result.rows[0]!.id as string;
      modifiedNodeIds.push(nodeId);
      // Strengthen all edges connected to this node
      await db.execute({
        sql: "UPDATE edges SET weight = MIN(weight + 0.1, 1.0) WHERE source_id = ? OR target_id = ?",
        args: [nodeId, nodeId],
      });
    }
  }

  return {
    traceId: classified.traceId,
    action: "strengthen",
    createdNodeIds: [],
    modifiedNodeIds,
    removedNodeIds: [],
    timestamp: Date.now(),
  };
}

async function executeWeaken(classified: ClassifiedTrace): Promise<ConsolidationResult> {
  const db = getDb();
  const modifiedNodeIds: string[] = [];

  for (const entity of classified.entities) {
    const result = await db.execute({
      sql: "SELECT id FROM nodes WHERE LOWER(name) = LOWER(?)",
      args: [entity.name],
    });
    if (result.rows.length > 0) {
      const nodeId = result.rows[0]!.id as string;
      modifiedNodeIds.push(nodeId);
      // Weaken edges — remove any that drop below threshold
      await db.execute({
        sql: "UPDATE edges SET weight = MAX(weight - 0.15, 0.0) WHERE source_id = ? OR target_id = ?",
        args: [nodeId, nodeId],
      });
      await db.execute({
        sql: "DELETE FROM edges WHERE weight <= 0.05 AND (source_id = ? OR target_id = ?)",
        args: [nodeId, nodeId],
      });
    }
  }

  return {
    traceId: classified.traceId,
    action: "weaken",
    createdNodeIds: [],
    modifiedNodeIds,
    removedNodeIds: [],
    timestamp: Date.now(),
  };
}

// --- Supersession Detection ---

/**
 * Detect state-like progressions on the same node: multiple observations that describe
 * different states of the same attribute. When found, set supersededBy on older observations
 * pointing to the newest, weaken their confidence, and strengthen the latest.
 */
async function detectSupersessions(): Promise<number> {
  const db = getDb();
  let supersessionCount = 0;

  // Find nodes with multiple non-superseded observations
  const candidates = await db.execute(
    `SELECT node_id, COUNT(*) as cnt FROM observations
     WHERE superseded_by IS NULL
     GROUP BY node_id HAVING cnt > 1`
  );

  for (const row of candidates.rows) {
    const nodeId = row.node_id as string;

    // Get all active observations for this node, oldest first
    const obs = await db.execute({
      sql: `SELECT id, content, confidence, created_at FROM observations
            WHERE node_id = ? AND superseded_by IS NULL
            ORDER BY created_at ASC`,
      args: [nodeId],
    });

    if (obs.rows.length < 2) continue;

    // Ask the LLM to identify supersession chains
    const obsBlock = obs.rows.map((o, i) =>
      `[${i}] id=${o.id} created=${o.created_at} content="${o.content}"`
    ).join("\n");

    const response = await callLLM([
      {
        role: "system",
        content: `You detect state progressions in observations about the same entity.
A supersession occurs when a newer observation updates or replaces the state described by an older one.
Examples: status changes (blocked → done), version updates (v1 → v2), role changes, location changes.
NOT supersession: different facts about the same entity (creator + language are independent).

Return JSON: { "chains": [[olderId, newerId, ...]] }
Each chain is ordered oldest→newest. Only include observations that form genuine state progressions.
If no supersessions exist, return { "chains": [] }.`,
      },
      {
        role: "user",
        content: `Observations for the same entity:\n${obsBlock}`,
      },
    ], { model: CONFIG.reasoningModel, json: true });

    try {
      const parsed = JSON.parse(extractJson(response));
      const chains: string[][] = parsed.chains ?? [];

      for (const chain of chains) {
        if (chain.length < 2) continue;

        // The last ID in the chain is the current state
        const latestId = chain[chain.length - 1]!;
        const olderIds = chain.slice(0, -1);

        // Mark older observations as superseded
        for (const oldId of olderIds) {
          await db.execute({
            sql: "UPDATE observations SET superseded_by = ?, confidence = MAX(confidence - 0.3, 0.1) WHERE id = ?",
            args: [latestId, oldId],
          });
          supersessionCount++;
        }

        // Strengthen the latest observation
        await db.execute({
          sql: "UPDATE observations SET confidence = MIN(confidence + 0.2, 1.0) WHERE id = ?",
          args: [latestId],
        });

        console.log(`  [supersede] chain of ${chain.length}: latest=${latestId}, superseded ${olderIds.length} older observations`);
      }
    } catch {
      // If parsing fails, skip supersession detection for this node
    }
  }

  return supersessionCount;
}

// --- Main Entry Point ---

export async function consolidate(opts?: { limit?: number }): Promise<ConsolidationResult[]> {
  const traces = await readUnconsolidated({ limit: opts?.limit ?? 50 });
  if (traces.length === 0) {
    console.log("[dreamer] No unconsolidated traces. Nothing to do.");
    return [];
  }

  console.log(`[dreamer] Processing ${traces.length} unconsolidated traces...`);

  // Classify in batches to stay within context limits
  const BATCH_SIZE = 20;
  const allClassified: ClassifiedTrace[] = [];

  for (let i = 0; i < traces.length; i += BATCH_SIZE) {
    const batch = traces.slice(i, i + BATCH_SIZE);
    const classified = await classifyTraces(batch);
    allClassified.push(...classified);
  }

  // Sort by priority (highest first)
  allClassified.sort((a, b) => b.priority - a.priority);

  // Execute each classification
  const results: ConsolidationResult[] = [];
  const processedIds: string[] = [];

  for (const c of allClassified) {
    try {
      let result: ConsolidationResult;

      switch (c.classification) {
        case "promote":
          result = await executePromote(c);
          console.log(`  [promote] ${c.entities.map((e) => e.name).join(", ")} — ${c.rationale}`);
          break;
        case "strengthen":
          result = await executeStrengthen(c);
          console.log(`  [strengthen] ${c.entities.map((e) => e.name).join(", ")} — ${c.rationale}`);
          break;
        case "weaken":
          result = await executeWeaken(c);
          console.log(`  [weaken] ${c.entities.map((e) => e.name).join(", ")} — ${c.rationale}`);
          break;
        case "consolidate":
          // For consolidate, we just mark it — the "best" version in the batch gets promoted
          result = {
            traceId: c.traceId,
            action: "consolidate",
            createdNodeIds: [],
            modifiedNodeIds: [],
            removedNodeIds: [],
            timestamp: Date.now(),
          };
          console.log(`  [consolidate] merged — ${c.rationale}`);
          break;
        case "prune":
        default:
          result = {
            traceId: c.traceId,
            action: "prune",
            createdNodeIds: [],
            modifiedNodeIds: [],
            removedNodeIds: [],
            timestamp: Date.now(),
          };
          console.log(`  [prune] — ${c.rationale}`);
          break;
      }

      results.push(result);
      processedIds.push(c.traceId);
    } catch (err: any) {
      console.error(`  [error] trace ${c.traceId}: ${err.message}`);
    }
  }

  // Mark all processed traces as consolidated
  await markConsolidated(processedIds);

  // Detect and resolve state progressions (supersession)
  const superseded = await detectSupersessions();
  if (superseded > 0) {
    console.log(`[dreamer] Superseded ${superseded} stale observations.`);
  }

  const summary = results.reduce(
    (acc, r) => { acc[r.action] = (acc[r.action] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );
  console.log(`[dreamer] Done. ${JSON.stringify(summary)}`);

  return results;
}

export async function backlogSize(): Promise<number> {
  const traces = await readUnconsolidated();
  return traces.length;
}
