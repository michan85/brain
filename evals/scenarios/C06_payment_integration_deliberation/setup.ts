// setup.ts — copies mock-saas project files to their expected locations
import { mkdirSync, copyFileSync, rmSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";

const CONTEXT_DIR = join(import.meta.dir, "context");
const DEST_ROOT = "/tmp/brain-eval-c06";

const files: Array<{ src: string; dest: string }> = [
  { src: "mock-saas/src/routes/api.ts", dest: join(DEST_ROOT, "mock-saas/src/routes/api.ts") },
  { src: "mock-saas/src/models/user.ts", dest: join(DEST_ROOT, "mock-saas/src/models/user.ts") },
  { src: "mock-saas/src/middleware/auth.ts", dest: join(DEST_ROOT, "mock-saas/src/middleware/auth.ts") },
  { src: "mock-saas/src/db/schema.sql", dest: join(DEST_ROOT, "mock-saas/src/db/schema.sql") },
  { src: "mock-saas/package.json", dest: join(DEST_ROOT, "mock-saas/package.json") },
  { src: "mock-saas/.env.example", dest: join(DEST_ROOT, "mock-saas/.env.example") },
];

export function setup() {
  for (const { src, dest } of files) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(CONTEXT_DIR, src), dest);
  }
}

export function teardown() {
  try {
    rmSync(DEST_ROOT, { recursive: true });
  } catch {}
}
