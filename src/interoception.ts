/**
 * Interoceptive sensors — monitor the agent's own state (time, spatial context)
 * rather than processing external input.
 */

import { embed } from "./llm";
import { now } from "./utils";
import type { SensorOutput, ExtractedEntity } from "./types";

/**
 * Clock sensor: produces a SensorOutput with the current timestamp.
 * Time doesn't seed graph activation — entities and embedding are empty.
 */
export function clockSensor(): SensorOutput {
  const timestamp = now();
  const date = new Date(timestamp);

  return {
    modality: "temporal",
    timestamp,
    raw: timestamp,
    entities: [],
    embedding: [],
    metadata: {
      iso: date.toISOString(),
      dayOfWeek: date.toLocaleDateString("en-US", { weekday: "long" }),
      hour: date.getHours(),
    },
    urgency: 0,
  };
}

/**
 * Spatial sensor: reads the working directory and detects the project context.
 * If a package.json exists, extracts project name/description as entities
 * and generates an embedding from the description.
 */
export async function spatialSensor(cwd?: string): Promise<SensorOutput> {
  const dir = cwd ?? process.cwd();
  const timestamp = now();

  const entities: ExtractedEntity[] = [];
  const metadata: Record<string, unknown> = { cwd: dir };
  let embeddingVec: number[] = [];

  try {
    const pkgFile = Bun.file(`${dir}/package.json`);
    if (await pkgFile.exists()) {
      const pkg = JSON.parse(await pkgFile.text());
      const projectName = pkg.name ?? null;
      const description = pkg.description ?? null;

      if (projectName) {
        metadata.projectName = projectName;
        entities.push({
          name: projectName,
          type: "project",
          confidence: 0.9,
        });
      }

      if (description) {
        metadata.description = description;
        try {
          embeddingVec = await embed(description);
        } catch {
          // Embedding failed — degrade gracefully
        }
      }
    } else {
      // No package.json — use directory name as a weaker entity
      const dirName = dir.split("/").filter(Boolean).pop() ?? dir;
      metadata.projectName = dirName;
      entities.push({
        name: dirName,
        type: "directory",
        confidence: 0.5,
      });
    }
  } catch {
    // File read or parse failed — degrade to directory name
    const dirName = dir.split("/").filter(Boolean).pop() ?? dir;
    metadata.projectName = dirName;
    entities.push({
      name: dirName,
      type: "directory",
      confidence: 0.5,
    });
  }

  return {
    modality: "spatial",
    timestamp,
    raw: dir,
    entities,
    embedding: embeddingVec,
    metadata,
    urgency: 0,
  };
}

/**
 * Gather all interoceptive sensor outputs.
 * This is the convenience function the PFC loop calls.
 */
export async function gatherInteroception(cwd?: string): Promise<SensorOutput[]> {
  const clock = clockSensor();
  const spatial = await spatialSensor(cwd);
  return [clock, spatial];
}
