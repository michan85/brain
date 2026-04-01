import type { LoopState, PFCOutput, ActivatedSubgraph } from "./types";

type Message = { role: "system" | "user" | "assistant"; content: string };

export function buildPFCPrompt(state: LoopState): Message[] {
  const rawInput = state.sensorOutputs.map((s) => s.raw).join("\n");
  const context = serializeSubgraph(state.activatedContext);
  const goals = state.goals
    .map((g) => `[${g.status}] (depth ${g.depth}) ${g.description}${g.completionCriteria ? ` — done when: ${g.completionCriteria}` : ""}`)
    .join("\n");
  const memory = state.workingMemory
    .map((t) => `[thought] ${t.content}`)
    .join("\n");

  const parts: string[] = [];

  if (context) {
    parts.push(`## Activated Context (from knowledge graph)\n${context}`);
  } else {
    parts.push(`## Activated Context\nNo relevant context found in knowledge graph (cold start or no matches).`);
  }

  parts.push(`## Current Goals\n${goals || "No goals set yet."}`);

  if (memory) {
    parts.push(`## Working Memory (recent thoughts)\n${memory}`);
  }

  if (state.lastEffectorResult) {
    const r = state.lastEffectorResult;
    parts.push(
      `## Last Action Result\nSuccess: ${r.success}\nData: ${typeof r.data === "string" ? r.data.slice(0, 2000) : JSON.stringify(r.data).slice(0, 2000)}${r.error ? `\nError: ${r.error}` : ""}`
    );
  }

  if (state.lastEvaluation) {
    const e = state.lastEvaluation;
    parts.push(
      `## Last Evaluation\nStatus: ${e.status} | Quality: ${e.quality} | Surprise: ${e.surprise}\nRationale: ${e.rationale}`
    );
  }

  parts.push(`## Iteration: ${state.iterationCount + 1}`);

  const system = `You are an autonomous reasoning agent with access to tools. You work in a loop — each iteration you either THINK (internal reasoning) or ACT (use a tool/respond).

Your output MUST be valid JSON in one of these forms:

THINK (internal reasoning step, does not leave the system):
{"kind": "thought", "content": "your reasoning here"}

ACT (use a tool or respond to the user):
{"kind": "action", "effectorId": "<id>", "payload": <payload>}

Available effectors:
- respond: Send a response to the user. payload: {"message": "your response"}
- readFile: Read a file. payload: {"path": "/absolute/path", "offset": 0, "limit": 500}. Offset is the starting line number (0-based), limit is number of lines. Default: first 500 lines. For large files, the response tells you total line count and how to read more with offset. Previous read results are stored in your working memory — check before re-reading the same section.
- writeFile: Write a file. payload: {"path": "/absolute/path", "content": "file content"}
- bash: Run a shell command. payload: {"command": "your command", "offset": 0, "limit": 200}. Large outputs are paged (default 200 lines). To page through previous output, omit command and provide offset: {"offset": 200}.
- sense: Investigate a source and extract structured knowledge. Use this for research tasks — exploring repos, reading documentation, understanding codebases. It dispatches a research assistant that reads files, runs commands, and returns structured findings (entities, observations, relationships, summary). payload: {"task": "what to investigate", "source": "/path/or/url", "hints": ["optional", "search", "terms"]}. PREFER this over manually reading files one by one when you need to understand something broad.

CRITICAL RULES:
- Return ONLY a single valid JSON object. No extra text before or after.
- You are AUTONOMOUS. Use your tools proactively — do NOT ask the user to do things you can do yourself.
- If the user mentions a file, READ IT using readFile or bash. Do not ask them to paste it.
- If you need to find files, use bash with ls, find, or grep.
- For broad research tasks (understanding a repo, reading documentation), use the "sense" effector instead of manually reading files one by one.
- Think before you act. Use thoughts to plan, analyze, and reason.
- When you have enough information to respond, use the "respond" effector.
- Be concise in thoughts. Be thorough in responses.
- IMPORTANT: Output EXACTLY ONE JSON object per response. Never output multiple JSON objects. One thought OR one action per turn. If you want to do multiple things, do them across multiple turns.
- After using the "sense" effector, trust its findings. Don't re-investigate the same source manually.`;

  parts.push(`## Working Directory: ${process.cwd()}`);

  return [
    { role: "system", content: system },
    { role: "user", content: `## User Input\n${rawInput}\n\n${parts.join("\n\n")}` },
  ];
}

export function buildEvaluatorPrompt(
  output: PFCOutput,
  state: LoopState
): Message[] {
  const currentGoal = state.goals.find((g) => g.status === "active");
  const outputStr =
    output.kind === "thought"
      ? `Thought: "${output.content}"`
      : `Action: effector="${(output as any).effectorId}" payload=${JSON.stringify((output as any).payload).slice(0, 500)}`;

  return [
    {
      role: "system",
      content: `You are an evaluator observing a reasoning agent's output. Judge whether the agent should continue, stop, or redirect.

Return valid JSON:
{
  "status": "continue" | "done",
  "quality": "productive" | "neutral" | "counterproductive",
  "surprise": "none" | "low" | "high",
  "rationale": "brief explanation"
}

Rules:
- "done" when the agent has produced a response to the user (used the respond effector) or the goal is clearly satisfied.
- "continue" when the agent is making progress but hasn't finished.
- "counterproductive" if the agent is going in circles or doing something irrelevant.
- Keep rationale to one sentence.`,
    },
    {
      role: "user",
      content: `Goal: ${currentGoal?.description ?? "Respond to user input"}\nCompletion criteria: ${currentGoal?.completionCriteria ?? "User receives a response"}\nIteration: ${state.iterationCount + 1}\nAgent output: ${outputStr}`,
    },
  ];
}

function serializeSubgraph(subgraph: ActivatedSubgraph): string {
  if (subgraph.nodes.length === 0) return "";

  const lines: string[] = [];
  for (const an of subgraph.nodes) {
    const seed = subgraph.seedNodeIds.includes(an.node.id) ? " [SEED]" : "";
    lines.push(
      `[${an.node.type}: "${an.node.name}" (score: ${an.activationScore.toFixed(2)}, hops: ${an.hopsFromSeed})${seed}]`
    );
    for (const obs of an.relevantObservations) {
      lines.push(`  - ${obs.content}`);
    }
  }

  if (subgraph.edges.length > 0) {
    lines.push("\nRelationships:");
    for (const e of subgraph.edges.slice(0, 20)) {
      const source = subgraph.nodes.find((n) => n.node.id === e.sourceNodeId);
      const target = subgraph.nodes.find((n) => n.node.id === e.targetNodeId);
      if (source && target) {
        lines.push(
          `  "${source.node.name}" --${e.relation ?? "related"}--> "${target.node.name}" (weight: ${e.weight})`
        );
      }
    }
  }

  return lines.join("\n");
}
