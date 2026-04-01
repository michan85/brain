import { getDb } from "./db";
import { CONFIG } from "./config";
import { generateId, now } from "./utils";
import type {
  GraphNode,
  Observation,
  Edge,
  ActivatedNode,
  ActivatedSubgraph,
  SensorOutput,
} from "./types";

// --- Write Operations ---

export async function upsertNode(
  name: string,
  type: string,
  metadata?: Record<string, unknown>
): Promise<GraphNode> {
  const db = getDb();
  // Check if node with same name+type exists
  const existing = await db.execute({
    sql: "SELECT id, name, type, metadata, created_at FROM nodes WHERE name = ? AND type = ?",
    args: [name, type],
  });

  if (existing.rows.length > 0) {
    const row = existing.rows[0]!;
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as string,
      metadata: JSON.parse((row.metadata as string) || "{}"),
      createdAt: row.created_at as number,
    };
  }

  const id = generateId();
  const createdAt = now();
  await db.execute({
    sql: "INSERT INTO nodes (id, type, name, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [id, type, name, JSON.stringify(metadata ?? {}), createdAt],
  });
  return { id, name, type, metadata: metadata ?? {}, createdAt };
}

export async function addObservation(
  nodeId: string,
  content: string,
  embedding: number[]
): Promise<Observation> {
  const db = getDb();
  const id = generateId();
  const createdAt = now();
  await db.execute({
    sql: "INSERT INTO observations (id, node_id, content, embedding, created_at) VALUES (?, ?, ?, vector32(?), ?)",
    args: [id, nodeId, content, JSON.stringify(embedding), createdAt],
  });
  return { id, nodeId, content, embedding, createdAt };
}

export async function addEdge(
  sourceNodeId: string,
  targetNodeId: string,
  relation?: string,
  weight: number = 1.0
): Promise<Edge> {
  const db = getDb();
  // Avoid duplicate edges
  const existing = await db.execute({
    sql: "SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND relation IS ?",
    args: [sourceNodeId, targetNodeId, relation ?? null],
  });
  if (existing.rows.length > 0) {
    // Strengthen existing edge
    await db.execute({
      sql: "UPDATE edges SET weight = MIN(weight + 0.1, 1.0) WHERE id = ?",
      args: [existing.rows[0]!.id as string],
    });
    return {
      id: existing.rows[0]!.id as string,
      sourceNodeId,
      targetNodeId,
      relation,
      weight: Math.min(weight + 0.1, 1.0),
      createdAt: now(),
    };
  }

  const id = generateId();
  const createdAt = now();
  await db.execute({
    sql: "INSERT INTO edges (id, source_id, target_id, relation, weight, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, sourceNodeId, targetNodeId, relation ?? null, weight, createdAt],
  });
  return { id, sourceNodeId, targetNodeId, relation, weight, createdAt };
}

// --- Read / Activation ---

async function findSeeds(
  embedding: number[],
  limit: number
): Promise<ActivatedNode[]> {
  const db = getDb();
  const queryVec = JSON.stringify(embedding);
  const results = await db.execute({
    sql: `SELECT
            obs.id as obs_id, obs.node_id, obs.content, obs.created_at as obs_created,
            n.id as node_id_2, n.name, n.type, n.metadata, n.created_at as node_created,
            vector_distance_cos(obs.embedding, vector32(?)) as distance
          FROM vector_top_k('idx_obs_vec', vector32(?), ?) AS vt
          JOIN observations obs ON obs.rowid = vt.id
          JOIN nodes n ON n.id = obs.node_id`,
    args: [queryVec, queryVec, limit],
  });

  // Group by node, take the best observation per node
  const nodeMap = new Map<string, ActivatedNode>();
  for (const row of results.rows) {
    const nodeId = row.node_id as string;
    const distance = row.distance as number;
    const score = Math.max(0, 1 - distance); // cosine distance -> similarity

    if (!nodeMap.has(nodeId) || score > nodeMap.get(nodeId)!.activationScore) {
      nodeMap.set(nodeId, {
        node: {
          id: nodeId,
          name: row.name as string,
          type: row.type as string,
          metadata: JSON.parse((row.metadata as string) || "{}"),
          createdAt: row.node_created as number,
        },
        relevantObservations: [],
        activationScore: score,
        hopsFromSeed: 0,
      });
    }

    const activated = nodeMap.get(nodeId)!;
    if (activated.relevantObservations.length < CONFIG.maxObservationsPerNode) {
      activated.relevantObservations.push({
        id: row.obs_id as string,
        nodeId,
        content: row.content as string,
        embedding: [], // Don't carry embeddings in memory
        createdAt: row.obs_created as number,
      });
    }
  }

  return Array.from(nodeMap.values())
    .filter((n) => n.activationScore >= CONFIG.minActivationThreshold)
    .sort((a, b) => b.activationScore - a.activationScore);
}

async function spreadActivation(
  seeds: ActivatedNode[],
  hops: number,
  decay: number
): Promise<ActivatedSubgraph> {
  const db = getDb();
  const allNodes = new Map<string, ActivatedNode>();
  const allEdges: Edge[] = [];

  // Initialize with seeds
  for (const seed of seeds) {
    allNodes.set(seed.node.id, seed);
  }

  // BFS spreading activation
  let frontier = seeds.map((s) => s.node.id);

  for (let hop = 1; hop <= hops && frontier.length > 0; hop++) {
    const placeholders = frontier.map(() => "?").join(",");
    const edgeResults = await db.execute({
      sql: `SELECT e.id, e.source_id, e.target_id, e.relation, e.weight, e.created_at,
                   n.id as neighbor_id, n.name, n.type, n.metadata, n.created_at as n_created
            FROM edges e
            JOIN nodes n ON n.id = CASE
              WHEN e.source_id IN (${placeholders}) THEN e.target_id
              ELSE e.source_id
            END
            WHERE e.source_id IN (${placeholders}) OR e.target_id IN (${placeholders})`,
      args: [...frontier, ...frontier, ...frontier],
    });

    const nextFrontier: string[] = [];

    for (const row of edgeResults.rows) {
      const neighborId = row.neighbor_id as string;
      const edgeWeight = row.weight as number;
      const sourceId = row.source_id as string;

      // Find the parent's activation score
      const parentId = frontier.includes(sourceId) ? sourceId : (row.target_id as string);
      const parentScore = allNodes.get(parentId)?.activationScore ?? 0;
      const newScore = parentScore * edgeWeight * decay;

      if (newScore < CONFIG.minActivationThreshold) continue;

      // Record edge
      allEdges.push({
        id: row.id as string,
        sourceNodeId: row.source_id as string,
        targetNodeId: row.target_id as string,
        relation: row.relation as string | undefined,
        weight: edgeWeight,
        createdAt: row.created_at as number,
      });

      // Only add node if we haven't seen it or new score is higher
      if (!allNodes.has(neighborId) || newScore > allNodes.get(neighborId)!.activationScore) {
        allNodes.set(neighborId, {
          node: {
            id: neighborId,
            name: row.name as string,
            type: row.type as string,
            metadata: JSON.parse((row.metadata as string) || "{}"),
            createdAt: row.n_created as number,
          },
          relevantObservations: [],
          activationScore: newScore,
          hopsFromSeed: hop,
        });
        nextFrontier.push(neighborId);
      }
    }

    frontier = nextFrontier;
  }

  // Fetch observations for non-seed activated nodes
  for (const [nodeId, activated] of allNodes) {
    if (activated.hopsFromSeed === 0) continue; // Seeds already have observations
    const obsResults = await db.execute({
      sql: `SELECT id, node_id, content, created_at FROM observations
            WHERE node_id = ? ORDER BY created_at DESC LIMIT ?`,
      args: [nodeId, CONFIG.maxObservationsPerNode],
    });
    activated.relevantObservations = obsResults.rows.map((r) => ({
      id: r.id as string,
      nodeId: r.node_id as string,
      content: r.content as string,
      embedding: [],
      createdAt: r.created_at as number,
    }));
  }

  // Deduplicate edges
  const edgeSet = new Set<string>();
  const uniqueEdges = allEdges.filter((e) => {
    if (edgeSet.has(e.id)) return false;
    edgeSet.add(e.id);
    return true;
  });

  return {
    nodes: Array.from(allNodes.values()).sort((a, b) => b.activationScore - a.activationScore),
    edges: uniqueEdges,
    seedNodeIds: seeds.map((s) => s.node.id),
  };
}

export async function activate(
  sensorOutput: SensorOutput
): Promise<ActivatedSubgraph> {
  // Check if we have any observations at all
  const db = getDb();
  const count = await db.execute("SELECT COUNT(*) as c FROM observations");
  if ((count.rows[0]!.c as number) === 0) {
    // Cold start — empty graph
    return { nodes: [], edges: [], seedNodeIds: [] };
  }

  const seeds = await findSeeds(sensorOutput.embedding, CONFIG.seedLimit);
  if (seeds.length === 0) {
    return { nodes: [], edges: [], seedNodeIds: [] };
  }

  return spreadActivation(seeds, CONFIG.spreadHops, CONFIG.decayFactor);
}

export async function getNodeCount(): Promise<number> {
  const db = getDb();
  const result = await db.execute("SELECT COUNT(*) as c FROM nodes");
  return result.rows[0]!.c as number;
}

export async function getRecentNodes(limit: number = 10): Promise<GraphNode[]> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT id, name, type, metadata, created_at FROM nodes ORDER BY created_at DESC LIMIT ?",
    args: [limit],
  });
  return result.rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    type: r.type as string,
    metadata: JSON.parse((r.metadata as string) || "{}"),
    createdAt: r.created_at as number,
  }));
}
