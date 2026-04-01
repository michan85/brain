/**
 * CLI entry point: seed the knowledge graph from a JSON file.
 *
 * Usage: bun run src/cli/seed.ts --file path/to/graph.json [--db path/to/brain.db]
 */

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const filePath = getArg("file");
if (!filePath) {
  console.error("Usage: bun run src/cli/seed.ts --file path/to/graph.json [--db path/to/brain.db]");
  process.exit(1);
}

const dbPath = getArg("db");
if (dbPath) {
  process.env.BRAIN_DB_PATH = `file:${dbPath}`;
}

interface SeedObservation {
  content: string;
  confidence?: number;
  createdAt?: number;
}

interface SeedNode {
  name: string;
  type: string;
  observations?: SeedObservation[];
}

interface SeedEdge {
  source: string;
  target: string;
  relation: string;
  weight?: number;
}

interface SeedFile {
  nodes?: SeedNode[];
  edges?: SeedEdge[];
}

async function main() {
  // Dynamic imports so BRAIN_DB_PATH is set before config.ts evaluates
  const { initDb } = await import("../db");
  const { upsertNode, addObservation, addEdge } = await import("../graph");
  const { embed } = await import("../llm");

  let data: SeedFile;
  try {
    const raw = await Bun.file(filePath!).text();
    data = JSON.parse(raw) as SeedFile;
  } catch (err: any) {
    console.error(`Error reading seed file: ${err.message}`);
    process.exit(1);
  }

  await initDb();

  const nodes = data.nodes ?? [];
  const edges = data.edges ?? [];

  const nameToId = new Map<string, string>();
  let obsCount = 0;

  for (const entry of nodes) {
    const node = await upsertNode(entry.name, entry.type);
    nameToId.set(entry.name, node.id);

    if (entry.observations) {
      for (const obs of entry.observations) {
        const embedding = await embed(`${entry.name}: ${obs.content}`) as number[];
        await addObservation(node.id, obs.content, embedding, obs.confidence ?? 1.0, obs.createdAt);
        obsCount++;
      }
    }
  }

  let edgeCount = 0;
  for (const edge of edges) {
    const sourceId = nameToId.get(edge.source);
    const targetId = nameToId.get(edge.target);

    if (!sourceId) {
      console.error(`Warning: source node "${edge.source}" not found in seed file, skipping edge`);
      continue;
    }
    if (!targetId) {
      console.error(`Warning: target node "${edge.target}" not found in seed file, skipping edge`);
      continue;
    }

    await addEdge(sourceId, targetId, edge.relation, edge.weight ?? 1.0);
    edgeCount++;
  }

  console.log(`Seeded ${nodes.length} nodes, ${obsCount} observations, ${edgeCount} edges`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
