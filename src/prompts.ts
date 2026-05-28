import type { LoopState, PFCOutput, ActivatedSubgraph } from "./types";

type Message = { role: "system" | "user" | "assistant"; content: string };

export function buildPFCPrompt(state: LoopState): Message[] {
  const rawInput = state.sensorOutputs.map((s) => s.raw).join("\n");
  const context = serializeSubgraph(state.activatedContext);
  const goals = state.goals
    .map((g) => {
      const indent = "  ".repeat(g.depth);
      const parent = g.parentId ? ` (parent: ${g.parentId})` : "";
      return `${indent}[${g.status}] id=${g.id} depth=${g.depth}${parent} ${g.description}${g.completionCriteria ? ` — done when: ${g.completionCriteria}` : ""}`;
    })
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

You can optionally manage the goal stack with your thoughts:
- Push a sub-goal: {"kind": "thought", "content": "reasoning...", "goalAction": "push", "subGoal": {"description": "what to accomplish", "completionCriteria": "when this is done"}}
- Pop current sub-goal (mark complete): {"kind": "thought", "content": "reasoning...", "goalAction": "pop"}

You can optionally request reactivation to pull new context from the knowledge graph:
{"kind": "thought", "content": "reasoning...", "reactivationHints": ["query 1", "query 2"]}

ACT (use an effector — include a prediction of expected outcome):
{"kind": "action", "effectorId": "<id>", "payload": <payload>, "prediction": {"expectedResult": "what you expect to happen", "confidence": 0.8}}

The prediction field is STRONGLY ENCOURAGED for every action. It helps the system detect surprises and learn.
- Base your prediction on what the Activated Context tells you. For example, if the graph says a service is at version X, predict that the health check will show version X.
- Include specific values from the graph in your prediction (versions, statuses, expected dependencies).
- Set confidence based on how certain the graph knowledge is (check observation confidence levels).

Available effectors:
- respond: Send a response to the user. payload: {"message": "your response"}
- sense: Perceive and investigate. Use this ONLY when the activated context does not contain the answer — read files, explore directories, research codebases, gather information from any source. It dispatches a research assistant that reads files, runs commands, and returns structured findings (entities, observations, relationships, summary). payload: {"task": "what to understand", "source": "/path/or/url", "hints": ["optional", "search", "terms"]}
  **Important**: When the activated context mentions specific file paths (e.g., "/tmp/foo/bar.json"), pass those exact paths in the "hints" array AND use the file's parent directory or the exact file path as the "source". This lets the research assistant go directly to the right location instead of searching blindly.
- act: Execute and change. Use this when you need to modify the world — write files, run builds, deploy, execute commands, create things. It dispatches an execution assistant that writes files, runs commands, and verifies results. payload: {"task": "what to accomplish", "context": "relevant context from previous sense findings — ALWAYS include data the act needs so it does not have to re-read source files"}
  **Important**: When you have already sensed/read data, pass the relevant findings in the "context" field so the act assistant can use them directly. The act assistant cannot access your working memory — it only sees the task and context you provide. Do NOT tell it to read source files you have already sensed; instead, include the extracted data in "context".
- deliberate: Structured reasoning for complex tasks. Use this BEFORE acting when a task requires upfront analysis — multi-system changes, architecture decisions, security-adjacent work, anything where assumptions matter. It explores perspectives, tracks assumptions with confidence levels, surfaces alternatives, and returns an ordered plan with verifiable assertions. payload: {"task": "what needs deliberation", "context": "relevant context from activated knowledge and prior sensing"}
  **When to use deliberate vs just thinking**: Use THINK for quick reasoning within a single step. Use DELIBERATE when the task has multiple interacting concerns, hidden assumptions, or non-obvious failure modes — when you need to explore before committing.

GOAL MANAGEMENT:
- Your goal stack shows your current objectives from outermost (abstract) to innermost (tactical).
- Decompose complex goals by pushing sub-goals. Pop sub-goals when they complete.
- The outermost goal persists — only push/pop inner sub-goals.
- When a sub-goal is complete, pop it and decide what's next for the parent goal.

CRITICAL RULES:
- **ALWAYS check your Activated Context first.** The activated context below contains knowledge graph data that is ALREADY RETRIEVED and relevant to the user's query. If the activated context contains the answer, respond directly — do NOT use sense or act to re-investigate what you already know. Only reach for effectors when the activated context is missing, incomplete, or insufficient.
- When the activated context contains multiple observations for the same entity with different timestamps, treat them as a chronological progression. The most recent observation represents the current state.
- Return ONLY a single valid JSON object. No extra text before or after.
- You are AUTONOMOUS. Use your effectors proactively — do NOT ask the user to do things you can do yourself.
- Use "sense" to perceive (read, explore, understand). Use "act" to effect change (write, build, execute).
- Think before you act. Use thoughts to plan, analyze, and reason.
- When you have enough information to respond, use the "respond" effector.
- **IMPORTANT**: If your working memory contains a [REACTIVATION:surprise] note, you MUST produce a THOUGHT first that reasons about the contradiction and connects it to your activated context BEFORE using the respond effector. Never respond immediately after a surprise — think first.
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
  // Use the deepest active goal (leaf) as the current goal for evaluation
  const activeGoals = state.goals.filter((g) => g.status === "active");
  const currentGoal = activeGoals.length > 0
    ? activeGoals.reduce((deepest, g) => g.depth > deepest.depth ? g : deepest)
    : undefined;
  const goalStack = state.goals
    .map((g) => `${"  ".repeat(g.depth)}[${g.status}] ${g.description}`)
    .join("\n");
  const outputStr =
    output.kind === "thought"
      ? `Thought: "${output.content}"`
      : `Action: effector="${(output as any).effectorId}" payload=${JSON.stringify((output as any).payload).slice(0, 500)}${(output as any).prediction ? `\nPrediction: ${JSON.stringify((output as any).prediction)}` : ""}`;

  return [
    {
      role: "system",
      content: `You are an evaluator observing a reasoning agent's output. Judge whether the agent should continue, stop, or redirect.

Return valid JSON:
{
  "status": "continue" | "done" | "redirect",
  "quality": "productive" | "neutral" | "counterproductive",
  "surprise": "none" | "low" | "high" | "critical",
  "rationale": "brief explanation",
  "redirectHint": "what the agent should do instead (only when status is redirect)",
  "reactivationQuery": "a search query describing the surprising information (only when surprise is high or critical)"
}

Rules:
- "done" when the agent has produced a response to the user (used the respond effector) or the goal is clearly satisfied.
- "continue" when the agent is making progress but hasn't finished.
- "redirect" when the agent is off-track — going in circles, pursuing an irrelevant path, or doing something counterproductive. Include a redirectHint telling the agent what to focus on instead.
- "counterproductive" if the agent is repeating itself, ignoring results, or drifting from the goal.
- When surprise is "high" or "critical", include a reactivationQuery — a concise search phrase describing the NEW or UNEXPECTED information (not the original topic). The reactivation query is used to search the knowledge graph for related context the agent doesn't currently have. Focus on the surprising details: new version numbers, unexpected dependencies, contradictions with stored knowledge. Bad query: "AuthService health" (too generic). Good query: "Keycloak migration v4.0.0 OpenID Connect" (targets the surprise).
- When the activated context says one thing but the effector result says another, that is a CONTRADICTION — flag surprise as "high" or "critical".
- When the agent included a prediction with an action, compare it against the actual result to assess surprise level.
- Keep rationale to one sentence.`,
    },
    {
      role: "user",
      content: [
        `Current goal: ${currentGoal?.description ?? "Respond to user input"}`,
        `Completion criteria: ${currentGoal?.completionCriteria ?? "User receives a response"}`,
        `Goal stack:\n${goalStack}`,
        `Iteration: ${state.iterationCount + 1}`,
        // Give the evaluator the activated context so it can detect contradictions
        state.activatedContext.nodes.length > 0
          ? `Activated context (what the graph says):\n${state.activatedContext.nodes.slice(0, 5).map((n) =>
              `  [${n.node.type}] ${n.node.name}: ${n.relevantObservations.map((o) => o.content.slice(0, 100)).join("; ")}`
            ).join("\n")}`
          : "",
        // Give the evaluator the last effector result so it can compare against predictions
        state.lastEffectorResult
          ? `Last effector result: ${state.lastEffectorResult.success ? "success" : "error"} — ${String(state.lastEffectorResult.data).slice(0, 500)}`
          : "",
        `Agent output: ${outputStr}`,
      ].filter(Boolean).join("\n"),
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
