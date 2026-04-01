// --- Sensor ---

export interface ExtractedEntity {
  name: string;
  type: string;
  confidence: number;
}

export interface SensorOutput {
  modality: string;
  timestamp: number;
  raw: unknown;
  entities: ExtractedEntity[];
  embedding: number[];
  metadata: Record<string, unknown>;
  urgency: number;
}

// --- Knowledge Graph ---

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  lastActivatedAt: number;
}

export interface Observation {
  id: string;
  nodeId: string;
  content: string;
  embedding: number[];
  confidence: number;
  createdAt: number;
  lastActivatedAt: number;
  supersededBy?: string;
}

export interface Edge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relation?: string;
  weight: number;
  createdAt: number;
}

// --- Activation ---

export interface ActivatedNode {
  node: GraphNode;
  relevantObservations: Observation[];
  activationScore: number;
  hopsFromSeed: number;
}

export interface ActivatedSubgraph {
  nodes: ActivatedNode[];
  edges: Edge[];
  seedNodeIds: string[];
}

// --- PFC Loop ---

export interface Goal {
  id: string;
  description: string;
  depth: number;
  status: "active" | "completed" | "blocked" | "abandoned";
  parentId?: string;
  completionCriteria: string;
}

export interface Thought {
  kind: "thought";
  content: string;
  timestamp: number;
}

export interface Action {
  kind: "action";
  effectorId: string;
  payload: unknown;
  timestamp: number;
}

export type PFCOutput = Thought | Action;

export interface LoopState {
  sensorOutputs: SensorOutput[];
  goals: Goal[];
  activatedContext: ActivatedSubgraph;
  workingMemory: Thought[];
  iterationCount: number;
  lastEffectorResult?: EffectorResult;
  lastEvaluation?: EvaluationResult;
}

// --- Evaluator ---

export interface EvaluationResult {
  status: "continue" | "done" | "redirect";
  quality: "productive" | "neutral" | "counterproductive";
  surprise: "none" | "low" | "high" | "critical";
  rationale: string;
  /** When status is "redirect", a hint for the PFC on what to do instead. */
  redirectHint?: string;
}

// --- Effectors ---

export interface EffectorResult {
  success: boolean;
  data: unknown;
  error?: string;
  durationMs: number;
}

// --- Scratch Space ---

export type ScratchTraceType =
  | "thought"
  | "action_result"
  | "prediction_error"
  | "evaluator_signal"
  | "observation";

export interface EvaluatorAnnotation {
  quality: EvaluationResult["quality"];
  surprise: EvaluationResult["surprise"];
  tags: string[];
}

export interface ScratchTrace {
  id: string;
  sessionId: string;
  loopIterationId: string;
  timestamp: number;
  type: ScratchTraceType;
  content: string;
  evaluatorAnnotation?: EvaluatorAnnotation;
  relatedNodeIds: string[];
  consolidated: boolean;
}

/** @deprecated Use ScratchTrace instead */
export type ScratchEntry = ScratchTrace;
