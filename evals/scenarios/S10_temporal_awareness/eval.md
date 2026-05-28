# Scenario S10: Temporal Awareness

## Metadata
- **Tier**: Simple
- **Focus**: Interoceptive Sensors (clock sensor), Graph Activation (seed search), PFC Loop (reasoning with temporal context)
- **Estimated iterations**: 1-2

## Setup
The knowledge graph contains nodes about a deployment policy and a service. The clock sensor provides the current timestamp as an interoceptive `SensorOutput` at loop initialization. No staged context files are needed.

The scenario is time-sensitive: the correct answer depends on the agent combining its temporal awareness (from the clock sensor) with retrieved graph observations about time-based policies.

## User Goal
The user wants to know if they can deploy right now. The answer depends on the current time evaluated against the team's deploy policy stored in the graph.

## User Inputs
### Initial Prompt
"Can I deploy the payments service right now?"

### Follow-up Responses
N/A — this scenario should not require clarification.

## Expected Behavior

1. **Interoceptive sensing (clock)**: Before any external input processing, the clock sensor fires at loop initialization and produces a `SensorOutput` with `modality: "temporal"`, `raw: <current unix timestamp>`, `entities: []`, `embedding: []`. This raw timestamp is available to the PFC through `LoopState.sensorOutputs`. The clock sensor contributes no graph activation seeds (empty entities/embedding) — it provides ambient context only.

2. **Sensor processing (exteroceptive)**: The Text Sensor extracts entities: `{name: "payments service", type: "service"}`, `{name: "deploy", type: "action"}`. It generates an embedding for the full query. The raw input is forwarded to the PFC.

3. **Graph Activation**: The `findSeeds()` vector search on observation embeddings should match the "Payments Service" node and the "Engineering Deploy Policy" node. The deploy policy observations about time windows and freeze rules should have high relevance to a "deploy" + "right now" query. The activated subgraph should contain:
   - Both nodes with `hopsFromSeed: 0` (direct seed matches) or the policy node at `hopsFromSeed: 1` (via the `governs` edge)
   - `relevantObservations`: the deploy window observations from the policy node and the service stability observation
   - `coverageGaps`: empty (the query terms matched)

4. **PFC Loop**: Receives raw user input + clock sensor output + the activated subgraph. Initializes a single goal: "Determine if deploying payments service is safe right now." The PFC should:
   - Read the current timestamp from the clock sensor's `SensorOutput`
   - Read the deploy policy observations (deploy window, Friday freeze)
   - Reason about whether the current time falls within the allowed deploy window
   - Produce a response via the `respond` effector with a time-aware answer

5. **Evaluator**: The response action should receive `status: "done"`, `quality: "productive"`. The loop quenches after 1-2 iterations.

**Key structural expectation**: The clock sensor provides temporal context as an interoceptive `SensorOutput`. The PFC combines this with graph-retrieved deploy policy observations to produce a time-sensitive answer. The answer must reference the actual current time and the policy constraints — not give a generic "check the deploy policy" response. The only effector used is `respond`.

## Grading

### Key Concepts Being Tested
- Clock sensor fires at loop initialization and produces a valid `SensorOutput` (Section 3.2: interoceptive sensors)
- Clock sensor's raw timestamp is accessible to the PFC in `LoopState.sensorOutputs`
- PFC combines interoceptive temporal data with graph-retrieved observations to reason about time-sensitive questions
- Correct temporal reasoning — the answer must be consistent with the actual current time vs. the policy

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good" looks like here |
|-----------|----------------|---------------------------|
| D1: Goal Decomposition | 0.10 | Single goal, no sub-goals. This is a direct lookup + temporal reasoning. |
| D2: Retrieval Quality | 0.20 | The deploy policy node and payments service node are found. Deploy window and Friday freeze observations surface. No noise nodes. |
| D3: Reasoning Efficiency | 0.10 | 1-2 iterations. The answer is in the activated context + clock sensor — no tool calls or exploration needed. |
| D4: Prediction Calibration | 0.10 | High confidence prediction on the response. |
| D5: Reactivation Precision | 0.05 | No reactivation should fire. |
| D6: Self-Correction | 0.05 | Not tested. Score 3 (neutral). |
| D7: Memory Hierarchy Usage | 0.10 | Minimal working memory usage. Traces written to scratch space. No KG writes. |
| D8: Output Quality | 0.30 | The response must: (1) reference the current time or day, (2) state whether it's within the deploy window, (3) give a clear yes/no recommendation. A response that says "check the deploy policy" without evaluating it against the current time is a failure. |

### Passing Threshold
Composite score >= 3.5

### Red Flags
- No clock sensor `SensorOutput` appears in `LoopState.sensorOutputs`
- The PFC responds without referencing the current time (generic response)
- The PFC gives a time-specific answer that contradicts the actual current time (e.g., says "it's morning" when the timestamp is evening)
- The system calls `sense` or `act` when the answer is derivable from clock sensor + activated context
- The system asks the user what time it is
