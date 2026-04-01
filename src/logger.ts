import { mkdirSync } from "node:fs";
import { join } from "node:path";

export interface IterationRecord {
  iteration: number;
  timestamp: number;

  // State snapshot
  goals: any[];
  activatedNodeCount: number;
  activatedNodeIds: string[];
  seedNodeIds: string[];
  workingMemorySize: number;

  // Output
  outputKind: "thought" | "action";
  outputContent: string;

  // Effector (if action)
  effectorId?: string;
  effectorPayload?: unknown;
  effectorResult?: { success: boolean; durationMs: number; error?: string };

  // Evaluation
  evaluationStatus?: string;
  evaluationQuality?: string;
  evaluationSurprise?: string;

  // Future fields (null until implemented)
  prediction: null;
  predictionError: null;
  reactivationTriggered: boolean;
  reactivationSource: null;

  // Scratch writes this iteration
  scratchWrites: string[];

  // Timing
  llmDurationMs: number;
  effectorDurationMs?: number;
  totalDurationMs: number;
}

export interface TrajectoryMetadata {
  sessionId: string;
  startTime: number;
  endTime: number;
  totalIterations: number;
  terminationReason: "done" | "fatigue" | "error";
  finalResponse: string;
  iterations: IterationRecord[];
}

interface Logger {
  logIteration(record: IterationRecord): void;
  finalize(metadata: Omit<TrajectoryMetadata, "iterations">): void;
}

const noopLogger: Logger = {
  logIteration() {},
  finalize() {},
};

export function createLogger(sessionId: string, logDir: string): Logger {
  if (!logDir) return noopLogger;

  const dir = join(logDir, sessionId);
  mkdirSync(dir, { recursive: true });

  const iterations: IterationRecord[] = [];

  return {
    logIteration(record: IterationRecord) {
      iterations.push(record);
      const filename = `iteration_${String(record.iteration).padStart(3, "0")}.json`;
      Bun.write(join(dir, filename), JSON.stringify(record, null, 2));
    },

    finalize(metadata: Omit<TrajectoryMetadata, "iterations">) {
      const trajectory: TrajectoryMetadata = {
        ...metadata,
        iterations,
      };
      Bun.write(join(dir, "trajectory.json"), JSON.stringify(trajectory, null, 2));
    },
  };
}
