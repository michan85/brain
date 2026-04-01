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
}

export interface Observation {
  id: string;
  nodeId: string;
  content: string;
  embedding: number[];
  createdAt: number;
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
}

// --- Effectors ---

export interface EffectorResult {
  success: boolean;
  data: unknown;
  error?: string;
  durationMs: number;
}

// --- Scratch Space ---

export interface ScratchEntry {
  id: string;
  sessionId: string;
  timestamp: number;
  type: "thought" | "action_result" | "evaluator_signal" | "observation";
  content: string;
}
