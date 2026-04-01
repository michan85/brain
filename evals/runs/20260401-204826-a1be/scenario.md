# Scenario S07: Act Effector Basic

## Metadata
- **Tier**: Simple
- **Focus**: Act effector (PFC correctly delegates mutation), working memory (act findings enter working memory), three-effector routing, verification
- **Estimated iterations**: 2-4

## Setup
Knowledge graph is empty. Scratch space is empty. The filesystem has a writable temp directory. No pre-existing file at the target path.

Target path: `/tmp/brain-eval-s07/hello.txt`

Ensure the directory exists but the file does not:
```bash
mkdir -p /tmp/brain-eval-s07
rm -f /tmp/brain-eval-s07/hello.txt
```

## User Goal
The user wants the system to create a file with specific contents. This is a mutation task — it changes the world.

## User Inputs
### Initial Prompt
"Create a file at /tmp/brain-eval-s07/hello.txt with three lines: the current date, the word 'operational', and the number 42."

### Follow-up Responses
N/A — this scenario should not require clarification.

## Expected Behavior

1. **Sensor processing**: Extracts entities related to the file path and task. Generates embedding. Raw input forwarded to PFC.

2. **Graph Activation**: Empty graph returns empty subgraph. No error.

3. **PFC Loop iteration 1 (Act)**: The PFC recognizes this is a mutation task — the user wants something created. It produces an Action targeting the `act` effector:
   ```json
   {"kind": "action", "effectorId": "act", "payload": {"task": "Create a file at /tmp/brain-eval-s07/hello.txt with three lines: the current date, the word 'operational', and the number 42"}}
   ```
   The act effector internally uses writeFile (and possibly bash for the date) to create the file, then verifies it exists and returns structured ActFindings with summary, changes list, and verified status.

4. **Working memory**: The act findings are formatted via `formatActForWorkingMemory()` and pushed into working memory. The PFC can see what was accomplished.

5. **Scratch space**: `writeActToScratch()` records the action result.

6. **Evaluator**: Signals `status: "continue"` — act was productive but the user hasn't received confirmation yet.

7. **PFC Loop iteration 2 (Respond)**: The PFC composes a confirmation using the act findings from working memory. It uses the `respond` effector.

8. **Evaluator**: Signals `status: "done"`.

**Post-run verification**: The file at `/tmp/brain-eval-s07/hello.txt` should exist and contain three lines as specified.

**Key structural expectation**: The PFC uses `act` for mutation, not `sense`. The PFC does NOT attempt to use writeFile or bash directly — those are internal tools. Act findings (including whether verification passed) enter working memory.

## Grading

### Key Concepts Being Tested
- PFC routes mutation tasks to the `act` effector (not sense, not raw tools)
- Act effector internally writes the file and returns structured ActFindings
- ActFindings include verification (the act effector checked its own work)
- ActFindings are formatted and pushed to working memory
- ActFindings are written to scratch space
- The file was actually created with correct contents (ground truth check)

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good" looks like here |
|-----------|----------------|---------------------------|
| D1: Goal Decomposition | 0.05 | Single goal: "create the file." Minimal decomposition. |
| D2: Retrieval Quality | 0.05 | Empty graph. Score 5 if handled cleanly. |
| D3: Reasoning Efficiency | 0.20 | Score 5 for 2 iterations (act, respond). Score 4 for 3 (thought, act, respond). Score 2 for 4+. |
| D4: Prediction Calibration | 0.05 | Not the focus. Score 3 (neutral). |
| D5: Reactivation Precision | 0.05 | No reactivation needed. Score 5 if none fires. |
| D6: Self-Correction | 0.05 | Not meaningfully tested. Score 3 (neutral). |
| D7: Memory Hierarchy Usage | 0.20 | Act findings appear in working memory. Result written to scratch. |
| D8: Output Quality | 0.35 | Two sub-components: (a) The response confirms what was created (0.15). (b) Ground truth: the file actually exists with correct contents (0.20). If the file doesn't exist or has wrong contents, this dimension cannot score above 2 regardless of what the response says. |

### Passing Threshold
Composite score >= 3.5

### Red Flags
- The PFC uses `sense` instead of `act` for a mutation task
- The PFC attempts to call writeFile or bash directly (not PFC-level effectors)
- The act effector writes the file but doesn't verify (ActFindings.verified is false without good reason)
- The PFC responds "done" but the file doesn't actually exist (hallucinated completion)
- The file exists but contents don't match the specification
- The system errors because the graph is empty
