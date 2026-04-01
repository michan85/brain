## Eval Report

### Scenario
- **ID**: S06_sense_effector_basic
- **Session**: 20260401-204753-3614

### Summary
- **Total iterations**: 4
- **Termination reason**: done
- **Response length**: 72 chars
- **Duration**: 28.9s
- **Timed out**: No
- **Effectors used**: sense, respond
- **Thoughts / Actions**: 0 / 4
- **LLM time**: 13.5s (46.5%)
- **Scratch writes**: 11

### Deterministic Checks
| Check | Status | Detail |
|-------|--------|--------|
| Non-empty response | PASS | Response length: 72 chars |
| Iterations in estimated range | SKIP | 4 iterations (no estimate in scenario) |
| Termination reason | PASS | done |
| Completed within timeout | PASS | Completed in 28.9s |
| Agent exited cleanly | PASS | Exit code: 0 |
| Effector diversity | INFO | Used: sense, respond |
| Thought-to-action ratio | WARN | 0 thoughts, 4 actions — agent never reasoned |
| Evaluation quality distribution | INFO | productive: 4, neutral: 0, counterproductive: 0 |
| Total LLM time | INFO | 13.5s (46.5% of wall-clock) |
| Scratch write count | INFO | 11 writes |

### Response Preview
```
/tmp/brain-eval-s06/config.json contains:\n\n```json\n{\"key\": \"value\
```
