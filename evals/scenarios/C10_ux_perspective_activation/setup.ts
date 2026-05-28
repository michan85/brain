// setup.ts -- copies mock-collab-app context files to /tmp for brain agent to discover
import { mkdirSync, copyFileSync, rmSync } from "fs";
import { join, dirname } from "path";

const CONTEXT_DIR = join(import.meta.dir, "context");
const DEST_ROOT = "/tmp/brain-eval-c10/mock-collab-app";

const files: Array<{ src: string; dest: string }> = [
  { src: "mock-collab-app/package.json", dest: `${DEST_ROOT}/package.json` },
  { src: "mock-collab-app/.env.example", dest: `${DEST_ROOT}/.env.example` },
  { src: "mock-collab-app/src/routes/settings.ts", dest: `${DEST_ROOT}/src/routes/settings.ts` },
  { src: "mock-collab-app/src/routes/notifications.ts", dest: `${DEST_ROOT}/src/routes/notifications.ts` },
  { src: "mock-collab-app/src/models/user.ts", dest: `${DEST_ROOT}/src/models/user.ts` },
  { src: "mock-collab-app/src/models/notification.ts", dest: `${DEST_ROOT}/src/models/notification.ts` },
  { src: "mock-collab-app/src/services/notification.ts", dest: `${DEST_ROOT}/src/services/notification.ts` },
  { src: "mock-collab-app/src/components/Settings/index.tsx", dest: `${DEST_ROOT}/src/components/Settings/index.tsx` },
  { src: "mock-collab-app/src/db/schema.sql", dest: `${DEST_ROOT}/src/db/schema.sql` },
];

export function setup() {
  for (const { src, dest } of files) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(CONTEXT_DIR, src), dest);
  }
}

export function teardown() {
  try {
    rmSync("/tmp/brain-eval-c10", { recursive: true });
  } catch {}
}
