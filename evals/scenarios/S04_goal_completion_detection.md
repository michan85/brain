# Scenario S04: Goal Completion Detection

## Metadata
- **Tier**: Simple
- **Focus**: Evaluator (deliberate stop / quench signal), PFC Loop (termination behavior), Goal stack (completion criteria satisfaction)
- **Estimated iterations**: 1-2

## Setup
The knowledge graph contains a small amount of context:

```
Node: {
  id: "node_team_standup",
  name: "Team Standup",
  type: "event",
  observations: [
    { content: "Daily standup meeting held at 9:30 AM Eastern every weekday", confidence: 0.95 },
    { content: "Standup is held in the #engineering-standup Slack channel as an async text update", confidence: 0.9 },
    { content: "Format: what you did yesterday, what you're doing today, any blockers", confidence: 0.85 }
  ]
}
```

No edges. Scratch space is empty.

## User Goal
The user wants to know when and where the daily standup is. This is a simple factual question fully answerable from graph context. The system should answer and stop -- not over-elaborate, not continue reasoning after the goal is met.

## User Inputs
### Initial Prompt
"When and where is the daily standup?"

### Follow-up Responses
N/A -- this scenario should not require clarification.

## Expected Behavior

1. **Sensor processing**: Extracts entities: `{name: "daily standup", type: "event"}`. Generates embedding. Raw input forwarded.

2. **Graph Activation**: Seed search matches `node_team_standup` via the "daily standup" / "Team Standup" embedding similarity. All three observations are relevant. Activated subgraph contains one node, no edges, low dispersion.

3. **PFC Loop iteration 1**: The PFC initializes a goal: `{description: "Answer when and where the daily standup is", completionCriteria: "User receives time, location, and format of standup"}`. It sees the activated context contains all needed information. It produces a response Action with a Prediction (high confidence -- the answer is directly in the observations).

4. **Evaluator -- this is the critical step**: The Evaluator receives the response action. It must determine:
   - The goal's completion criteria are satisfied (the response contains time, location, and format)
   - Signal `status: "done"` (deliberate stop)
   - `quality: "productive"`
   - The loop should NOT continue for another iteration

5. **Loop terminates**: The PFC loop exits cleanly after the quench signal. No additional iterations.

**What this scenario specifically tests**: The Evaluator's ability to recognize when a goal is fully satisfied and emit the quench signal at the right time. The failure modes are:
- **Too early**: The Evaluator quenches before the PFC has produced a response (premature termination)
- **Too late**: The Evaluator signals `continue` after a complete response, causing unnecessary extra iterations (the PFC might restate the answer, add unnecessary caveats, or start exploring tangential topics)
- **Never**: The Evaluator never quenches and the loop hits fatigue or stale-state termination instead of deliberate stop

## Grading

### Key Concepts Being Tested
- Evaluator deliberate stop (Section 6.3: "The Evaluator determines the goal is satisfied. Clean termination.")
- Goal completion criteria definition and evaluation
- Distinction between the three termination mechanisms: deliberate stop vs. fatigue vs. stale state (Section 6.3)
- The Evaluator is a separate component from the PFC (Section 6: "This separation is non-negotiable")

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good" looks like here |
|-----------|----------------|---------------------------|
| D1: Goal Decomposition | 0.15 | Single goal with clear, evaluable completion criteria. The criteria should reference the specific information the user asked for (when + where). |
| D2: Retrieval Quality | 0.10 | Node found, relevant observations surfaced. Straightforward. |
| D3: Reasoning Efficiency | 0.25 | This is the primary efficiency test. Score 5 for 1 iteration (the PFC answers directly and the Evaluator quenches). Score 4 for 2 iterations (one thought + one response, Evaluator quenches correctly after the response). Score 2 for 3 iterations (Evaluator failed to quench on first complete response). Score 1 for 4+ iterations or termination by fatigue/stale-state instead of deliberate stop. |
| D4: Prediction Calibration | 0.05 | High confidence prediction on the response is appropriate. Not heavily weighted here. |
| D5: Reactivation Precision | 0.05 | No reactivation should fire. |
| D6: Self-Correction | 0.05 | Not tested. Score 3 (neutral). |
| D7: Memory Hierarchy Usage | 0.10 | Standard trace writing to scratch space. No KG writes. |
| D8: Output Quality | 0.25 | The response must contain: (1) the time (9:30 AM Eastern, weekdays), (2) the location (#engineering-standup Slack channel, async text), and (3) ideally the format. All three observations' information should be synthesized, not dumped raw. |

### Passing Threshold
Composite score >= 3.5

### Red Flags
- The loop terminates via fatigue (max iterations) instead of deliberate stop -- this means the Evaluator never recognized goal completion
- The loop terminates via stale-state detection instead of deliberate stop -- this means the Evaluator signaled "continue" repeatedly until the system stopped changing
- The Evaluator signals `status: "done"` before the PFC has produced any response action (premature quench)
- The system produces 3+ iterations on a question whose answer is fully present in the activated context
- The PFC continues reasoning after producing a complete response (e.g., starts asking itself "is there anything else the user might want to know?")
- The Evaluator signals `redirect` when no redirection is needed
