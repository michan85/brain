import { CONFIG } from "./config";
import { callLLM, extractJson } from "./llm";
import { writeScratch } from "./scratch-traces";
import type { EffectorResult, DeliberationResult, Decision, PlanStep } from "./types";

const DELIBERATION_SYSTEM_PROMPT = `You are a structured reasoning engine. Given a task, you must analyze it from multiple relevant perspectives and produce a deliberation result as a single JSON object.

Your output MUST be valid JSON with this exact shape:
{
  "summary": "1-2 sentence overview of the deliberation",
  "decisions": [
    {
      "id": "d-1",
      "what": "the decision being made",
      "why": "rationale for this decision",
      "assumptions": [
        {
          "claim": "specific assumption being made",
          "confidence": 0.8,
          "costIfWrong": "low" | "medium" | "high" | "critical",
          "validationMethod": "how to verify this assumption (optional)"
        }
      ],
      "alternatives": [
        {
          "description": "alternative approach considered",
          "tradeoff": "why it was not chosen"
        }
      ],
      "dependsOn": ["d-0"]
    }
  ],
  "plan": [
    {
      "order": 1,
      "action": "what to do",
      "effector": "sense" | "act" | "respond",
      "rationale": "why this step is needed",
      "dependsOnSteps": [],
      "dependsOnDecisions": ["d-1"],
      "assertions": [
        {
          "claim": "specific, provably true-or-false statement that must hold after this step",
          "verificationCommand": "optional command to verify"
        }
      ]
    }
  ],
  "risks": ["top 3-5 risks, ordered by severity"],
  "confidence": 0.75
}

RULES:
- Analyze the task from multiple perspectives (security, UX, architecture, operations, data — choose what's relevant).
- For each significant decision, state: what, why, assumptions (with confidence 0-1 and costIfWrong), alternatives considered.
- Surface load-bearing assumptions explicitly. A load-bearing assumption is one where being wrong changes the plan fundamentally.
- Create an ordered plan where each step specifies: action, effector type (sense/act/respond), rationale, dependency ordering, and assertions.
- Assertions must be specific, provably true-or-false statements. Bad: "code is clean". Good: "file /tmp/out.json exists and contains valid JSON with a 'users' array".
- Include a risks section with the top 3-5 risks ordered by severity.
- Set overall confidence (0-1) based on how well-supported the assumptions are. Low confidence = many uncertain assumptions.
- Output ONLY the JSON object. No extra text.`;

export async function deliberateEffector(payload: unknown): Promise<EffectorResult> {
  const start = performance.now();
  try {
    const { task, context } = payload as {
      task: string;
      context?: string;
    };

    const userContent = context
      ? `Task: ${task}\n\nContext:\n${context}`
      : `Task: ${task}`;

    const response = await callLLM(
      [
        { role: "system", content: DELIBERATION_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      { model: CONFIG.reasoningModel }
    );

    const parsed = JSON.parse(extractJson(response));
    const result = applyDefaults(parsed);

    return {
      success: true,
      data: result,
      durationMs: performance.now() - start,
    };
  } catch (e: any) {
    return {
      success: false,
      data: null,
      error: e.message,
      durationMs: performance.now() - start,
    };
  }
}

export function applyDefaults(raw: Record<string, unknown>): DeliberationResult {
  const summary = typeof raw.summary === "string" ? raw.summary : "";
  const risks = Array.isArray(raw.risks) ? raw.risks.map(String) : [];
  const confidence = typeof raw.confidence === "number"
    ? Math.max(0, Math.min(1, raw.confidence))
    : 0.5;

  const rawDecisions = Array.isArray(raw.decisions) ? raw.decisions : [];
  const decisions: Decision[] = rawDecisions.map((d: any, i: number) => ({
    id: typeof d.id === "string" && d.id ? d.id : `d-${i + 1}`,
    what: typeof d.what === "string" ? d.what : "",
    why: typeof d.why === "string" ? d.why : "",
    assumptions: Array.isArray(d.assumptions)
      ? d.assumptions.map((a: any) => ({
          claim: typeof a.claim === "string" ? a.claim : "",
          confidence: typeof a.confidence === "number" ? Math.max(0, Math.min(1, a.confidence)) : 0.5,
          costIfWrong: ["low", "medium", "high", "critical"].includes(a.costIfWrong) ? a.costIfWrong : "medium",
          ...(a.validationMethod ? { validationMethod: String(a.validationMethod) } : {}),
        }))
      : [],
    alternatives: Array.isArray(d.alternatives)
      ? d.alternatives.map((a: any) => ({
          description: typeof a.description === "string" ? a.description : "",
          tradeoff: typeof a.tradeoff === "string" ? a.tradeoff : "",
        }))
      : [],
    ...(Array.isArray(d.dependsOn) ? { dependsOn: d.dependsOn.map(String) } : {}),
  }));

  const rawPlan = Array.isArray(raw.plan) ? raw.plan : [];
  const plan: PlanStep[] = rawPlan.map((s: any, i: number) => ({
    order: typeof s.order === "number" ? s.order : i + 1,
    action: typeof s.action === "string" ? s.action : "",
    effector: ["sense", "act", "respond"].includes(s.effector) ? s.effector : "sense",
    rationale: typeof s.rationale === "string" ? s.rationale : "",
    ...(Array.isArray(s.dependsOnSteps) ? { dependsOnSteps: s.dependsOnSteps.map(Number) } : {}),
    ...(Array.isArray(s.dependsOnDecisions) ? { dependsOnDecisions: s.dependsOnDecisions.map(String) } : {}),
    assertions: Array.isArray(s.assertions)
      ? s.assertions.map((a: any) => ({
          claim: typeof a.claim === "string" ? a.claim : "",
          ...(a.verificationCommand ? { verificationCommand: String(a.verificationCommand) } : {}),
        }))
      : [],
    status: "pending" as const,
  }));

  return { summary, decisions, plan, risks, confidence };
}

export function formatDeliberateForWorkingMemory(
  task: string,
  result: DeliberationResult
): string {
  const lines: string[] = [
    `[deliberate] Task: "${task}"`,
    `Summary: ${result.summary}`,
  ];

  if (result.decisions.length > 0) {
    lines.push(`Decisions (${result.decisions.length}):`);
    for (const d of result.decisions) {
      lines.push(`  ${d.id}: ${d.what} — ${d.why}`);
      for (const a of d.assumptions) {
        lines.push(`    Assumptions: ${a.claim} (conf: ${a.confidence}, cost: ${a.costIfWrong})`);
      }
    }
  }

  if (result.plan.length > 0) {
    lines.push(`Plan (${result.plan.length} steps):`);
    for (const s of result.plan) {
      lines.push(`  ${s.order}. [${s.effector}] ${s.action} — ${s.rationale}`);
    }
  }

  if (result.risks.length > 0) {
    lines.push(`Risks: ${result.risks.join("; ")}`);
  }

  lines.push(`Confidence: ${result.confidence}`);
  lines.push(`[deliberation complete — execute plan steps via sense/act]`);

  return lines.join("\n");
}

export async function writeDeliberateToScratch(
  sessionId: string,
  result: DeliberationResult
): Promise<void> {
  for (const d of result.decisions) {
    await writeScratch(sessionId, "deliberation",
      `[decision:${d.id}] ${d.what} — ${d.why} | assumptions: ${d.assumptions.map((a) => `${a.claim} (${a.confidence})`).join(", ")}`
    );
  }
  for (const s of result.plan) {
    await writeScratch(sessionId, "deliberation",
      `[plan:${s.order}] [${s.effector}] ${s.action} — ${s.rationale}`
    );
  }
}
