# Scenario L01: Repeated Task Efficiency

## Metadata
- **Tier**: Longitudinal
- **Focus**: PFC Loop (iteration efficiency), Evaluator (prediction calibration), Dreamer (pattern abstraction), Graph Activation (pattern node retrieval)
- **Sessions**: 5
- **Estimated iterations per session**: Session 1: 4-5, Session 2: 3-4, Session 3: 3, Session 4: 2-3, Session 5: 2

## Setup
The knowledge graph is bootstrapped with a small project management domain:

- **Node**: `project_alpha` (type: `"project"`) -- observations: `"Project Alpha is an internal billing system rewrite"`, `"Tech lead is Jordan"`, `"Uses PostgreSQL and TypeScript"`
- **Node**: `project_beta` (type: `"project"`) -- observations: `"Project Beta is a customer-facing mobile app"`, `"Tech lead is Sam"`, `"Uses React Native and GraphQL"`
- **Node**: `project_gamma` (type: `"project"`) -- observations: `"Project Gamma is an infrastructure migration to Kubernetes"`, `"Tech lead is Alex"`, `"Targets Q3 completion"`
- **Node**: `project_delta` (type: `"project"`) -- observations: `"Project Delta is a data pipeline rebuild"`, `"Tech lead is Morgan"`, `"Uses Apache Kafka and Spark"`
- **Node**: `project_epsilon` (type: `"project"`) -- observations: `"Project Epsilon is a security audit automation framework"`, `"Tech lead is Taylor"`, `"Integrates with SIEM tooling"`
- **Node**: `project_tracker` (type: `"tool"`) -- observations: `"Project tracker API at /api/v1/projects/{slug}/status"`, `"Returns JSON with fields: status, blockers, lastUpdated, velocity"`
- **Edges**: Each project connects to `project_tracker` via `"tracked_by"` edges.

The graph should NOT contain any pre-existing pattern nodes for status checks. The scenario tests whether those emerge naturally.

## Session Sequence

### Session 1
**User Goal**: Get the current status of Project Alpha.
**Initial Prompt**: "What's the status of Project Alpha?"
**Follow-up Responses**: N/A -- the question is unambiguous.
**Effector Responses**:
- Project tracker API call for `project_alpha`: `{ "status": "on-track", "blockers": [], "lastUpdated": "2026-03-30T14:00:00Z", "velocity": 0.85 }`
**Expected Outcome**:
- Sensor extracts `project_alpha` entity.
- Graph activation returns the `project_alpha` node and the `project_tracker` node via the `tracked_by` edge.
- PFC decomposes into sub-goals: (1) determine how to check status, (2) call the tracker API, (3) synthesize and respond.
- PFC calls the project tracker effector with `project_alpha` slug.
- Prediction is generated for the tracker call (likely moderate confidence, 0.4-0.6, since this is the first time).
- Evaluator processes the result, quenches on successful response.
- Scratch space receives traces for the full trajectory: thoughts, action results, evaluator signals.
- Expected iteration count: 4-5 (plan, identify tracker, call API, synthesize response, possibly one extra thought).

### Session 2
**User Goal**: Get the current status of Project Beta.
**Initial Prompt**: "What's the current status of Project Beta?"
**Follow-up Responses**: N/A.
**Effector Responses**:
- Project tracker API call for `project_beta`: `{ "status": "at-risk", "blockers": ["design review pending"], "lastUpdated": "2026-03-31T09:00:00Z", "velocity": 0.62 }`
**Expected Outcome**:
- Between sessions, the Dreamer has consolidated Session 1's traces.
- Graph activation for `project_beta` should also pull in consolidated knowledge from Session 1 -- specifically, any promoted observations about the status-check workflow (e.g., "status checks use the project tracker API at /api/v1/projects/{slug}/status").
- PFC should recognize the pattern faster: the workflow is the same as Session 1. Sub-goal decomposition should be leaner -- possibly skipping the "determine how to check status" sub-goal because the activated context already contains the method.
- Prediction confidence for the tracker API call should be higher (0.6-0.8) because the system has seen a similar call succeed before.
- Expected iteration count: 3-4 (one fewer planning iteration).

### Session 3
**User Goal**: Get the current status of Project Gamma.
**Initial Prompt**: "Can you check on Project Gamma's status?"
**Follow-up Responses**: N/A.
**Effector Responses**:
- Project tracker API call for `project_gamma`: `{ "status": "on-track", "blockers": [], "lastUpdated": "2026-03-31T16:00:00Z", "velocity": 0.91 }`
**Expected Outcome**:
- By now, the Dreamer should have consolidated two status-check sessions. A pattern node may begin forming (or at minimum, the observations about the status-check workflow should be well-strengthened).
- PFC should proceed more directly. If a pattern node exists and activates, the PFC has an explicit workflow template in its activated context.
- Prediction confidence should be 0.7+ for the tracker call.
- Expected iteration count: 3 (plan, call API, respond).

### Session 4
**User Goal**: Get the current status of Project Delta.
**Initial Prompt**: "Status update on Project Delta?"
**Follow-up Responses**: N/A.
**Effector Responses**:
- Project tracker API call for `project_delta`: `{ "status": "blocked", "blockers": ["Kafka cluster migration in progress", "Spark job scheduling conflict"], "lastUpdated": "2026-04-01T08:00:00Z", "velocity": 0.34 }`
**Expected Outcome**:
- The Dreamer has processed three status-check sessions. A pattern node should exist by now -- something like `"project-status-check-workflow"` (type: `"pattern"`) with `instance_of` edges connecting to the traces/nodes from sessions 1-3.
- Graph activation for `project_delta` should pull in the pattern node alongside the project node. The PFC receives an explicit workflow in its activated context.
- Prediction confidence should be high (0.8+).
- Expected iteration count: 2-3 (the pattern node essentially provides a pre-built plan).

### Session 5
**User Goal**: Get the current status of Project Epsilon.
**Initial Prompt**: "What's happening with Project Epsilon?"
**Follow-up Responses**: N/A.
**Effector Responses**:
- Project tracker API call for `project_epsilon`: `{ "status": "on-track", "blockers": [], "lastUpdated": "2026-04-01T11:00:00Z", "velocity": 0.78 }`
**Expected Outcome**:
- The system is now experienced at this task class. The pattern node is well-established with high confidence and four instance edges.
- Execution should be nearly automatic: activate context (pattern node + project node), call tracker API with high-confidence prediction, synthesize response.
- Prediction confidence should be 0.85+.
- Expected iteration count: 2 (call API, respond -- the planning step is absorbed by the pattern node's activated context).

## Dreamer Expectations

### After Session 1
- **Promote**: The observation "checked Project Alpha status via project tracker API, received JSON with status/blockers/velocity" should be promoted as a new observation on the `project_tracker` node or as a new node linking the action to the result.
- **Prune**: Operational thoughts like "I need to figure out how to check the status" should be pruned -- they are low-surprise, low-quality process artifacts.
- **Strengthen**: The `tracked_by` edge between `project_alpha` and `project_tracker` should be strengthened (it was activated and useful).

### After Session 2
- **Consolidate**: The Session 2 status-check trace is structurally identical to Session 1's. The Dreamer should merge them into a single strengthened observation about the status-check workflow rather than creating a duplicate.
- **Strengthen**: Edge weights on `tracked_by` relationships should increase further.
- The Dreamer may detect the beginnings of a pattern (two instances of the same workflow) but typically requires 3+ instances to create a pattern node with confidence.

### After Session 3
- **Pattern abstraction (Phase 2)**: Three instances of the same task structure should trigger pattern detection. The Dreamer should create a `"pattern"` type node (e.g., `"project-status-check-workflow"`) with:
  - Observations summarizing the workflow: "To check project status, call the project tracker API at /api/v1/projects/{slug}/status and synthesize the JSON response."
  - `instance_of` edges connecting to the traces/observations from sessions 1-3.
  - Confidence of 0.6-0.7 (three instances is enough to detect, not yet to be highly confident).

### After Session 4
- **Strengthen pattern**: The pattern node's confidence should increase (now four instances). Edge weights on `instance_of` edges should strengthen.
- **No new pattern creation**: The existing pattern node should absorb this instance, not spawn a duplicate.

### After Session 5
- **Pattern fully established**: Confidence should be 0.8+ with five instance edges. This pattern node is now a stable part of the graph that will activate on any future "check project status" query.

## Grading

### Key Concepts Being Tested
- **Iteration efficiency improvement**: The core question -- does the system get faster at the same type of task? This is the most direct measure of learning.
- **Prediction calibration improvement**: Does the system become more accurate in predicting tracker API outcomes as it accumulates experience?
- **Pattern emergence**: Does the Dreamer correctly abstract a recurring workflow into a reusable pattern node?
- **Pattern utilization**: Once a pattern node exists, does it activate and meaningfully reduce PFC effort?

### Scenario-Specific Grading Criteria

| Dimension | Weight | What "good" looks like here |
|-----------|--------|---------------------------|
| D1: Goal Decomposition | 0.10 | Goal stack should simplify over sessions. Session 1 may have 3 sub-goals; Session 5 should have 1-2. The pattern node should reduce the need for explicit planning sub-goals. |
| D2: Retrieval Quality | 0.10 | Each session should activate the correct project node + tracker. From session 3+, the pattern node should also activate. No noise nodes. |
| D3: Reasoning Efficiency | 0.15 | Iteration count must decrease. See L1 metric below. |
| D4: Prediction Calibration | 0.15 | Confidence should increase monotonically and deviation should decrease. See L2 metric below. |
| D5: Reactivation Precision | 0.05 | Reactivation should not fire in later sessions (no surprises expected). If it fires in session 1 due to an unexpected tracker response, that is acceptable. |
| D6: Self-Correction | 0.05 | Not the primary focus. Score 3 (neutral) unless an error occurs and the system handles or mishandles it. |
| D7: Memory Hierarchy Usage | 0.10 | Scratch space traces should be complete. No direct KG writes. Working memory compression should not be needed for these short sessions. |
| D8: Output Quality | 0.10 | Each status response should be accurate and well-structured. Quality should remain consistent even as efficiency improves. |
| **L1: Iteration Efficiency Trend** | 0.20 | **Primary longitudinal metric.** Measure iteration count per session. Score 5: monotonically decreasing with final session at 50% or less of session 1. Score 3: general downward trend but non-monotonic. Score 1: no decrease or increase over sessions. |
| **L2: Prediction Error Trend** | 0.15 | Average prediction deviation should decrease across sessions. Score 5: deviation in session 5 is less than 0.15 and less than half of session 1. Score 3: some decrease. Score 1: flat or increasing. |
| **L4: Pattern Emergence** | 0.20 | A pattern node must form by session 3 or 4 and activate on subsequent sessions. Score 5: pattern node created by session 3, activates in sessions 4 and 5, measurably improves performance. Score 3: pattern node created but doesn't activate or doesn't improve performance. Score 1: no pattern node created. |
| **L5: Consolidation Quality** | 0.10 | Of traces promoted to the KG, what percentage contributed to better outcomes in later sessions? Score 5: >80% of promoted traces are activated in at least one future session. Score 1: promoted traces are never reactivated (graph pollution). |

Note: Longitudinal metric weights are applied in addition to (not instead of) the standard dimension weights. The composite is renormalized.

### Passing Threshold
- **Minimum composite**: 3.5/5.0 (Strong)
- **Hard requirements** (failing any one of these is an automatic fail regardless of composite score):
  - Session 5 iteration count must be strictly less than Session 1 iteration count.
  - A pattern node of type `"pattern"` must exist in the knowledge graph after all 5 sessions.
  - Prediction confidence for the tracker API call must be higher in Session 5 than in Session 1.

### Red Flags
- **No iteration improvement**: If session 5 takes as many or more iterations than session 1, the system is not learning. This is the single most important failure signal.
- **Graph pollution**: Pattern nodes that are too generic (e.g., a pattern for "answering questions" rather than specifically "checking project status via tracker API") indicate poor consolidation discrimination.
- **Pattern node exists but does not activate**: The Dreamer created the pattern, but the graph activation layer does not retrieve it on relevant queries. This indicates an embedding or activation threshold problem.
- **Duplicate pattern nodes**: Multiple pattern nodes for the same workflow indicate the Dreamer is not detecting existing patterns before creating new ones.
- **Prediction confidence does not increase**: The system is not incorporating past experience into its forward model.
- **Quality degradation**: If response quality drops as efficiency increases (the system is taking shortcuts that hurt output), this is a net negative.
