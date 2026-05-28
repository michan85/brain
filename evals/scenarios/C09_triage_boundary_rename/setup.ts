import { mkdirSync, copyFileSync, rmSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";

const CONTEXT_DIR = join(import.meta.dir, "context");
const BASE = "/tmp/brain-eval-c09/mock-rename";

/** Recursively collect all files from a directory, returning relative paths. */
function collectFiles(dir: string, base: string = dir): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full, base));
    } else {
      files.push(full.slice(base.length + 1));
    }
  }
  return files;
}

export function setup() {
  const mockDir = join(CONTEXT_DIR, "mock-rename");
  const relativePaths = collectFiles(mockDir);

  for (const rel of relativePaths) {
    const src = join(mockDir, rel);
    const dest = join(BASE, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

export function teardown() {
  try {
    rmSync("/tmp/brain-eval-c09", { recursive: true });
  } catch {}
}

export const cwd = BASE;
