import { createInterface } from "readline";
import { initDb } from "./db";
import { processTextInput } from "./sensor";
import { activate, getNodeCount, getRecentNodes } from "./graph";
import { runPFCLoop } from "./pfc";
import { writeScratch } from "./scratch";
import { consolidate, backlogSize } from "./dreamer";
import { generateId } from "./utils";

const sessionId = generateId();

async function learnFromInteraction(
  input: string,
  response: string,
  sensorOutput: Awaited<ReturnType<typeof processTextInput>>
) {
  // Write extracted entities and co-mentions as scratch traces for the Dreamer to consolidate.
  // The Dreamer decides what gets promoted to the knowledge graph.
  for (const entity of sensorOutput.entities) {
    await writeScratch(sessionId, "observation", `[entity:${entity.type}] ${entity.name} — mentioned in: "${input.slice(0, 200)}"`, {
      relatedNodeIds: [],
    });
  }

  // Record co-mention relationships as traces
  const entityNames = sensorOutput.entities.map((e) => e.name);
  if (entityNames.length > 1) {
    await writeScratch(sessionId, "observation",
      `[co_mention] Entities mentioned together: ${entityNames.join(", ")} — in: "${input.slice(0, 200)}"`,
    );
  }
}

async function main() {
  console.log("🧠 Brain Agent Prototype");
  console.log("Initializing database...");
  await initDb();

  const nodeCount = await getNodeCount();
  console.log(`Knowledge graph: ${nodeCount} nodes`);
  console.log(`Session: ${sessionId.slice(0, 8)}`);
  console.log('Type your task. Commands: /graph, /dream, /quit\n');

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

    if (input === "/dream") {
      const pending = await backlogSize();
      console.log(`\n💤 Dreamer: ${pending} unconsolidated traces`);
      if (pending > 0) {
        console.log("Starting consolidation...\n");
        await consolidate();
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
      const activated = await activate(sensorOutput, sessionId);
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
