import { createInterface } from "readline";
import { initDb } from "./db";
import { processTextInput } from "./sensor";
import { activate, upsertNode, addObservation, addEdge, getNodeCount, getRecentNodes } from "./graph";
import { runPFCLoop } from "./pfc";
import { embed } from "./llm";
import { generateId } from "./utils";

const sessionId = generateId();

async function learnFromInteraction(
  input: string,
  response: string,
  sensorOutput: Awaited<ReturnType<typeof processTextInput>>
) {
  // Write extracted entities as nodes, input as observations, edges between co-occurring entities
  const nodeIds: string[] = [];

  for (const entity of sensorOutput.entities) {
    const node = await upsertNode(entity.name, entity.type);
    const obsEmbedding = await embed(`${entity.name}: ${input}`) as number[];
    await addObservation(node.id, input, obsEmbedding);
    nodeIds.push(node.id);
  }

  // Create edges between co-occurring entities
  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      await addEdge(nodeIds[i]!, nodeIds[j]!, "co_mentioned", 0.5);
    }
  }
}

async function main() {
  console.log("🧠 Brain Agent Prototype");
  console.log("Initializing database...");
  await initDb();

  const nodeCount = await getNodeCount();
  console.log(`Knowledge graph: ${nodeCount} nodes`);
  console.log(`Session: ${sessionId.slice(0, 8)}`);
  console.log('Type your task. Commands: /graph, /quit\n');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "you> ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input === "/quit") {
      console.log("Goodbye.");
      rl.close();
      process.exit(0);
    }

    if (input === "/graph") {
      const count = await getNodeCount();
      const recent = await getRecentNodes(10);
      console.log(`\n📊 Knowledge Graph: ${count} nodes`);
      for (const n of recent) {
        console.log(`  [${n.type}] ${n.name}`);
      }
      console.log();
      rl.prompt();
      return;
    }

    try {
      // 1. Sensor processing
      console.log("\n🔍 Processing input...");
      const sensorOutput = await processTextInput(input);
      console.log(
        `  Entities: ${sensorOutput.entities.map((e) => `${e.name} (${e.type})`).join(", ") || "none"}`
      );

      // 2. Graph activation
      console.log("🧠 Activating knowledge graph...");
      const activated = await activate(sensorOutput);
      console.log(
        `  Activated: ${activated.nodes.length} nodes, ${activated.edges.length} edges`
      );

      // 3. PFC Loop
      console.log("🔄 Reasoning...");
      const response = await runPFCLoop(sensorOutput, activated, sessionId);

      // 4. Output
      console.log(`\n🤖 ${response}\n`);

      // 5. Learn from interaction (write to graph)
      await learnFromInteraction(input, response, sensorOutput);
    } catch (err: any) {
      console.error(`\n❌ Error: ${err.message}\n`);
    }

    rl.prompt();
  });
}

main();
