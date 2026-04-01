## Eval Report

### Scenario
- **ID**: S02_single_node_retrieval
- **Session**: 20260401-204528-9599

### Summary
- **Total iterations**: 1
- **Termination reason**: done
- **Response length**: 171 chars
- **Duration**: 3.4s
- **Timed out**: No
- **Effectors used**: respond
- **Thoughts / Actions**: 0 / 1
- **LLM time**: 2.2s (64.2%)
- **Scratch writes**: 2

### Deterministic Checks
| Check | Status | Detail |
|-------|--------|--------|
| Non-empty response | PASS | Response length: 171 chars |
| Iterations in estimated range | SKIP | 1 iterations (no estimate in scenario) |
| Termination reason | PASS | done |
| Completed within timeout | PASS | Completed in 3.4s |
| Agent exited cleanly | PASS | Exit code: 0 |
| Effector diversity | INFO | Used: respond |
| Thought-to-action ratio | WARN | 0 thoughts, 1 actions — agent never reasoned |
| Evaluation quality distribution | INFO | productive: 1, neutral: 0, counterproductive: 0 |
| Total LLM time | INFO | 2.2s (64.2% of wall-clock) |
| Scratch write count | INFO | 2 writes |
| Response references graph context | INFO | 1/1 entities (100%) |

### Response Preview
```
Acme Dashboard is built with **React** for the UI and **D3.js** for charting/visualizations. It’s **deployed on Vercel**, with **auto-deployments from the `main` branch**.
```
