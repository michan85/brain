/**
 * Eval run orchestrator: sets up, drives, and grades a single brain agent evaluation scenario.
 *
 * Usage: bun run evals/run-eval.ts --scenario evals/scenarios/S01_cold_start_direct_answer.md [--timeout 300]
 */

import { join, basename, dirname, resolve } from "path";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= argv.length) return undefined;
  return argv[idx + 1];
}

const scenarioPath = getArg("scenario");
if (!scenarioPath) {
  console.error(
    "Usage: bun run evals/run-eval.ts --scenario <path-to-scenario.md> [--timeout 300]"
  );
  process.exit(1);
}

const timeoutSeconds = parseInt(getArg("timeout") ?? "300", 10);
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

/** Extract scenario ID from filename, e.g., "S01_cold_start_direct_answer" */
function scenarioId(path: string): string {
  return basename(path, ".md");
}

/**
 * Look for a ```graph.json fenced code block in the scenario markdown.
 * Returns the parsed JSON string if found.
 */
function extractEmbeddedGraphJson(md: string): string | null {
  // Match ```json or ``` labeled graph.json
  // Pattern: a line containing graph.json (as label or comment), then a JSON code block
  // or a fenced block with ```graph.json or ```json ... that contains "nodes"
  const patterns = [
    /```(?:json\s+)?graph\.json\s*\n([\s\S]*?)```/i,
    /```json\s*\n([\s\S]*?)```/g,
  ];

  // Try the explicit graph.json label first (matches ```graph.json or ```json graph.json)
  const explicit = patterns[0].exec(md);
  if (explicit) return explicit[1].trim();

  // Try generic json blocks that look like graph data (contain "nodes")
  let match: RegExpExecArray | null;
  while ((match = patterns[1].exec(md)) !== null) {
    const content = match[1].trim();
    if (content.includes('"nodes"')) return content;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Step 1: Setup
// ---------------------------------------------------------------------------

async function setup(scenarioFile: string) {
  const sessionId = generateSessionId();
  const runDir = join(ROOT, "evals", "runs", sessionId);
  const logsDir = join(runDir, "logs");

  // Create directories
  await Bun.write(join(runDir, ".keep"), ""); // ensures runDir exists
  await Bun.write(join(logsDir, ".keep"), "");

  // Copy scenario file
  const scenarioContent = await Bun.file(resolve(scenarioFile)).text();
  await Bun.write(join(runDir, "scenario.md"), scenarioContent);

  const dbPath = join(runDir, "brain.db");

  // Determine if there's a graph.json to seed
  let graphJsonPath: string | null = null;

  // Check for graph.json in the scenario's directory
  const scenarioDir = dirname(resolve(scenarioFile));
  const sId = scenarioId(scenarioFile);
  const adjacentGraphJson = join(scenarioDir, `${sId}.graph.json`);
  const genericGraphJson = join(scenarioDir, "graph.json");

  if (await Bun.file(adjacentGraphJson).exists()) {
    graphJsonPath = adjacentGraphJson;
  } else if (await Bun.file(genericGraphJson).exists()) {
    graphJsonPath = genericGraphJson;
  } else {
    // Check for embedded graph.json in the scenario markdown
    const embedded = extractEmbeddedGraphJson(scenarioContent);
    if (embedded) {
      const extractedPath = join(runDir, "graph.json");
      await Bun.write(extractedPath, embedded);
      graphJsonPath = extractedPath;
    }
  }

  // Create a fresh empty database (just copy nothing — seed.ts + initDb will create it)
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
}

async function grade(opts: {
  runDir: string;
  logsDir: string;
  scenarioContent: string;
  response: string;
}): Promise<GradeResult> {
  const { runDir, logsDir, scenarioContent, response } = opts;

  const estimatedRange = extractEstimatedIterations(scenarioContent);

  let iterations: number | null = null;
  let terminationReason: string | null = null;

  // Try to read trajectory.json
  const trajectoryPath = join(logsDir, "trajectory.json");
  try {
    const trajectoryFile = Bun.file(trajectoryPath);
    if (await trajectoryFile.exists()) {
      const trajectory = JSON.parse(await trajectoryFile.text());
      iterations = trajectory.totalIterations ?? trajectory.iterations?.length ?? null;
      terminationReason = trajectory.terminationReason ?? trajectory.termination_reason ?? null;
    }
  } catch (err: any) {
    console.error(`[grade] Could not read trajectory.json: ${err.message}`);
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
  };
}

function generateReport(opts: {
  scenarioFile: string;
  sessionId: string;
  driveResult: DriveResult;
  gradeResult: GradeResult;
}): string {
  const { scenarioFile, sessionId, driveResult, gradeResult } = opts;
  const sId = scenarioId(scenarioFile);

  const durationSec = (driveResult.durationMs / 1000).toFixed(1);

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

  const checksTable = checks
    .map((c) => `| ${c.name} | ${c.status} | ${c.detail} |`)
    .join("\n");

  return `## Eval Report

### Scenario
- **ID**: ${sId}
- **Session**: ${sessionId}

### Summary
- **Total iterations**: ${gradeResult.iterations ?? "N/A"}
- **Termination reason**: ${gradeResult.terminationReason ?? "N/A"}
- **Response length**: ${gradeResult.responseLength} chars
- **Duration**: ${durationSec}s
- **Timed out**: ${driveResult.timedOut ? "Yes" : "No"}

### Deterministic Checks
| Check | Status | Detail |
|-------|--------|--------|
${checksTable}

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
  const resolvedScenario = resolve(scenarioPath!);

  // Verify scenario exists
  if (!(await Bun.file(resolvedScenario).exists())) {
    console.error(`Scenario file not found: ${resolvedScenario}`);
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
  } = await setup(resolvedScenario);
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

  // Step 3: Grade
  console.error("[eval] Step 3: Grade");
  const gradeResult = await grade({
    runDir,
    logsDir,
    scenarioContent,
    response: driveResult.response,
  });

  // Write report
  const report = generateReport({
    scenarioFile: scenarioPath!,
    sessionId,
    driveResult,
    gradeResult,
  });
  await Bun.write(join(runDir, "report.md"), report);
  console.error(`[eval] Report written to ${join(runDir, "report.md")}`);

  // Step 4: Summary (to stdout)
  const sId = scenarioId(scenarioPath!);
  const durationSec = (driveResult.durationMs / 1000).toFixed(1);
  const iterStr = gradeResult.iterations !== null ? `${gradeResult.iterations} iterations` : "? iterations";
  const termStr = gradeResult.terminationReason ?? (driveResult.timedOut ? "timeout" : `exit:${driveResult.exitCode}`);

  console.log(`${sId} | ${sessionId} | ${iterStr} | ${termStr} | ${durationSec}s`);
}

main().catch((err) => {
  console.error(`[eval] Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
