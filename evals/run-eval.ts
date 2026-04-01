/**
 * Eval run orchestrator: sets up, drives, and grades a single brain agent evaluation scenario.
 *
 * Usage: bun run evals/run-eval.ts --scenario evals/scenarios/S01_cold_start_direct_answer/ [--timeout 300] [--skip-llm-grade]
 *
 * --scenario accepts either a scenario folder or a path to eval.md within it.
 */

import { join, basename, dirname, resolve } from "path";
import { mkdirSync, existsSync, readFileSync, cpSync } from "fs";
import { callLLM, extractJson } from "../src/llm";
import { CONFIG } from "../src/config";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= argv.length) return undefined;
  return argv[idx + 1];
}

const scenarioArg = getArg("scenario");
if (!scenarioArg) {
  console.error(
    "Usage: bun run evals/run-eval.ts --scenario <path-to-scenario-folder-or-eval.md> [--timeout 300]"
  );
  process.exit(1);
}

/**
 * Resolve the scenario folder and eval.md path from the --scenario argument.
 * Accepts either a folder path or a direct path to eval.md.
 */
function resolveScenarioPaths(arg: string): { scenarioFolder: string; evalMdPath: string } {
  const resolved = resolve(arg);
  if (resolved.endsWith("eval.md") || resolved.endsWith(".md")) {
    return { scenarioFolder: dirname(resolved), evalMdPath: resolved };
  }
  // Treat as folder — strip trailing slash if present
  const folder = resolved.replace(/\/+$/, "");
  return { scenarioFolder: folder, evalMdPath: join(folder, "eval.md") };
}

const { scenarioFolder, evalMdPath } = resolveScenarioPaths(scenarioArg);

function hasFlag(name: string): boolean {
  return argv.includes(`--${name}`);
}

const timeoutSeconds = parseInt(getArg("timeout") ?? "300", 10);
const skipLlmGrade = hasFlag("skip-llm-grade");
const ROOT = resolve(import.meta.dir, "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSessionId(): string {
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const suffix = Math.random().toString(16).slice(2, 6);
  return `${ts}-${suffix}`;
}

/** Extract text between a markdown heading and the next heading of equal or higher level. */
function extractSection(md: string, heading: string): string | null {
  // Match ### Initial Prompt, ## Setup, etc.
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `^(#{1,6})\\s+${escaped}\\s*$`,
    "im"
  );
  const match = regex.exec(md);
  if (!match) return null;

  const level = match[1].length; // number of #
  const startIdx = match.index + match[0].length;

  // Find the next heading of equal or higher (fewer #) level
  const rest = md.slice(startIdx);
  const nextHeading = new RegExp(`^#{1,${level}}\\s+`, "m");
  const nextMatch = nextHeading.exec(rest);
  const section = nextMatch ? rest.slice(0, nextMatch.index) : rest;

  return section.trim();
}

/** Pull the quoted or bare-text prompt from the Initial Prompt section. */
function extractInitialPrompt(md: string): string | null {
  const section = extractSection(md, "Initial Prompt");
  if (!section) return null;

  // Try to find a quoted string first
  const quoteMatch = section.match(/"([^"]+)"/);
  if (quoteMatch) return quoteMatch[1];

  // Fall back to the first non-empty line
  const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[0] ?? null;
}

/** Extract estimated iteration range from Metadata section (e.g., "1-2" -> {min:1, max:2}). */
function extractEstimatedIterations(md: string): { min: number; max: number } | null {
  const meta = extractSection(md, "Metadata");
  if (!meta) return null;

  const match = meta.match(/Estimated iterations[:\s]*(\d+)\s*-\s*(\d+)/i);
  if (!match) {
    // Try single number
    const single = meta.match(/Estimated iterations[:\s]*(\d+)/i);
    if (single) return { min: parseInt(single[1], 10), max: parseInt(single[1], 10) };
    return null;
  }
  return { min: parseInt(match[1], 10), max: parseInt(match[2], 10) };
}

/** Extract scenario ID from folder name, e.g., "S01_cold_start_direct_answer" */
function scenarioId(folderPath: string): string {
  // If it's a path to eval.md, use the parent folder name
  const b = basename(folderPath);
  if (b === "eval.md" || b.endsWith(".md")) {
    return basename(dirname(folderPath));
  }
  return basename(folderPath);
}

// ---------------------------------------------------------------------------
// Scenario setup.ts support
// ---------------------------------------------------------------------------

interface ScenarioSetupModule {
  setup?: () => Promise<void> | void;
  teardown?: () => Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Step 1: Setup
// ---------------------------------------------------------------------------

async function setup(scenarioFolderPath: string, evalMdFilePath: string) {
  const sessionId = generateSessionId();
  const runDir = join(ROOT, "evals", "runs", sessionId);
  const logsDir = join(runDir, "logs");

  // Create directories
  await Bun.write(join(runDir, ".keep"), ""); // ensures runDir exists
  await Bun.write(join(logsDir, ".keep"), "");

  // Copy entire scenario folder contents into the run directory
  const scenarioDestDir = join(runDir, "scenario");
  mkdirSync(scenarioDestDir, { recursive: true });
  cpSync(scenarioFolderPath, scenarioDestDir, { recursive: true });

  // Read eval.md content
  const scenarioContent = await Bun.file(evalMdFilePath).text();
  // Also write scenario.md at the run root for backward compatibility
  await Bun.write(join(runDir, "scenario.md"), scenarioContent);

  const dbPath = join(runDir, "brain.db");

  // Determine if there's a graph.json to seed — just check the scenario folder
  let graphJsonPath: string | null = null;
  const graphJsonInFolder = join(scenarioFolderPath, "graph.json");

  if (existsSync(graphJsonInFolder)) {
    graphJsonPath = graphJsonInFolder;
  }

  // If there's graph data, seed it
  let seedResult: { success: boolean; output: string } = { success: true, output: "" };

  if (graphJsonPath) {
    console.error(`[setup] Seeding graph from: ${graphJsonPath}`);
    try {
      const proc = Bun.spawn(
        ["bun", "run", join(ROOT, "src/cli/seed.ts"), "--file", graphJsonPath],
        {
          cwd: ROOT,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, BRAIN_DB_PATH: `file:${dbPath}` },
        }
      );

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const exitCode = await proc.exited;

      seedResult = {
        success: exitCode === 0,
        output: (stdout + "\n" + stderr).trim(),
      };

      if (!seedResult.success) {
        console.error(`[setup] Seed failed (exit ${exitCode}): ${seedResult.output}`);
      } else {
        console.error(`[setup] ${seedResult.output}`);
      }
    } catch (err: any) {
      seedResult = { success: false, output: err.message };
      console.error(`[setup] Seed error: ${err.message}`);
    }
  } else {
    console.error("[setup] No graph.json found — cold start scenario");
  }

  // Handle setup.ts if it exists in the scenario folder
  let setupModule: ScenarioSetupModule | null = null;
  const setupTsPath = join(scenarioFolderPath, "setup.ts");
  if (existsSync(setupTsPath)) {
    console.error(`[setup] Running setup.ts from: ${setupTsPath}`);
    try {
      setupModule = await import(setupTsPath) as ScenarioSetupModule;
      if (setupModule.setup) {
        await setupModule.setup();
        console.error("[setup] setup.ts setup() completed");
      }
    } catch (err: any) {
      console.error(`[setup] Warning: setup.ts failed: ${err.message}`);
    }
  }

  // Clean up .keep files
  try {
    const { unlinkSync } = await import("fs");
    unlinkSync(join(runDir, ".keep"));
    unlinkSync(join(logsDir, ".keep"));
  } catch {
    // ignore — files may already be gone
  }

  return {
    sessionId,
    runDir,
    logsDir,
    dbPath,
    scenarioContent,
    graphJsonPath,
    seedResult,
    setupModule,
  };
}

// ---------------------------------------------------------------------------
// Step 2: Drive
// ---------------------------------------------------------------------------

interface DriveResult {
  response: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

async function drive(opts: {
  prompt: string;
  sessionId: string;
  dbPath: string;
  runDir: string;
  logsDir: string;
}): Promise<DriveResult> {
  const { prompt, sessionId, dbPath, runDir, logsDir } = opts;

  const startTime = Date.now();

  const proc = Bun.spawn(
    [
      "bun",
      "run",
      join(ROOT, "src/cli/run.ts"),
      "--prompt",
      prompt,
      "--session",
      sessionId,
    ],
    {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        BRAIN_DB_PATH: `file:${dbPath}`,
        BRAIN_LOG_DIR: logsDir,
      },
    }
  );

  let timedOut = false;

  // Wall-clock timeout
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill();
    } catch {
      // process may have already exited
    }
  }, timeoutSeconds * 1000);

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  clearTimeout(timer);

  const durationMs = Date.now() - startTime;

  // Write captured output
  await Bun.write(join(runDir, "response.txt"), stdout);
  await Bun.write(join(runDir, "agent_stderr.txt"), stderr);

  return {
    response: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
    durationMs,
    timedOut,
  };
}

// ---------------------------------------------------------------------------
// Step 3: Grade (deterministic checks only)
// ---------------------------------------------------------------------------

interface GradeResult {
  iterations: number | null;
  terminationReason: string | null;
  responseLength: number;
  iterationsInRange: boolean | null;
  hasNonEmptyResponse: boolean;
  estimatedRange: { min: number; max: number } | null;

  // New deterministic checks
  effectorIds: string[];
  thoughtCount: number;
  actionCount: number;
  evalDistribution: { productive: number; neutral: number; counterproductive: number };
  totalLlmDurationMs: number;
  llmTimePercent: number | null; // percentage of total duration
  scratchWriteCount: number;
  graphEntityCoverage: { entities: string[]; found: string[]; missing: string[] } | null;
}

async function grade(opts: {
  runDir: string;
  logsDir: string;
  scenarioContent: string;
  scenarioFolderPath: string;
  response: string;
  durationMs: number;
}): Promise<GradeResult> {
  const { runDir, logsDir, scenarioContent, scenarioFolderPath, response, durationMs } = opts;

  const estimatedRange = extractEstimatedIterations(scenarioContent);

  let iterations: number | null = null;
  let terminationReason: string | null = null;

  // New check accumulators
  const effectorIdSet = new Set<string>();
  let thoughtCount = 0;
  let actionCount = 0;
  const evalDistribution = { productive: 0, neutral: 0, counterproductive: 0 };
  let totalLlmDurationMs = 0;
  let scratchWriteCount = 0;

  // Try to read trajectory.json
  const trajectoryPath = join(logsDir, "trajectory.json");
  let trajectoryIterations: any[] = [];
  try {
    const trajectoryFile = Bun.file(trajectoryPath);
    if (await trajectoryFile.exists()) {
      const trajectory = JSON.parse(await trajectoryFile.text());
      iterations = trajectory.totalIterations ?? trajectory.iterations?.length ?? null;
      terminationReason = trajectory.terminationReason ?? trajectory.termination_reason ?? null;
      trajectoryIterations = trajectory.iterations ?? [];
    }
  } catch (err: any) {
    console.error(`[grade] Could not read trajectory.json: ${err.message}`);
  }

  // Walk trajectory iterations to compute new metrics
  for (const iter of trajectoryIterations) {
    // Effector diversity
    if (iter.effectorId) {
      effectorIdSet.add(iter.effectorId);
    }

    // Thought-to-action ratio
    if (iter.outputKind === "thought") {
      thoughtCount++;
    } else if (iter.outputKind === "action") {
      actionCount++;
    }

    // Evaluation quality distribution
    const quality = (iter.evaluationQuality ?? "").toLowerCase();
    if (quality === "productive") {
      evalDistribution.productive++;
    } else if (quality === "neutral") {
      evalDistribution.neutral++;
    } else if (quality === "counterproductive") {
      evalDistribution.counterproductive++;
    }

    // LLM time
    if (typeof iter.llmDurationMs === "number") {
      totalLlmDurationMs += iter.llmDurationMs;
    }

    // Scratch writes
    if (Array.isArray(iter.scratchWrites)) {
      scratchWriteCount += iter.scratchWrites.length;
    }
  }

  const llmTimePercent = durationMs > 0 ? (totalLlmDurationMs / durationMs) * 100 : null;

  // Graph entity coverage check — look for graph.json in the scenario folder
  let graphEntityCoverage: GradeResult["graphEntityCoverage"] = null;
  try {
    const candidates = [
      join(scenarioFolderPath, "graph.json"),
      join(runDir, "scenario", "graph.json"),
    ];
    for (const gPath of candidates) {
      const gFile = Bun.file(gPath);
      if (await gFile.exists()) {
        const graphData = JSON.parse(await gFile.text());
        const nodes = graphData.nodes ?? [];
        if (nodes.length > 0) {
          const entityNames: string[] = nodes
            .map((n: any) => n.name)
            .filter((n: any) => typeof n === "string" && n.length > 0);
          const responseLower = response.toLowerCase();
          const found: string[] = [];
          const missing: string[] = [];
          for (const name of entityNames) {
            if (responseLower.includes(name.toLowerCase())) {
              found.push(name);
            } else {
              missing.push(name);
            }
          }
          graphEntityCoverage = { entities: entityNames, found, missing };
        }
        break;
      }
    }
  } catch (err: any) {
    console.error(`[grade] Graph entity coverage check failed: ${err.message}`);
  }

  const responseLength = response.length;
  const hasNonEmptyResponse = responseLength > 0;

  let iterationsInRange: boolean | null = null;
  if (iterations !== null && estimatedRange) {
    iterationsInRange = iterations >= estimatedRange.min && iterations <= estimatedRange.max;
  }

  return {
    iterations,
    terminationReason,
    responseLength,
    iterationsInRange,
    hasNonEmptyResponse,
    estimatedRange,
    effectorIds: Array.from(effectorIdSet),
    thoughtCount,
    actionCount,
    evalDistribution,
    totalLlmDurationMs,
    llmTimePercent,
    scratchWriteCount,
    graphEntityCoverage,
  };
}

// ---------------------------------------------------------------------------
// Step 3b: LLM Grading (D1-D8 dimensions)
// ---------------------------------------------------------------------------

interface DimensionScore {
  score: number;
  justification: string;
}

interface LlmGradeResult {
  dimensions: Record<string, DimensionScore>;
  redFlags: string[];
  highlights: string[];
  diagnosis: string;
  recommendations: string[];
}

const DEFAULT_DIMENSION_WEIGHTS: Record<string, { weight: number; label: string }> = {
  D1: { weight: 0.15, label: "Goal Decomposition" },
  D2: { weight: 0.15, label: "Retrieval Quality" },
  D3: { weight: 0.10, label: "Reasoning Efficiency" },
  D4: { weight: 0.15, label: "Prediction Calibration" },
  D5: { weight: 0.10, label: "Reactivation Precision" },
  D6: { weight: 0.15, label: "Self-Correction" },
  D7: { weight: 0.10, label: "Memory Hierarchy Usage" },
  D8: { weight: 0.10, label: "Output Quality" },
};

const GRADING_RUBRIC = `# Grading Rubric

## Scoring Scale
Each dimension is scored 1-5:
| Score | Meaning |
|-------|---------|
| 1 | Failure — the system did not exhibit this capability at all |
| 2 | Poor — attempted but with major deficiencies |
| 3 | Adequate — functional but with clear room for improvement |
| 4 | Good — solid performance with minor issues |
| 5 | Excellent — optimal or near-optimal behavior |

## Grading Dimensions

### D1: Goal Decomposition (weight: 0.15)
Did the system correctly interpret the user's intent and decompose it into an appropriate goal hierarchy?
- 5: Goals are well-structured, appropriately granular, sub-goals logically nest, completion criteria are clear and met
- 3: Goals are reasonable but too coarse or too fine-grained, some unnecessary sub-goals or missing ones
- 1: Goals are wrong, missing, or unrelated to user intent
Measured by: Inspecting the goal stack across the trajectory. Count of push/pop operations, whether leaf goals were completed before being popped, whether the outermost goal was satisfied.

### D2: Retrieval Quality (weight: 0.15)
Did graph activation pull in the right context? Was the activated subgraph relevant and sufficient?
- 5: Seed nodes are directly relevant, spread activation brings in structurally important context, no critical nodes missed, no noise
- 3: Seeds are partially relevant, some important connected nodes missed, some irrelevant nodes included
- 1: Activation is off-target, critical context is missing, mostly noise
Measured by: Comparing activated subgraph contents against the scenario's expected knowledge needs.

### D3: Reasoning Efficiency (weight: 0.10)
How many PFC loop iterations did it take to complete the task? Were iterations productive?
- 5: Minimal iterations, each one advances the goal, no spinning or redundant steps
- 3: Some wasted iterations (redundant thoughts, unnecessary tool calls), but converges
- 1: Excessive iterations, circular reasoning, fails to converge or hits fatigue limit
Measured by: Total iteration count vs scenario baseline.

### D4: Prediction Calibration (weight: 0.15)
Were the PFC's predictions (efference copies) well-calibrated? Did confidence levels match actual deviation?
- 5: High-confidence predictions rarely fail, low-confidence predictions appropriately hedge
- 3: Some miscalibration — overconfident predictions that fail, or underconfident on well-known operations
- 1: Predictions are systematically wrong, confidence bears no relationship to actual outcomes
Measured by: For each action, compare Prediction.confidence against PredictionError.deviation.

### D5: Reactivation Precision (weight: 0.10)
When reactivation fired, was it warranted? When it didn't fire, was that correct?
- 5: Every reactivation brought in context that measurably improved subsequent reasoning. No false negatives.
- 3: Some unnecessary reactivations, or one case where reactivation should have fired but didn't
- 1: Reactivation fires every iteration (no discrimination) or never fires when it should
Measured by: For each reactivation event, check if the next iteration's evaluator signal improved.

### D6: Self-Correction (weight: 0.15)
When the system encountered prediction errors or unexpected results, did it recover effectively?
- 5: High-surprise events trigger appropriate reactivation, goal stack adjusts, the system adapts its approach and succeeds
- 3: Partial recovery — detects the error but doesn't fully adjust, or adjusts but in the wrong direction
- 1: Ignores prediction errors, continues with original approach despite contradictory evidence
Measured by: Identify all high-surprise events in the trajectory.

### D7: Memory Hierarchy Usage (weight: 0.10)
Did the system use the three memory tiers appropriately?
- 5: Working memory stays within budget, compression fires at the right time without losing critical info, scratch space captures evaluator signals and traces
- 3: Memory usage is functional but suboptimal
- 1: Memory tier violations (PFC writing to KG directly), critical information lost during compression, scratch space unused
Measured by: Token budget utilization over time, compression events, scratch space write count.

### D8: Output Quality (weight: 0.10)
Was the final output (response, action, artifact) correct, complete, and appropriate?
- 5: Output directly addresses the user's goal, is factually correct given the available knowledge, and is appropriately scoped
- 3: Output is partially correct or addresses the goal tangentially
- 1: Output is wrong, irrelevant, or missing
Measured by: Comparing final output against scenario's expected outcome criteria.

## Composite Score
composite = sum(dimension_score * dimension_weight) for all dimensions
Range: 1.0 to 5.0

| Composite | Rating |
|-----------|--------|
| 4.5 - 5.0 | Exceptional |
| 3.5 - 4.4 | Strong |
| 2.5 - 3.4 | Developing |
| 1.5 - 2.4 | Weak |
| 1.0 - 1.4 | Failing |`;

/** Extract dimension weight overrides from the scenario markdown (e.g., "D1: 0.20, D3: 0.05"). */
function extractDimensionWeights(md: string): Record<string, number> | null {
  const section = extractSection(md, "Dimension Weights") ?? extractSection(md, "Grading Weights");
  if (!section) return null;

  const overrides: Record<string, number> = {};
  const regex = /D(\d)\s*[:=]\s*([\d.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(section)) !== null) {
    overrides[`D${match[1]}`] = parseFloat(match[2]);
  }
  return Object.keys(overrides).length > 0 ? overrides : null;
}

/** Extract the scenario tier from its path or metadata. */
function extractTier(scenarioFolderPath: string, md: string): string {
  const metaSection = extractSection(md, "Metadata");
  if (metaSection) {
    const tierMatch = metaSection.match(/Tier\s*[:=]\s*(\w+)/i);
    if (tierMatch) return tierMatch[1].toLowerCase();
  }

  const sId = scenarioId(scenarioFolderPath);
  if (sId.startsWith("S")) return "simple";
  if (sId.startsWith("I")) return "intermediate";
  if (sId.startsWith("C")) return "complex";
  if (sId.startsWith("A")) return "adversarial";
  if (sId.startsWith("L")) return "longitudinal";
  return "unknown";
}

function getCompositeRating(score: number): string {
  if (score >= 4.5) return "Exceptional";
  if (score >= 3.5) return "Strong";
  if (score >= 2.5) return "Developing";
  if (score >= 1.5) return "Weak";
  return "Failing";
}

function buildFailedLlmGrade(): LlmGradeResult {
  const dimensions: Record<string, DimensionScore> = {};
  for (const key of Object.keys(DEFAULT_DIMENSION_WEIGHTS)) {
    dimensions[key] = { score: 1, justification: "Grading failed — LLM returned invalid JSON" };
  }
  return {
    dimensions,
    redFlags: ["LLM grading failed"],
    highlights: [],
    diagnosis: "LLM grading could not be completed.",
    recommendations: [],
  };
}

async function llmGrade(opts: {
  scenarioContent: string;
  trajectoryPath: string;
  response: string;
  dimensionWeights: Record<string, number> | null;
}): Promise<LlmGradeResult> {
  const { scenarioContent, trajectoryPath, response, dimensionWeights } = opts;

  let trajectoryJson = "No trajectory data available.";
  try {
    if (existsSync(trajectoryPath)) {
      trajectoryJson = readFileSync(trajectoryPath, "utf-8");
      // Truncate if extremely large (>100k chars) to avoid token limits
      if (trajectoryJson.length > 100_000) {
        trajectoryJson = trajectoryJson.slice(0, 100_000) + "\n... (truncated)";
      }
    }
  } catch {
    // leave as default
  }

  const weightsText = dimensionWeights
    ? `\nDimension weight overrides for this scenario:\n${Object.entries(dimensionWeights).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`
    : "\nUse default dimension weights from the rubric.";

  const systemPrompt = `You are an expert evaluator for a brain agent system. Your job is to grade a single eval scenario run across 8 dimensions (D1-D8) on a 1-5 scale.

${GRADING_RUBRIC}
${weightsText}

IMPORTANT:
- Score each dimension independently based on the evidence in the trajectory and response.
- If a capability is not yet implemented (e.g., predictions, reactivation), score that dimension based on what you observe — if the feature is absent, that typically means a score of 1-2 for that dimension unless the scenario doesn't require it.
- Be specific in justifications — reference iteration numbers and concrete events.
- Identify red flags: behaviors that are fundamentally wrong (not just suboptimal).
- Highlight notable trajectory moments (positive or negative).

Return your evaluation as a JSON object with this exact structure (no markdown fences, just raw JSON):
{
  "dimensions": {
    "D1": { "score": <1-5>, "justification": "..." },
    "D2": { "score": <1-5>, "justification": "..." },
    "D3": { "score": <1-5>, "justification": "..." },
    "D4": { "score": <1-5>, "justification": "..." },
    "D5": { "score": <1-5>, "justification": "..." },
    "D6": { "score": <1-5>, "justification": "..." },
    "D7": { "score": <1-5>, "justification": "..." },
    "D8": { "score": <1-5>, "justification": "..." }
  },
  "redFlags": ["any red flags triggered"],
  "highlights": ["notable trajectory moments"],
  "diagnosis": "what went well and what didn't",
  "recommendations": ["concrete improvements"]
}`;

  const userPrompt = `## Scenario
${scenarioContent}

## Trajectory (iteration data)
${trajectoryJson}

## Agent Response
${response || "(empty response)"}

Grade this run. Return only the JSON object.`;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  // Attempt grading with one retry on invalid JSON
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callLLM(messages, {
        model: CONFIG.evaluatorModel,
        temperature: 0.2,
      });

      const jsonStr = extractJson(raw);
      const parsed = JSON.parse(jsonStr);

      // Validate structure
      if (!parsed.dimensions || typeof parsed.dimensions !== "object") {
        throw new Error("Missing 'dimensions' in LLM response");
      }

      for (const key of ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"]) {
        if (!parsed.dimensions[key] || typeof parsed.dimensions[key].score !== "number") {
          throw new Error(`Missing or invalid dimension ${key}`);
        }
        // Clamp scores to 1-5
        parsed.dimensions[key].score = Math.max(1, Math.min(5, Math.round(parsed.dimensions[key].score)));
      }

      return {
        dimensions: parsed.dimensions,
        redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        diagnosis: typeof parsed.diagnosis === "string" ? parsed.diagnosis : "",
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      };
    } catch (err: any) {
      console.error(`[llm-grade] Attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt === 0) {
        console.error("[llm-grade] Retrying...");
      }
    }
  }

  // Fall back to all-1s
  console.error("[llm-grade] Both attempts failed, falling back to all-1s");
  return buildFailedLlmGrade();
}

function computeCompositeScore(
  dimensions: Record<string, DimensionScore>,
  weightOverrides: Record<string, number> | null
): number {
  let composite = 0;
  for (const [key, meta] of Object.entries(DEFAULT_DIMENSION_WEIGHTS)) {
    const weight = weightOverrides?.[key] ?? meta.weight;
    const score = dimensions[key]?.score ?? 1;
    composite += score * weight;
  }
  return Math.round(composite * 100) / 100;
}

function generateReport(opts: {
  scenarioFolderPath: string;
  sessionId: string;
  driveResult: DriveResult;
  gradeResult: GradeResult;
  llmGradeResult: LlmGradeResult | null;
  dimensionWeights: Record<string, number> | null;
  tier: string;
}): string {
  const { scenarioFolderPath, sessionId, driveResult, gradeResult, llmGradeResult, dimensionWeights, tier } = opts;
  const sId = scenarioId(scenarioFolderPath);

  const durationSec = (driveResult.durationMs / 1000).toFixed(1);

  // Compute composite score if LLM grading was performed
  const compositeScore = llmGradeResult
    ? computeCompositeScore(llmGradeResult.dimensions, dimensionWeights)
    : null;
  const compositeRating = compositeScore !== null ? getCompositeRating(compositeScore) : null;

  const checks: Array<{ name: string; status: string; detail: string }> = [];

  // Check: non-empty response
  checks.push({
    name: "Non-empty response",
    status: gradeResult.hasNonEmptyResponse ? "PASS" : "FAIL",
    detail: `Response length: ${gradeResult.responseLength} chars`,
  });

  // Check: iterations in estimated range
  if (gradeResult.iterationsInRange !== null && gradeResult.estimatedRange) {
    checks.push({
      name: "Iterations in estimated range",
      status: gradeResult.iterationsInRange ? "PASS" : "WARN",
      detail: `${gradeResult.iterations} iterations (expected ${gradeResult.estimatedRange.min}-${gradeResult.estimatedRange.max})`,
    });
  } else if (gradeResult.iterations !== null) {
    checks.push({
      name: "Iterations in estimated range",
      status: "SKIP",
      detail: `${gradeResult.iterations} iterations (no estimate in scenario)`,
    });
  } else {
    checks.push({
      name: "Iterations in estimated range",
      status: "SKIP",
      detail: "No trajectory.json found",
    });
  }

  // Check: termination reason
  if (gradeResult.terminationReason) {
    const isDone = gradeResult.terminationReason === "done" || gradeResult.terminationReason === "completed";
    checks.push({
      name: "Termination reason",
      status: isDone ? "PASS" : "WARN",
      detail: gradeResult.terminationReason,
    });
  } else {
    checks.push({
      name: "Termination reason",
      status: "SKIP",
      detail: "Not available (no trajectory.json or field missing)",
    });
  }

  // Check: timed out
  checks.push({
    name: "Completed within timeout",
    status: driveResult.timedOut ? "FAIL" : "PASS",
    detail: driveResult.timedOut ? `Killed after ${timeoutSeconds}s` : `Completed in ${durationSec}s`,
  });

  // Check: process exit code
  checks.push({
    name: "Agent exited cleanly",
    status: driveResult.exitCode === 0 ? "PASS" : "WARN",
    detail: `Exit code: ${driveResult.exitCode}`,
  });

  // Check: effector diversity
  if (gradeResult.effectorIds.length > 0) {
    checks.push({
      name: "Effector diversity",
      status: "INFO",
      detail: `Used: ${gradeResult.effectorIds.join(", ")}`,
    });
  } else if (gradeResult.iterations !== null && gradeResult.iterations > 0) {
    checks.push({
      name: "Effector diversity",
      status: "WARN",
      detail: "No effectors used across all iterations",
    });
  } else {
    checks.push({
      name: "Effector diversity",
      status: "SKIP",
      detail: "No trajectory data",
    });
  }

  // Check: thought-to-action ratio
  {
    const total = gradeResult.thoughtCount + gradeResult.actionCount;
    if (total > 0) {
      const ratio = gradeResult.actionCount > 0
        ? (gradeResult.thoughtCount / gradeResult.actionCount).toFixed(2)
        : "inf";
      let status = "INFO";
      let detail = `${gradeResult.thoughtCount} thoughts, ${gradeResult.actionCount} actions (ratio: ${ratio})`;
      if (gradeResult.actionCount === 0) {
        status = "WARN";
        detail = `${gradeResult.thoughtCount} thoughts, 0 actions — agent never acted`;
      } else if (gradeResult.thoughtCount === 0) {
        status = "WARN";
        detail = `0 thoughts, ${gradeResult.actionCount} actions — agent never reasoned`;
      }
      checks.push({ name: "Thought-to-action ratio", status, detail });
    } else {
      checks.push({
        name: "Thought-to-action ratio",
        status: "SKIP",
        detail: "No iterations in trajectory",
      });
    }
  }

  // Check: evaluation quality distribution
  {
    const { productive, neutral, counterproductive } = gradeResult.evalDistribution;
    const total = productive + neutral + counterproductive;
    if (total > 0) {
      const status = counterproductive > productive ? "WARN" : "INFO";
      checks.push({
        name: "Evaluation quality distribution",
        status,
        detail: `productive: ${productive}, neutral: ${neutral}, counterproductive: ${counterproductive}`,
      });
    } else {
      checks.push({
        name: "Evaluation quality distribution",
        status: "SKIP",
        detail: "No evaluation data in trajectory",
      });
    }
  }

  // Check: total LLM time
  if (gradeResult.llmTimePercent !== null) {
    checks.push({
      name: "Total LLM time",
      status: "INFO",
      detail: `${(gradeResult.totalLlmDurationMs / 1000).toFixed(1)}s (${gradeResult.llmTimePercent.toFixed(1)}% of wall-clock)`,
    });
  } else {
    checks.push({
      name: "Total LLM time",
      status: "SKIP",
      detail: "No timing data",
    });
  }

  // Check: scratch write count
  checks.push({
    name: "Scratch write count",
    status: "INFO",
    detail: `${gradeResult.scratchWriteCount} writes`,
  });

  // Check: response references graph context
  if (gradeResult.graphEntityCoverage) {
    const { entities, found, missing } = gradeResult.graphEntityCoverage;
    const coverage = entities.length > 0
      ? ((found.length / entities.length) * 100).toFixed(0)
      : "0";
    let status = "INFO";
    if (missing.length > 0 && found.length === 0) {
      status = "WARN";
    } else if (missing.length > 0) {
      status = "WARN";
    }
    checks.push({
      name: "Response references graph context",
      status,
      detail: `${found.length}/${entities.length} entities (${coverage}%)${missing.length > 0 ? ` — missing: ${missing.join(", ")}` : ""}`,
    });
  }

  const checksTable = checks
    .map((c) => `| ${c.name} | ${c.status} | ${c.detail} |`)
    .join("\n");

  // Build dimension scores table
  let dimensionScoresSection = "";
  if (llmGradeResult) {
    const dimRows = Object.entries(DEFAULT_DIMENSION_WEIGHTS)
      .map(([key, meta]) => {
        const dim = llmGradeResult.dimensions[key];
        const weight = dimensionWeights?.[key] ?? meta.weight;
        const weighted = dim ? (dim.score * weight).toFixed(2) : "N/A";
        return `| ${key}: ${meta.label} | ${dim?.score ?? "N/A"} | ${weight} | ${weighted} | ${dim?.justification ?? "N/A"} |`;
      })
      .join("\n");

    dimensionScoresSection = `### Dimension Scores
| Dimension | Score | Weight | Weighted | Justification |
|-----------|-------|--------|----------|---------------|
${dimRows}
`;
  }

  // Build trajectory highlights
  let highlightsSection = "";
  if (llmGradeResult && llmGradeResult.highlights.length > 0) {
    highlightsSection = `### Trajectory Highlights
${llmGradeResult.highlights.map((h) => `- ${h}`).join("\n")}
`;
  }

  // Build diagnosis
  let diagnosisSection = "";
  if (llmGradeResult && llmGradeResult.diagnosis) {
    diagnosisSection = `### Diagnosis
${llmGradeResult.diagnosis}
`;
  }

  // Build recommendations
  let recommendationsSection = "";
  if (llmGradeResult && llmGradeResult.recommendations.length > 0) {
    recommendationsSection = `### Recommendations
${llmGradeResult.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}
`;
  }

  // Build red flags
  let redFlagsSection = "";
  if (llmGradeResult && llmGradeResult.redFlags.length > 0) {
    redFlagsSection = `### Red Flags
${llmGradeResult.redFlags.map((f) => `- ${f}`).join("\n")}
`;
  }

  const compositeHeader = compositeScore !== null
    ? `## Composite Score: ${compositeScore.toFixed(1)}/5.0 (${compositeRating})\n`
    : "";

  return `## Scenario: ${sId}
## Tier: ${tier}
${compositeHeader}
### Summary
- **Session**: ${sessionId}
- **Total iterations**: ${gradeResult.iterations ?? "N/A"}
- **Termination reason**: ${gradeResult.terminationReason ?? "N/A"}
- **Response length**: ${gradeResult.responseLength} chars
- **Duration**: ${durationSec}s
- **Timed out**: ${driveResult.timedOut ? "Yes" : "No"}
- **Effectors used**: ${gradeResult.effectorIds.length > 0 ? gradeResult.effectorIds.join(", ") : "none"}
- **Thoughts / Actions**: ${gradeResult.thoughtCount} / ${gradeResult.actionCount}
- **LLM time**: ${(gradeResult.totalLlmDurationMs / 1000).toFixed(1)}s${gradeResult.llmTimePercent !== null ? ` (${gradeResult.llmTimePercent.toFixed(1)}%)` : ""}
- **Scratch writes**: ${gradeResult.scratchWriteCount}

${dimensionScoresSection}
### Deterministic Checks
| Check | Status | Detail |
|-------|--------|--------|
${checksTable}

${highlightsSection}
${diagnosisSection}
${recommendationsSection}
${redFlagsSection}
### Response Preview
\`\`\`
${gradeResult.hasNonEmptyResponse ? driveResult.response.slice(0, 500) : "(empty)"}${driveResult.response.length > 500 ? "\n... (truncated)" : ""}
\`\`\`
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const resolvedFolder = resolve(scenarioFolder);
  const resolvedEvalMd = resolve(evalMdPath);

  // Verify scenario folder and eval.md exist
  if (!existsSync(resolvedFolder)) {
    console.error(`Scenario folder not found: ${resolvedFolder}`);
    process.exit(1);
  }
  if (!existsSync(resolvedEvalMd)) {
    console.error(`eval.md not found: ${resolvedEvalMd}`);
    process.exit(1);
  }

  // Step 1: Setup
  console.error("[eval] Step 1: Setup");
  const {
    sessionId,
    runDir,
    logsDir,
    dbPath,
    scenarioContent,
    seedResult,
    graphJsonPath,
    setupModule,
  } = await setup(resolvedFolder, resolvedEvalMd);
  console.error(`[eval] Session: ${sessionId}`);
  console.error(`[eval] Run dir: ${runDir}`);

  // Abort if seed was expected but failed
  if (graphJsonPath && !seedResult.success) {
    console.error(`[eval] ABORT: Seed failed for scenario that requires graph data`);
    console.error(`[eval] Seed output: ${seedResult.output}`);
    process.exit(1);
  }

  // Extract initial prompt
  const prompt = extractInitialPrompt(scenarioContent);
  if (!prompt) {
    console.error("[eval] ERROR: Could not extract Initial Prompt from scenario");
    process.exit(1);
  }
  console.error(`[eval] Prompt: "${prompt}"`);

  // Step 2: Drive
  console.error(`[eval] Step 2: Drive (timeout ${timeoutSeconds}s)`);
  const driveResult = await drive({
    prompt,
    sessionId,
    dbPath,
    runDir,
    logsDir,
  });

  if (driveResult.timedOut) {
    console.error("[eval] WARNING: Agent timed out and was killed");
  } else {
    console.error(
      `[eval] Agent finished in ${(driveResult.durationMs / 1000).toFixed(1)}s (exit ${driveResult.exitCode})`
    );
  }

  // Step 3: Grade (deterministic)
  console.error("[eval] Step 3: Grade (deterministic)");
  const gradeResult = await grade({
    runDir,
    logsDir,
    scenarioContent,
    scenarioFolderPath: resolvedFolder,
    response: driveResult.response,
    durationMs: driveResult.durationMs,
  });

  // Step 3b: LLM grading
  const tier = extractTier(resolvedFolder, scenarioContent);
  const dimensionWeights = extractDimensionWeights(scenarioContent);
  let llmGradeResult: LlmGradeResult | null = null;

  if (!skipLlmGrade) {
    console.error("[eval] Step 3b: LLM grading (D1-D8)");
    const trajectoryPath = join(logsDir, "trajectory.json");
    try {
      llmGradeResult = await llmGrade({
        scenarioContent,
        trajectoryPath,
        response: driveResult.response,
        dimensionWeights,
      });
      const composite = computeCompositeScore(llmGradeResult.dimensions, dimensionWeights);
      console.error(`[eval] Composite score: ${composite.toFixed(1)}/5.0 (${getCompositeRating(composite)})`);
    } catch (err: any) {
      console.error(`[eval] LLM grading failed: ${err.message}`);
      llmGradeResult = buildFailedLlmGrade();
    }
  } else {
    console.error("[eval] Step 3b: LLM grading skipped (--skip-llm-grade)");
  }

  // Write report
  const report = generateReport({
    scenarioFolderPath: resolvedFolder,
    sessionId,
    driveResult,
    gradeResult,
    llmGradeResult,
    dimensionWeights,
    tier,
  });
  await Bun.write(join(runDir, "report.md"), report);
  console.error(`[eval] Report written to ${join(runDir, "report.md")}`);

  // Step 4: Teardown (call setup.ts teardown if it exists)
  if (setupModule?.teardown) {
    console.error("[eval] Step 4: Running setup.ts teardown()");
    try {
      await setupModule.teardown();
      console.error("[eval] teardown() completed");
    } catch (err: any) {
      console.error(`[eval] Warning: teardown() failed: ${err.message}`);
    }
  }

  // Step 5: Summary (to stdout)
  // Format: scenario_id | session_id | iterations | termination | duration | composite | rating
  const sId = scenarioId(resolvedFolder);
  const durationSec = (driveResult.durationMs / 1000).toFixed(1);
  const iterStr = gradeResult.iterations !== null ? String(gradeResult.iterations) : "?";
  const termStr = gradeResult.terminationReason ?? (driveResult.timedOut ? "timeout" : `exit:${driveResult.exitCode}`);
  const compositeStr = llmGradeResult
    ? computeCompositeScore(llmGradeResult.dimensions, dimensionWeights).toFixed(1)
    : "-";
  const ratingStr = llmGradeResult
    ? getCompositeRating(computeCompositeScore(llmGradeResult.dimensions, dimensionWeights))
    : "-";

  console.log(`${sId} | ${tier} | ${iterStr} | ${termStr} | ${durationSec}s | ${compositeStr} | ${ratingStr}`);
}

main().catch((err) => {
  console.error(`[eval] Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
