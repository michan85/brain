# Scenario I01: Sub-Goal Decomposition

## Metadata
- **Tier**: Intermediate
- **Focus**: PFC Loop goal stack (push/pop), effector prediction, evaluator gating
- **Estimated iterations**: 5-6

## Setup

Seed the knowledge graph with the following nodes and edges:

**Nodes:**

1. `node:project_atlas` (type: `"project"`)
   - Observation: "Project Atlas is a data pipeline migration from legacy Spark jobs to Flink. Owned by the platform team."
   - Observation: "Atlas tracks its work items in LinearB under team workspace 'platform-eng'."
   - Observation: "Atlas deployment metrics are published to the internal Grafana instance under dashboard 'atlas-pipeline-health'."

2. `node:linearb` (type: `"tool"`)
   - Observation: "LinearB is the engineering project tracker. API endpoint: linearb.internal/api/v2."
   - Observation: "LinearB work items have statuses: backlog, in-progress, review, done, blocked."

3. `node:grafana_internal` (type: `"tool"`)
   - Observation: "Internal Grafana instance hosts operational dashboards. API endpoint: grafana.internal/api."
   - Observation: "Dashboard UIDs follow the pattern {team}-{service}-{metric-category}."

4. `node:platform_team` (type: `"team"`)
   - Observation: "Platform team owns Atlas, the shared Kafka cluster, and the schema registry."

**Edges:**

- `project_atlas --[tracked_in]--> linearb` (weight: 0.9)
- `project_atlas --[monitored_by]--> grafana_internal` (weight: 0.8)
- `project_atlas --[owned_by]--> platform_team` (weight: 0.9)

**Scratch Space:** Empty (new session).

## User Goal

Get a consolidated status update on Project Atlas that covers both work-item progress (from LinearB) and operational health (from Grafana). The answer requires data from two separate effector calls that must be synthesized.

## User Inputs

### Initial Prompt
"Give me a full status update on Project Atlas -- both where the work stands and how the pipeline is running."

### Follow-up Responses

- If asked "Which LinearB workspace should I check?": "It's under platform-eng, the workspace for the platform team."
- If asked "Which Grafana dashboard should I look at?": "The atlas-pipeline-health dashboard."
- If asked "Do you want raw metrics or a summary?": "Just a summary of anything that looks off, otherwise tell me it's healthy."

## Expected Behavior

**Iteration 1 (Plan):**
- Sensor extracts entities: `project_atlas`, `status`.
- Graph activation seeds on `project_atlas`, spreads to `linearb`, `grafana_internal`, `platform_team`.
- PFC initializes top-level goal: "Provide full status update on Project Atlas covering work items and pipeline health."
- PFC recognizes two information sources are needed. Pushes two sub-goals:
  - Sub-goal A: "Fetch work-item status from LinearB for project Atlas."
  - Sub-goal B: "Fetch pipeline health metrics from Grafana for Atlas."
- Thought written to working memory. No reactivation (no hints, no surprise).
- Evaluator: CONTINUE, quality: productive.

**Iteration 2 (Execute sub-goal A):**
- PFC selects sub-goal A as active. Generates Action to call LinearB effector.
- Prediction: "LinearB returns a list of work items with statuses. Confidence: 0.75."
- Effector calls `linearb.getWorkItems({ workspace: "platform-eng", project: "atlas" })`.
- Returns: `{ items: [{ title: "Migrate job-alpha to Flink", status: "done" }, { title: "Migrate job-beta to Flink", status: "in-progress" }, { title: "Migrate job-gamma to Flink", status: "blocked", blocker: "schema registry v2 not deployed" }] }`.
- Evaluator computes prediction error. Result matches expected shape. Deviation: low (~0.2). Surprise: "low".
- Evaluator: CONTINUE. Sub-goal A marked completed, popped.
- Scratch space: trace written with action result and evaluator signal.

**Iteration 3 (Execute sub-goal B):**
- PFC selects sub-goal B as active. Generates Action to call Grafana effector.
- Prediction: "Grafana returns dashboard panels with current metric values. Confidence: 0.7."
- Effector calls `grafana.getDashboard({ uid: "platform-atlas-pipeline-health" })`.
- Returns: `{ panels: [{ title: "Throughput", value: "12k events/sec", status: "normal" }, { title: "Error Rate", value: "0.02%", status: "normal" }, { title: "Lag", value: "45s", status: "warning" }] }`.
- Evaluator: deviation low. Surprise: "none". CONTINUE.
- Sub-goal B marked completed, popped.
- Scratch space: trace written.

**Iteration 4 (Synthesize):**
- Both sub-goals completed. PFC returns to top-level goal.
- PFC produces a Thought synthesizing LinearB and Grafana results into a coherent status summary.
- Working memory now contains: plan, LinearB results, Grafana results, synthesis.
- No reactivation triggered.

**Iteration 5 (Respond):**
- PFC generates Action to respond to user with synthesized status update.
- Prediction: "User receives a combined summary. Confidence: 0.85."
- Evaluator: DONE. Goal satisfied.
- Final scratch trace written.

**Key structural requirement:** The goal stack must show exactly one push for the top-level goal, two pushes for sub-goals, two pops (one per completed sub-goal), and then the top-level goal completes. Sub-goals should execute sequentially (A then B), not be conflated into a single action.

## Grading

### Key Concepts Being Tested
- Goal hierarchy: push/pop lifecycle for sub-goals under a parent goal
- Multiple effector calls driven by distinct sub-goals (not a single monolithic action)
- Synthesis across effector results after sub-goals complete
- Prediction generation for each effector call
- Evaluator gating after each sub-goal

### Scenario-Specific Grading Criteria

**D1: Goal Decomposition (weight: 0.25, override from 0.15)**
- Score 5: Two sub-goals pushed, each with clear completion criteria, executed independently, popped on completion, parent goal resumes after both complete.
- Score 3: Sub-goals exist but are poorly scoped (e.g., one sub-goal tries to fetch from both sources) or missing completion criteria.
- Score 1: No sub-goals created. The system tries to answer in a single action or skips one source entirely.

**D2: Retrieval Quality (weight: 0.15)**
- Score 5: Activation seeds on `project_atlas`, spreads to `linearb` and `grafana_internal`. Both tool nodes and their API observations are in the activated subgraph.
- Score 3: Seeds on `project_atlas` but only picks up one of the two tool nodes.
- Score 1: Activation misses `project_atlas` or returns irrelevant nodes.

**D3: Reasoning Efficiency (weight: 0.10)**
- Score 5: 5-6 iterations. Each iteration is productive.
- Score 3: 7-8 iterations with some redundancy (e.g., re-planning after each sub-goal unnecessarily).
- Score 1: More than 10 iterations or circular reasoning.

**D4: Prediction Calibration (weight: 0.10, override from 0.15)**
- Score 5: Predictions for both effector calls are reasonable descriptions of expected API responses. Confidence levels reflect the system's familiarity with the tools (observations exist, so moderate-to-high confidence).
- Score 3: Predictions are vague or confidence is uncalibrated.
- Score 1: No predictions generated, or predictions are nonsensical.

**D5: Reactivation Precision (weight: 0.05, override from 0.10)**
- Score 5: No reactivation fires (correct -- low surprise, no drift). Initial activation was sufficient.
- Score 3: One unnecessary reactivation.
- Score 1: Reactivation fires every iteration.

**D6: Self-Correction (weight: 0.05, override from 0.15)**
- Score 5: Not heavily tested here — no major prediction errors expected. If minor deviations occur, the system adjusts appropriately.
- (Low weight because the scenario focuses on goal decomposition and synthesis, not error recovery.)

**D7: Memory Hierarchy Usage (weight: 0.10)**
- Score 5: Each sub-goal result is written to scratch space. Synthesis thought references both results from working memory. No direct KG writes.
- Score 3: Results are in working memory but not persisted to scratch.
- Score 1: Direct KG writes or lost intermediate results.

**D8: Output Quality (weight: 0.20, override from 0.10)**
- Score 5: Final response covers both work-item progress (3 items, their statuses, the blocker) and pipeline health (throughput, error rate, lag warning). Information is synthesized, not just dumped.
- Score 3: Covers both sources but misses details (e.g., omits the blocker or the lag warning).
- Score 1: Only covers one source, or output is factually wrong.

### Passing Threshold
Composite score >= 3.5

### Red Flags
- System makes only one effector call and tries to answer from that alone (D1 drops to 1)
- System responds before both sub-goals complete (D1 drops to 1, D8 drops to 1)
- System writes effector results directly to the knowledge graph (D7 drops to 1)
- Goal stack never shows more than one goal at any point (D1 drops to 1)
