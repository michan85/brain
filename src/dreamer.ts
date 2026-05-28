import { callLLM, extractJson, embed } from "./llm";
import { CONFIG } from "./config";
import { readUnconsolidated, markConsolidated } from "./scratch";
import { upsertNode, addObservation, addEdge } from "./graph";
import { getDb } from "./db";
import { startSpan } from "./perf";
import type { ScratchTrace } from "./types";

// --- Types ---

export interface ConsolidationResult {
  traceId: string;
  action: "extracted" | "filtered";
  createdNodeIds: string[];
  timestamp: number;
}

interface ExtractedEntity {
  name: string;
  type: string;
}

interface ExtractedEdge {
  source: string;
  target: string;
  relation: string;
}

interface ExtractionResult {
  entities: ExtractedEntity[];
  edges: ExtractedEdge[];
}

// --- Filter ---

/** Keep traces that carry knowledge worth consolidating. */
function filterTraces(traces: ScratchTrace[]): { keep: ScratchTrace[]; discard: ScratchTrace[] } {
  const keep: ScratchTrace[] = [];
  const discard: ScratchTrace[] = [];

  for (const trace of traces) {
    // Always discard evaluator signals — they're meta, not knowledge
    if (trace.type === "evaluator_signal") {
      discard.push(trace);
      continue;
    }

    // If annotated, use evaluator signals to decide
    if (trace.evaluatorAnnotation) {
      const { quality, surprise } = trace.evaluatorAnnotation;

      // Keep productive traces — these led to successful outcomes
      if (quality === "productive") {
        keep.push(trace);
        continue;
      }

      // Keep high/critical surprise — contradictions matter even if not productive
      if (surprise === "high" || surprise === "critical") {
        keep.push(trace);
        continue;
      }

      // Annotated but not productive/surprising — discard
      discard.push(trace);
      continue;
    }

    // Unannotated action_result and observation traces likely carry knowledge
    // (evaluator annotations are only written on evaluator_signal lines)
    if (trace.type === "action_result" || trace.type === "observation") {
      keep.push(trace);
      continue;
    }

    // Unannotated thoughts and other types are noise
    discard.push(trace);
  }

  return { keep, discard };
}

// --- Dedup Context ---

/** Find existing node names similar to the traces, so the extraction prompt can reuse them. */
async function findExistingNodeNames(traces: ScratchTrace[]): Promise<string[]> {
  const endSpan = startSpan("findExistingNodeNames", { traceCount: traces.length });
  const db = getDb();

  // Check if we have any observations to search against
  const count = await db.execute("SELECT COUNT(*) as c FROM observations");
  if ((count.rows[0]!.c as number) === 0) {
    endSpan({ existingNames: 0 });
    return [];
  }

  // Embed a summary of all traces and find similar existing nodes
  const summary = traces.map(t => t.content).join(" | ").slice(0, 500);
  const summaryEmbedding = await embed(summary);
  const queryVec = JSON.stringify(summaryEmbedding);

  const results = await db.execute({
    sql: `SELECT DISTINCT n.name
          FROM vector_top_k('idx_obs_vec', vector32(?), 20) AS vt
          JOIN observations obs ON obs.rowid = vt.id
          JOIN nodes n ON n.id = obs.node_id
          WHERE obs.superseded_by IS NULL`,
    args: [queryVec],
  });

  const names = results.rows.map(r => r.name as string);
  endSpan({ existingNames: names.length });
  return names;
}

// --- Extraction ---

function buildExtractPrompt(
  traces: ScratchTrace[],
  existingNodeNames: string[]
): { role: "system" | "user"; content: string }[] {
  const traceBlock = traces.map((t, i) =>
    `[${i}] id=${t.id} type=${t.type} content="${t.content}"`
  ).join("\n");

  const existingBlock = existingNodeNames.length > 0
    ? `\nThese nodes already exist in the knowledge graph:\n${existingNodeNames.map(n => `- ${n}`).join("\n")}\n\nReuse these exact names when the entity matches (case-insensitive). Always include ALL entities mentioned in the traces in your entities list — even if they already exist — so we can record the new observation.`
    : "";

  return [
    {
      role: "system",
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
      role: "user",
      content: `Extract knowledge from these ${traces.length} traces:\n\n${traceBlock}`
    }
  ];
}

async function extractKnowledge(
  traces: ScratchTrace[],
  existingNodeNames: string[]
): Promise<ExtractionResult | null> {
  if (traces.length === 0) return { entities: [], edges: [] };

  const endSpan = startSpan("extractKnowledge", { traceCount: traces.length, existingNodes: existingNodeNames.length });
  const messages = buildExtractPrompt(traces, existingNodeNames);

  const response = await callLLM(messages, {
    model: CONFIG.evaluatorModel,
    json: true,
  });

  try {
    const raw = extractJson(response);
    const parsed = JSON.parse(raw);
    const result: ExtractionResult = {
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
    };
    endSpan({ entities: result.entities.length, edges: result.edges.length });
    return result;
  } catch {
    // Return null so the caller knows extraction failed and can skip consolidation
    console.error("[dreamer] Failed to parse extraction response — traces will be retried");
    endSpan({ error: "parse_failure" });
    return null;
  }
}

// --- Write to Graph ---

async function writeToGraph(extraction: ExtractionResult, traceContent: string): Promise<{ createdNodeIds: string[] }> {
  const endSpan = startSpan("writeToGraph", { entities: extraction.entities.length, edges: extraction.edges.length });
  const createdNodeIds: string[] = [];
  const nodeNameToId = new Map<string, string>();

  // Create/upsert nodes for each entity
  for (const entity of extraction.entities) {
    const node = await upsertNode(entity.name, entity.type);
    createdNodeIds.push(node.id);
    nodeNameToId.set(entity.name.toLowerCase(), node.id);

    // Embed the entity name in context of the trace for richer vector search
    const obsText = `[dreamer] ${entity.name} (${entity.type}) — ${traceContent.slice(0, 200)}`;
    const obsEmbedding = await embed(obsText);
    await addObservation(node.id, obsText, obsEmbedding);
  }

  // Create edges between known nodes
  for (const edge of extraction.edges) {
    const sourceId = nodeNameToId.get(edge.source.toLowerCase());
    const targetId = nodeNameToId.get(edge.target.toLowerCase());
    if (sourceId && targetId) {
      await addEdge(sourceId, targetId, edge.relation, 0.5);
    }
  }

  endSpan({ createdNodes: createdNodeIds.length });
  return { createdNodeIds };
}

// --- Main Entry Point ---

export async function consolidate(opts?: { limit?: number }): Promise<ConsolidationResult[]> {
  const endSpan = startSpan("consolidate");
  const traces = await readUnconsolidated({ limit: opts?.limit ?? 50 });
  if (traces.length === 0) {
    console.log("[dreamer] No unconsolidated traces. Nothing to do.");
    endSpan({ traceCount: 0 });
    return [];
  }

  console.log(`[dreamer] Processing ${traces.length} unconsolidated traces...`);

  // Step 1: Filter — keep productive traces + high-surprise traces
  const { keep, discard } = filterTraces(traces);
  console.log(`[dreamer] Filter: ${keep.length} kept, ${discard.length} discarded`);

  // Mark discarded traces as consolidated immediately
  const discardIds = discard.map(t => t.id);
  await markConsolidated(discardIds);

  const results: ConsolidationResult[] = discard.map(t => ({
    traceId: t.id,
    action: "filtered" as const,
    createdNodeIds: [],
    timestamp: Date.now(),
  }));

  if (keep.length === 0) {
    console.log("[dreamer] Nothing to extract after filtering.");
    endSpan({ traceCount: traces.length, kept: 0, discarded: discard.length });
    return results;
  }

  // Step 2: Dedup context — find existing node names similar to these traces
  const existingNames = await findExistingNodeNames(keep);
  if (existingNames.length > 0) {
    console.log(`[dreamer] Found ${existingNames.length} existing nodes for dedup context`);
  }

  // Step 3: Extract — one LLM call to extract entities and edges
  const BATCH_SIZE = 20;
  let totalEntities = 0;
  let totalEdges = 0;

  for (let i = 0; i < keep.length; i += BATCH_SIZE) {
    const batch = keep.slice(i, i + BATCH_SIZE);
    const extraction = await extractKnowledge(batch, existingNames);

    // If extraction failed (parse error), skip this batch — traces remain unconsolidated for retry
    if (!extraction) {
      console.log(`  [skip] batch ${i / BATCH_SIZE + 1} failed to parse — will retry next consolidation`);
      continue;
    }

    // Step 4: Write — upsert nodes and edges into the graph
    const traceContent = batch.map(t => t.content).join(" | ");
    const { createdNodeIds } = await writeToGraph(extraction, traceContent);
    totalEntities += extraction.entities.length;
    totalEdges += extraction.edges.length;

    // Log what was extracted
    for (const entity of extraction.entities) {
      console.log(`  [extract] ${entity.name} (${entity.type})`);
    }
    for (const edge of extraction.edges) {
      console.log(`  [edge] ${edge.source} —[${edge.relation}]→ ${edge.target}`);
    }

    // Mark batch traces as consolidated
    const batchIds = batch.map(t => t.id);
    await markConsolidated(batchIds);

    for (const trace of batch) {
      results.push({
        traceId: trace.id,
        action: "extracted",
        createdNodeIds: [...createdNodeIds],
        timestamp: Date.now(),
      });
    }
  }

  console.log(`[dreamer] Done. Extracted ${totalEntities} entities, ${totalEdges} edges from ${keep.length} traces.`);
  endSpan({ traceCount: traces.length, kept: keep.length, discarded: discard.length, entities: totalEntities, edges: totalEdges });
  return results;
}

export async function backlogSize(): Promise<number> {
  const db = getDb();
  const result = await db.execute("SELECT COUNT(*) as c FROM scratch_traces WHERE consolidated = 0");
  return result.rows[0]!.c as number;
}
