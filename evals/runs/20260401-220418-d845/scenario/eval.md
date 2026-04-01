# Scenario S09: Temporal State Resolution

## Metadata
- **Tier**: Simple
- **Focus**: Temporal reasoning over contradictory observations, recency weighting in activation, PFC interpretation of timestamped context
- **Estimated iterations**: 1-3

## Setup
Knowledge graph is pre-seeded with a task entity that has accumulated multiple status observations over time, simulating a task that moved through states.

```
Node: {
  id: "node_brain_42",
  name: "BRAIN-42",
  type: "task",
  metadata: { project: "brain-agent" },
  createdAt: 1743292800000   // 2025-03-30 00:00:00 UTC
}

Observation 1: {
  id: "obs_brain42_created",
  nodeId: "node_brain_42",
  content: "BRAIN-42 was created: 'Implement temporal weighting in graph activation'",
  createdAt: 1743292800000   // Monday March 30
}

Observation 2: {
  id: "obs_brain42_progress",
  nodeId: "node_brain_42",
  content: "BRAIN-42 moved to in-progress, assigned to Michael",
  createdAt: 1743379200000   // Tuesday March 31
}

Observation 3: {
  id: "obs_brain42_blocked",
  nodeId: "node_brain_42",
  content: "BRAIN-42 is blocked on the API team — waiting for embedding endpoint v2",
  createdAt: 1743465600000   // Wednesday April 1
}

Observation 4: {
  id: "obs_brain42_unblocked",
  nodeId: "node_brain_42",
  content: "BRAIN-42 unblocked — API team shipped embedding endpoint v2",
  createdAt: 1743552000000   // Thursday April 2
}

Observation 5: {
  id: "obs_brain42_done",
  nodeId: "node_brain_42",
  content: "BRAIN-42 completed and merged to main",
  createdAt: 1743638400000   // Friday April 3
}

Node: {
  id: "node_api_team",
  name: "API team",
  type: "team",
  createdAt: 1743292800000
}

Observation: {
  id: "obs_api_team",
  nodeId: "node_api_team",
  content: "API team is responsible for the embedding service and vector endpoints",
  createdAt: 1743292800000
}

Edge: {
  sourceNodeId: "node_brain_42",
  targetNodeId: "node_api_team",
  relation: "was_blocked_by",
  weight: 0.5,
  createdAt: 1743465600000
}
```

Scratch space is empty. The query is made on Friday April 3, after all observations are recorded.

## User Goal
The user wants to know the current status of BRAIN-42. The system must resolve five observations that describe a state progression and identify the most recent state as the current truth.

## User Inputs
### Initial Prompt
"What's the status of BRAIN-42?"

### Follow-up Prompts
If the system reports the task as blocked:
"Are you sure? Check the dates on those observations."

## Expected Behavior

1. **Sensor processing**: Extracts entity `{name: "BRAIN-42", type: "task"}`. Generates embedding. Raw input forwarded to PFC.

2. **Graph Activation**: Seed search on observation embeddings finds multiple observations for BRAIN-42. All five observations are semantically similar to the query ("status of BRAIN-42"), so vector similarity alone won't clearly differentiate them. Spread activation (1 hop) brings in the API team node via the `was_blocked_by` edge.

   **With recency weighting** (as specified in the architecture doc): observations with more recent `lastActivatedAt` / `createdAt` should score higher. Observation 5 ("completed and merged") should rank highest. The activated subgraph should present observations in a way that makes their temporal ordering apparent.

   **Without recency weighting** (current implementation): all five observations may surface with similar activation scores. The PFC must rely on timestamps in the observation content or metadata to reason about ordering.

3. **PFC Loop iteration 1**: The PFC receives the activated subgraph containing BRAIN-42 with multiple observations. It must:
   - Recognize these observations describe a state progression, not independent facts
   - Identify the most recent observation as the current state
   - Respond that BRAIN-42 is completed/done

   The PFC may think first ("I see multiple status updates, the most recent says completed") or go directly to respond.

4. **Evaluator**: Signals `status: "done"` after the response.

**Key structural expectation**: The system correctly resolves temporal state. It does NOT report the task as blocked (an older state), nor does it list all states as equally current. It identifies "completed and merged" as the current status, ideally noting the progression.

## Grading

### Key Concepts Being Tested
- Temporal reasoning over multiple observations for the same entity
- Recency weighting in activation (if implemented) — newer observations should score higher
- PFC's ability to interpret timestamped observations as a state progression, not independent facts
- Correct identification of "latest state wins" for status-like attributes
- Whether the system presents stale information as current

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good" looks like here |
|-----------|----------------|---------------------------|
| D1: Goal Decomposition | 0.05 | Single goal: "report current status of BRAIN-42." No decomposition needed. |
| D2: Retrieval Quality | 0.25 | All BRAIN-42 observations surface. Critical: the ordering or scoring makes it possible for the PFC to identify which is most recent. Score 5 if recency weighting ranks observation 5 highest. Score 3 if all observations surface with similar scores but timestamps are visible. Score 1 if only older observations surface or the completed observation is missing. |
| D3: Reasoning Efficiency | 0.15 | Score 5 for 1-2 iterations (direct answer or one thought + respond). Score 3 for 3. Score 1 for 4+ or if the system uses sense to re-investigate. |
| D4: Prediction Calibration | 0.05 | Not the focus. Score 3 (neutral). |
| D5: Reactivation Precision | 0.05 | No reactivation needed. Score 5 if none fires. |
| D6: Self-Correction | 0.10 | Tested if the system initially reports "blocked" and then self-corrects after the follow-up prompt. Score 5 if it gets it right the first time (no correction needed). Score 3 if it corrects after the follow-up. Score 1 if it never corrects. |
| D7: Memory Hierarchy Usage | 0.05 | Standard. Traces written to scratch. |
| D8: Output Quality | 0.30 | The response must state that BRAIN-42 is **completed/done/merged**. Bonus if it mentions the progression (was blocked, then unblocked, then completed). Score 5 for correct current status with context. Score 3 for correct status without context. Score 1 for reporting a stale status (blocked, in-progress, etc.). Score 0 if it reports "blocked" as current. |

### Passing Threshold
Composite score >= 3.5

### Red Flags
- The system reports BRAIN-42 as "blocked" — this is the most dangerous failure, surfacing a stale state as current
- The system lists all five statuses as equally valid without identifying which is current
- The system uses `sense` to look up the task status externally when the information is already in the graph
- The system hallucinates a status not present in any observation
- Recency weighting (if implemented) ranks older observations higher than newer ones
- The system ignores timestamps entirely and picks a status based solely on vector similarity
- The PFC asks the user "when was it last updated?" when the timestamps are available in the observations
