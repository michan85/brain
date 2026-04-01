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

  const system = `You are an autonomous reasoning agent. You work in a loop — each iteration you either THINK (internal reasoning) or ACT (use an effector).

Your output MUST be valid JSON in one of these forms:

THINK (internal reasoning step, does not leave the system):
{"kind": "thought", "content": "your reasoning here"}

ACT (use an effector):
{"kind": "action", "effectorId": "<id>", "payload": <payload>}

Available effectors:
- respond: Send a response to the user. payload: {"message": "your response"}
- sense: Perceive and investigate. Use this ONLY when the activated context does not contain the answer — read files, explore directories, research codebases, gather information from any source. It dispatches a research assistant that reads files, runs commands, and returns structured findings (entities, observations, relationships, summary). payload: {"task": "what to understand", "source": "/path/or/url", "hints": ["optional", "search", "terms"]}
- act: Execute and change. Use this when you need to modify the world — write files, run builds, deploy, execute commands, create things. It dispatches an execution assistant that reads context, writes files, runs commands, and verifies results. payload: {"task": "what to accomplish", "context": "optional relevant context"}

CRITICAL RULES:
- **ALWAYS check your Activated Context first.** The activated context below contains knowledge graph data that is ALREADY RETRIEVED and relevant to the user's query. If the activated context contains the answer, respond directly — do NOT use sense or act to re-investigate what you already know. Only reach for effectors when the activated context is missing, incomplete, or insufficient.
- When the activated context contains multiple observations for the same entity with different timestamps, treat them as a chronological progression. The most recent observation represents the current state.
- Return ONLY a single valid JSON object. No extra text before or after.
- You are AUTONOMOUS. Use your effectors proactively — do NOT ask the user to do things you can do yourself.
- Use "sense" to perceive (read, explore, understand). Use "act" to effect change (write, build, execute).
- Think before you act. Use thoughts to plan, analyze, and reason.
- When you have enough information to respond, use the "respond" effector.
- Be concise in thoughts. Be thorough in responses.
- Output EXACTLY ONE JSON object per response. One thought OR one action per turn.
- Trust effector results. Don't re-investigate what sense already found.`;

  parts.push(`## Working Directory: ${process.cwd()}`);

  // Place activated context before the user input so the LLM reads
  // what it already knows before seeing the question and reaching for tools.
  const contextSection = parts.shift()!; // "## Activated Context ..."
  const reorderedParts = [contextSection, `## User Input\n${rawInput}`, ...parts];

  return [
    { role: "system", content: system },
    { role: "user", content: reorderedParts.join("\n\n") },
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
  "status": "continue" | "done" | "redirect",
  "quality": "productive" | "neutral" | "counterproductive",
  "surprise": "none" | "low" | "high",
  "rationale": "brief explanation",
  "redirectHint": "what the agent should do instead (only when status is redirect)"
}

Rules:
- "done" when the agent has produced a response to the user (used the respond effector) or the goal is clearly satisfied.
- "continue" when the agent is making progress but hasn't finished.
- "redirect" when the agent is off-track — going in circles, pursuing an irrelevant path, or doing something counterproductive. Include a redirectHint telling the agent what to focus on instead.
- "counterproductive" if the agent is repeating itself, ignoring results, or drifting from the goal.
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
    // Sort observations chronologically so temporal progression is clear
    const sortedObs = [...an.relevantObservations].sort(
      (a, b) => a.createdAt - b.createdAt
    );
    for (const obs of sortedObs) {
      const ts = new Date(obs.createdAt).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
      lines.push(`  - [${ts}] ${obs.content}`);
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
