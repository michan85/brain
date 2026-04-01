/**
 * Batch eval runner: runs every scenario (or a filtered subset) and produces a summary.
 *
 * Usage: bun run evals/run-all.ts [--tier simple] [--timeout 120] [--skip-llm-grade]
 */

import { resolve, join } from "path";
import { readFileSync, mkdirSync, existsSync } from "fs";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= argv.length) return undefined;
  return argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return argv.includes(`--${name}`);
}

const tierFilter = getArg("tier")?.toLowerCase() ?? null;
const timeoutSeconds = getArg("timeout") ?? "300";
const skipLlmGrade = hasFlag("skip-llm-grade");

const ROOT = resolve(import.meta.dir, "..");
const EVALS_DIR = join(ROOT, "evals");
const SCENARIOS_DIR = join(EVALS_DIR, "scenarios");
const INDEX_PATH = join(SCENARIOS_DIR, "index.md");

// ---------------------------------------------------------------------------
// Parse scenario index
// ---------------------------------------------------------------------------

interface ScenarioEntry {
  id: string;
  filename: string;
  tier: string;
  path: string;
}

function parseScenarioIndex(indexPath: string): ScenarioEntry[] {
  const content = readFileSync(indexPath, "utf-8");
  const entries: ScenarioEntry[] = [];

  let currentTier = "unknown";
  const tierMap: Record<string, string> = {
    "simple": "simple",
    "intermediate": "intermediate",
    "complex": "complex",
    "adversarial": "adversarial",
    "longitudinal": "longitudinal",
  };

  for (const line of content.split("\n")) {
    // Detect tier headings like "## Simple (baseline functionality)"
    const tierMatch = line.match(/^##\s+(\w+)\s/);
    if (tierMatch) {
      const tierWord = tierMatch[1].toLowerCase();
      if (tierMap[tierWord]) {
        currentTier = tierMap[tierWord];
      }
      continue;
    }

    // Parse table rows: | S01 | [Cold Start...](S01_cold_start_direct_answer.md) | ... |
    const rowMatch = line.match(/^\|\s*([A-Z]\d{2})\s*\|\s*\[.*?\]\(([^)]+)\)\s*\|/);
    if (rowMatch) {
      const id = rowMatch[1];
      const filename = rowMatch[2];
      entries.push({
        id,
        filename,
        tier: currentTier,
        path: join(SCENARIOS_DIR, filename),
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Run a single scenario
// ---------------------------------------------------------------------------

interface ScenarioResult {
  id: string;
  tier: string;
  iterations: string;
  termination: string;
  duration: string;
  composite: string;
  rating: string;
  runDir: string;
  description: string;
  success: boolean;
  error?: string;
}

async function runScenario(entry: ScenarioEntry): Promise<ScenarioResult> {
  const args = [
    "run",
    join(EVALS_DIR, "run-eval.ts"),
    "--scenario",
    entry.path,
    "--timeout",
    timeoutSeconds,
  ];
  if (skipLlmGrade) {
    args.push("--skip-llm-grade");
  }

  console.error(`\n${"=".repeat(70)}`);
  console.error(`[run-all] Running: ${entry.id} (${entry.tier}) — ${entry.filename}`);
  console.error(`${"=".repeat(70)}`);

  try {
    const proc = Bun.spawn(["bun", ...args], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;

    // Print stderr for visibility
    if (stderr.trim()) {
      for (const line of stderr.trim().split("\n")) {
        console.error(`  ${line}`);
      }
    }

    if (exitCode !== 0) {
      console.error(`[run-all] ${entry.id} exited with code ${exitCode}`);
      const runDirMatch = stderr.match(/\[eval\] Run dir:\s*(.+)/);
      return {
        id: entry.id,
        tier: entry.tier,
        iterations: "?",
        termination: "error",
        duration: "-",
        composite: "-",
        rating: "-",
        runDir: runDirMatch ? runDirMatch[1].trim() : "",
        description: "",
        success: false,
        error: `Exit code ${exitCode}`,
      };
    }

    // Extract run directory from stderr (run-eval prints "[eval] Run dir: ...")
    const runDirMatch = stderr.match(/\[eval\] Run dir:\s*(.+)/);
    const runDir = runDirMatch ? runDirMatch[1].trim() : "";

    // Extract one-line description from scenario eval.md (first sentence of User Goal section)
    let description = "";
    try {
      const evalContent = readFileSync(entry.path, "utf-8");
      const goalMatch = evalContent.match(/##\s+User Goal\s*\n+(.+)/);
      if (goalMatch) {
        description = goalMatch[1].trim().replace(/\..*/, "").slice(0, 80);
      }
    } catch {}

    // Parse the summary line from stdout
    // Format: scenario_id | tier | iterations | termination | duration | composite | rating
    const summaryLine = stdout.trim().split("\n").pop()?.trim() ?? "";
    const parts = summaryLine.split("|").map((s) => s.trim());

    if (parts.length >= 7) {
      return {
        id: parts[0],
        tier: parts[1],
        iterations: parts[2],
        termination: parts[3],
        duration: parts[4],
        composite: parts[5],
        rating: parts[6],
        runDir,
        description,
        success: true,
      };
    } else if (parts.length >= 5) {
      return {
        id: parts[0],
        tier: entry.tier,
        iterations: parts[2] ?? "?",
        termination: parts[3] ?? "?",
        duration: parts[4] ?? "-",
        composite: parts[5] ?? "-",
        rating: parts[6] ?? "-",
        runDir,
        description,
        success: true,
      };
    } else {
      return {
        id: entry.id,
        tier: entry.tier,
        iterations: "?",
        termination: "?",
        duration: "-",
        composite: "-",
        rating: "-",
        runDir,
        description,
        success: false,
        error: `Could not parse summary: ${summaryLine}`,
      };
    }
  } catch (err: any) {
    console.error(`[run-all] ${entry.id} threw: ${err.message}`);
    return {
      id: entry.id,
      tier: entry.tier,
      iterations: "?",
      termination: "error",
      duration: "-",
      composite: "-",
      rating: "-",
      runDir: "",
      description: "",
      success: false,
      error: err.message,
    };
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function generateSummary(results: ScenarioResult[], tierFilter: string | null): string {
  const timestamp = new Date().toISOString();
  const filterNote = tierFilter ? ` (filtered: ${tierFilter})` : "";

  const tableRows = results.map((r) => {
    const compositeDisplay = r.composite !== "-" ? `${r.composite}/5.0` : "-";
    return `| ${r.id} | ${r.tier} | ${r.iterations} | ${r.termination} | ${r.duration} | ${compositeDisplay} | ${r.rating} |`;
  });

  // Detailed results with run paths and descriptions
  const detailRows = results.map((r) => {
    const status = r.success ? (parseFloat(r.composite) >= 3.0 ? "PASS" : "WEAK") : "FAIL";
    const desc = r.description || r.error || "-";
    const path = r.runDir || "-";
    return `- **${r.id}** [${status}] ${r.composite}/5.0 — ${desc}\n  Run: \`${path}\``;
  });

  const passed = results.filter((r) => r.success).length;
  const total = results.length;
  const pct = total > 0 ? ((passed / total) * 100).toFixed(0) : "0";

  // Compute average composite for runs that have one
  const compositeValues = results
    .map((r) => parseFloat(r.composite))
    .filter((v) => !isNaN(v));
  const avgComposite = compositeValues.length > 0
    ? (compositeValues.reduce((a, b) => a + b, 0) / compositeValues.length).toFixed(1)
    : "-";

  return `# Eval Results${filterNote}

Generated: ${timestamp}

## Summary

- **Scenarios run**: ${total}
- **Completed**: ${passed}/${total} (${pct}%)
- **Average composite**: ${avgComposite}/5.0

## Results

| Scenario | Tier | Iterations | Termination | Duration | Composite | Rating |
|----------|------|------------|-------------|----------|-----------|--------|
${tableRows.join("\n")}

## Detail

${detailRows.join("\n\n")}
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Verify index exists
  if (!existsSync(INDEX_PATH)) {
    console.error(`Scenario index not found: ${INDEX_PATH}`);
    process.exit(1);
  }

  // Parse scenarios
  let scenarios = parseScenarioIndex(INDEX_PATH);
  console.error(`[run-all] Found ${scenarios.length} scenarios in index`);

  // Filter by tier if specified
  if (tierFilter) {
    scenarios = scenarios.filter((s) => s.tier === tierFilter);
    console.error(`[run-all] Filtered to ${scenarios.length} scenarios (tier: ${tierFilter})`);
  }

  if (scenarios.length === 0) {
    console.error("[run-all] No scenarios to run");
    process.exit(0);
  }

  // Verify scenario files exist
  const missing = scenarios.filter((s) => !existsSync(s.path));
  if (missing.length > 0) {
    console.error(`[run-all] Warning: ${missing.length} scenario file(s) not found:`);
    for (const m of missing) {
      console.error(`  - ${m.path}`);
    }
    scenarios = scenarios.filter((s) => existsSync(s.path));
  }

  // Run each scenario sequentially
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    const result = await runScenario(scenario);
    results.push(result);

    // Print inline progress
    const compositeDisplay = result.composite !== "-" ? `${result.composite}/5.0` : "-";
    console.error(`[run-all] ${result.id}: ${result.rating} (${compositeDisplay}) — ${result.success ? "OK" : "FAILED"}`);
  }

  // Generate summary
  const summary = generateSummary(results, tierFilter);

  // Print to stdout
  console.log(summary);

  // Write to file
  const runsDir = join(EVALS_DIR, "runs");
  if (!existsSync(runsDir)) {
    mkdirSync(runsDir, { recursive: true });
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const summaryPath = join(runsDir, `summary_${ts}.md`);
  await Bun.write(summaryPath, summary);
  console.error(`\n[run-all] Summary written to ${summaryPath}`);
}

main().catch((err) => {
  console.error(`[run-all] Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
