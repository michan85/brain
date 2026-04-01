## Scenario: C02_cascading_prediction_errors
## Tier: complex
## Composite Score: 1.0/5.0 (Failing)

### Summary
- **Session**: 20260401-214451-7392
- **Total iterations**: N/A
- **Termination reason**: N/A
- **Response length**: 0 chars
- **Duration**: 300.0s
- **Timed out**: Yes
- **Effectors used**: none
- **Thoughts / Actions**: 0 / 0
- **LLM time**: 0.0s (0.0%)
- **Scratch writes**: 0

### Dimension Scores
| Dimension | Score | Weight | Weighted | Justification |
|-----------|-------|--------|----------|---------------|
| D1: Goal Decomposition | 1 | 0.15 | 0.15 | No goal decomposition data is available because the agent produced no response or actions; there is no evidence that the deploy goal was structured or attempted. |
| D2: Retrieval Quality | 1 | 0.15 | 0.15 | Retrieval quality cannot be assessed; without any activated context or subgraph activations, the system failed to bring in any relevant information. |
| D3: Reasoning Efficiency | 1 | 0.1 | 0.10 | No iterations occurred, so the PFC loop never ran. There is no evidence of any reasoning, much less efficient progress. |
| D4: Prediction Calibration | 1 | 0.15 | 0.15 | No predictions or confidences were generated, so calibration cannot be demonstrated; the evaluator never produced an efference copy. |
| D5: Reactivation Precision | 1 | 0.1 | 0.10 | There were no reactivations at all despite the high-surprise scenario, indicating a failure to trigger the expected retrieval mechanism. |
| D6: Self-Correction | 1 | 0.15 | 0.15 | With no prediction errors, there was nothing to self-correct; the system did not react to the cascading failures described in the scenario. |
| D7: Memory Hierarchy Usage | 1 | 0.1 | 0.10 | Memory hierarchy usage cannot be evaluated—no working memory entries, scratch notes, or compression events were recorded. |
| D8: Output Quality | 1 | 0.1 | 0.10 | The run produced no final output, so the user goal remains unmet and there is no summary of the deployment outcome. |

### Deterministic Checks
| Check | Status | Detail |
|-------|--------|--------|
| Non-empty response | FAIL | Response length: 0 chars |
| Iterations in estimated range | SKIP | No trajectory.json found |
| Termination reason | SKIP | Not available (no trajectory.json or field missing) |
| Completed within timeout | FAIL | Killed after 300s |
| Agent exited cleanly | WARN | Exit code: 143 |
| Effector diversity | SKIP | No trajectory data |
| Thought-to-action ratio | SKIP | No iterations in trajectory |
| Evaluation quality distribution | SKIP | No evaluation data in trajectory |
| Total LLM time | INFO | 0.0s (0.0% of wall-clock) |
| Scratch write count | INFO | 0 writes |

### Trajectory Highlights
- None; trajectory is empty

### Diagnosis
The agent did not engage with the scenario at all. No goals were formed, no retrievals performed, no predictions made, and no deploy attempt occurred.

### Recommendations
1. Ensure the agent executes the PFC loop on receipt of the user goal, generating predictions, monitoring effector outcomes, and reacting to surprises.
2. Activate retrieval and reasoning components so that context (order-service, shared proto) is available for diagnosis.
3. Provide a concrete final response summarizing actions taken, failures encountered, and the successful deployment result.

### Red Flags
- No response or reasoning occurred
- Core dimensions (D1-D8) all failed

### Response Preview
```
(empty)
```
