import { join } from "node:path";
import { initDb, getDb } from "../../src/db";
import { processTextInput } from "../../src/sensor";
import { activate } from "../../src/graph";
import { runPFCLoop } from "../../src/pfc";
import { writeScratch } from "../../src/scratch-traces";
import {
  initChatDb,
  listConversations,
  createConversation,
  getConversation,
  updateConversationTitle,
  getMessages,
  addMessage,
} from "./chat-db";
import index from "./index.html";

const RUNS_DIR = join(import.meta.dir, "runs");

// Initialize databases
console.log("Initializing brain database...");
await initDb();
console.log("Initializing chat database...");
initChatDb();
console.log("Ready.");

Bun.serve({
  port: 3332,
  routes: {
    "/": index,

    "/api/conversations": {
      GET: () => {
        const conversations = listConversations();
        return Response.json(conversations);
      },

      POST: async () => {
        const id = crypto.randomUUID();
        const sessionId = crypto.randomUUID();
        const conversation = createConversation(id, sessionId, null);
        return Response.json(conversation, { status: 201 });
      },
    },

    "/api/conversations/:id": {
      GET: (req) => {
        const conversation = getConversation(req.params.id);
        if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
        const messages = getMessages(conversation.id);
        return Response.json({ ...conversation, messages });
      },
    },

    "/api/graph": {
      GET: async () => {
        const db = getDb();
        const [nodesResult, edgesResult] = await Promise.all([
          db.execute("SELECT id, name, type, metadata, created_at, last_activated_at FROM nodes"),
          db.execute("SELECT id, source_id, target_id, relation, weight, created_at FROM edges"),
        ]);
        const nodes = nodesResult.rows.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          metadata: JSON.parse((r.metadata as string) || "{}"),
          createdAt: r.created_at,
          lastActivatedAt: r.last_activated_at ?? 0,
        }));
        const edges = edgesResult.rows.map((r) => ({
          id: r.id,
          source: r.source_id,
          target: r.target_id,
          relation: r.relation,
          weight: r.weight,
          createdAt: r.created_at,
        }));
        return Response.json({ nodes, edges });
      },
    },

    "/api/nodes/:id/observations": {
      GET: async (req) => {
        const db = getDb();
        const result = await db.execute({
          sql: `SELECT id, node_id, content, confidence, created_at, last_activated_at, superseded_by
                FROM observations WHERE node_id = ? ORDER BY created_at DESC`,
          args: [req.params.id],
        });
        const observations = result.rows.map((r) => ({
          id: r.id,
          nodeId: r.node_id,
          content: r.content,
          confidence: r.confidence ?? 1.0,
          createdAt: r.created_at,
          lastActivatedAt: r.last_activated_at ?? 0,
          supersededBy: r.superseded_by,
        }));
        return Response.json({ observations });
      },
    },

    "/api/stats": {
      GET: async () => {
        const db = getDb();
        const [nodes, edges, observations] = await Promise.all([
          db.execute("SELECT COUNT(*) as c FROM nodes"),
          db.execute("SELECT COUNT(*) as c FROM edges"),
          db.execute("SELECT COUNT(*) as c FROM observations"),
        ]);
        const types = await db.execute(
          "SELECT type, COUNT(*) as c FROM nodes GROUP BY type ORDER BY c DESC"
        );
        return Response.json({
          nodes: nodes.rows[0]!.c,
          edges: edges.rows[0]!.c,
          observations: observations.rows[0]!.c,
          nodeTypes: types.rows.map((r) => ({ type: r.type, count: r.c })),
        });
      },
    },

    "/api/conversations/:id/messages": {
      POST: async (req) => {
        const conversation = getConversation(req.params.id);
        if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });

        const body = await req.json() as { content: string };
        if (!body.content?.trim()) {
          return Response.json({ error: "Empty message" }, { status: 400 });
        }

        const input = body.content.trim();
        const { sessionId } = conversation;

        // Save user message
        const userMsg = addMessage(crypto.randomUUID(), conversation.id, "user", input);

        // Auto-title on first message
        if (!conversation.title) {
          updateConversationTitle(conversation.id, input.slice(0, 80));
        }

        // Run brain pipeline
        const logDir = join(RUNS_DIR, sessionId);

        try {
          const sensorOutput = await processTextInput(input);
          const activated = await activate(sensorOutput);
          const response = await runPFCLoop(sensorOutput, activated, sessionId, { logDir });

          // Learn from interaction (write scratch traces)
          for (const entity of sensorOutput.entities) {
            await writeScratch(sessionId, "observation",
              `[entity:${entity.type}] ${entity.name} — mentioned in: "${input.slice(0, 200)}"`,
              { relatedNodeIds: [] }
            );
          }
          const entityNames = sensorOutput.entities.map((e) => e.name);
          if (entityNames.length > 1) {
            await writeScratch(sessionId, "observation",
              `[co_mention] Entities mentioned together: ${entityNames.join(", ")} — in: "${input.slice(0, 200)}"`
            );
          }

          // Save assistant message
          const assistantMsg = addMessage(crypto.randomUUID(), conversation.id, "assistant", response);
          return Response.json(assistantMsg);
        } catch (err: any) {
          const errorMsg = addMessage(
            crypto.randomUUID(),
            conversation.id,
            "assistant",
            `Error: ${err.message}`
          );
          return Response.json(errorMsg, { status: 500 });
        }
      },
    },
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log("Simple Chat running at http://localhost:3332");
