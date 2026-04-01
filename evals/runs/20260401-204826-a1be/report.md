## Eval Report

### Scenario
- **ID**: S07_act_effector_basic
- **Session**: 20260401-204826-a1be

### Summary
- **Total iterations**: 2
- **Termination reason**: done
- **Response length**: 96 chars
- **Duration**: 14.9s
- **Timed out**: No
- **Effectors used**: act, respond
- **Thoughts / Actions**: 0 / 2
- **LLM time**: 5.5s (36.8%)
- **Scratch writes**: 5

### Deterministic Checks
| Check | Status | Detail |
|-------|--------|--------|
| Non-empty response | PASS | Response length: 96 chars |
| Iterations in estimated range | SKIP | 2 iterations (no estimate in scenario) |
| Termination reason | PASS | done |
| Completed within timeout | PASS | Completed in 14.9s |
| Agent exited cleanly | PASS | Exit code: 0 |
| Effector diversity | INFO | Used: act, respond |
| Thought-to-action ratio | WARN | 0 thoughts, 2 actions — agent never reasoned |
| Evaluation quality distribution | INFO | productive: 2, neutral: 0, counterproductive: 0 |
| Total LLM time | INFO | 5.5s (36.8% of wall-clock) |
| Scratch write count | INFO | 5 writes |

### Response Preview
```
Created /tmp/brain-eval-s07/hello.txt with three lines:
1) the current date
2) operational
3) 42
```
