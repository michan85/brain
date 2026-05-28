/**
 * CLI entry point: run a single turn of the brain agent.
 *
 * Usage: bun run src/cli/run.ts --prompt "user message" [--session session-id] [--db path/to/brain.db]
 */

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const prompt = getArg("prompt");
if (!prompt) {
  console.error("Usage: bun run src/cli/run.ts --prompt \"user message\" [--session session-id] [--db path/to/brain.db] [--cwd path]");
  process.exit(1);
}

const dbPath = getArg("db");
if (dbPath) {
  process.env.BRAIN_DB_PATH = `file:${dbPath}`;
}

const cwdOverride = getArg("cwd");

// Redirect console.log to stderr so only the final response goes to stdout
const originalLog = console.log;
console.log = (...args: unknown[]) => {
  console.error(...args);
};

async function main() {
  // Dynamic imports so BRAIN_DB_PATH is set before config.ts evaluates
  const { initDb } = await import("../db");
  const { processTextInput } = await import("../sensor");
  const { activate } = await import("../graph");
  const { runPFCLoop } = await import("../pfc");
  const { generateId } = await import("../utils");

  const sessionId = getArg("session") ?? generateId();

  await initDb();

  const sensorOutput = await processTextInput(prompt!);
  const activated = await activate(sensorOutput, sessionId);
  const logDir = process.env.BRAIN_LOG_DIR;
  const response = await runPFCLoop(sensorOutput, activated, sessionId, { logDir, cwd: cwdOverride });

  originalLog(response);
  process.exit(0);
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
