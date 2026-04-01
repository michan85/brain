# Scenario S08: Sense Then Act

## Metadata
- **Tier**: Simple
- **Focus**: Multi-effector coordination (sense followed by act), working memory continuity (sense findings inform act task), three-effector routing for mixed tasks
- **Estimated iterations**: 3-5

## Setup
Knowledge graph is empty. Scratch space is empty.

A source file is staged at `/tmp/brain-eval-s08/data.json` (see `context/data.json`). Run `setup.ts` before executing the scenario. It copies the source file and ensures no output file exists at `/tmp/brain-eval-s08/summary.txt`.

## User Goal
The user wants the system to read a data file, understand its contents, then produce a transformed output file. This requires both perception (sense the source) and mutation (act to create the output). The system must use information from the sense step to inform the act step.

## User Inputs
### Initial Prompt
"Read /tmp/brain-eval-s08/data.json, then create /tmp/brain-eval-s08/summary.txt listing just the user names and roles, one per line, like 'Alice: admin'."

### Follow-up Responses
N/A -- this scenario should not require clarification.

## Expected Behavior

1. **Sensor processing**: Extracts entities. Generates embedding. Raw input forwarded to PFC.

2. **Graph Activation**: Empty graph returns empty subgraph.

3. **PFC Loop iteration 1 (Think or Sense)**: The PFC recognizes this is a two-phase task: first understand the data, then transform it. It either:
   - (a) Produces a thought planning the two steps, then acts on it next iteration, or
   - (b) Goes directly to sense

4. **PFC Loop iteration N (Sense)**: The PFC calls the `sense` effector to understand the source file:
   ```json
   {"kind": "action", "effectorId": "sense", "payload": {"task": "Read and understand the structure of /tmp/brain-eval-s08/data.json", "source": "/tmp/brain-eval-s08/data.json"}}
   ```
   Sense returns SenseFindings with entities (Alice, Bob, Carol) and their roles. Findings enter working memory.

5. **Evaluator**: Signals `status: "continue"` -- sense was productive, but the task isn't done.

6. **PFC Loop iteration N+1 (Act)**: The PFC now has the source data in working memory. It calls the `act` effector to create the output:
   ```json
   {"kind": "action", "effectorId": "act", "payload": {"task": "Create /tmp/brain-eval-s08/summary.txt with user names and roles formatted as 'Name: role', one per line", "context": "Users: Alice (admin), Bob (viewer), Carol (editor)"}}
   ```
   The act effector writes the file and verifies. Act findings enter working memory.

7. **PFC Loop iteration N+2 (Respond)**: The PFC confirms completion using the `respond` effector.

8. **Evaluator**: Signals `status: "done"`.

**Post-run verification**: `/tmp/brain-eval-s08/summary.txt` should exist and contain:
```
Alice: admin
Bob: viewer
Carol: editor
```
(Exact formatting may vary, but all three entries must be present with correct roles.)

**Key structural expectation**: The PFC correctly sequences sense-then-act. Information flows through working memory -- the act step uses knowledge gained from the sense step. The PFC does not combine sense and act into one call (they are distinct effectors for distinct purposes).

## Grading

### Key Concepts Being Tested
- PFC correctly identifies a mixed task requiring both perception and mutation
- PFC sequences sense before act (perceive before you change)
- Working memory carries information from sense to act (findings persist across iterations)
- The act effector's task/context includes information only available from the sense step
- Both effector types produce structured findings that enter working memory and scratch

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good" looks like here |
|-----------|----------------|---------------------------|
| D1: Goal Decomposition | 0.10 | Implicit or explicit two-phase plan (understand, then create). Score 5 if the PFC shows awareness of the ordering dependency. Score 3 if it works but without clear planning. |
| D2: Retrieval Quality | 0.05 | Empty graph. Score 5 if handled cleanly. |
| D3: Reasoning Efficiency | 0.20 | Score 5 for 3 iterations (sense, act, respond). Score 4 for 4 (thought, sense, act, respond). Score 2 for 5+. Score 1 if sense or act is called redundantly. |
| D4: Prediction Calibration | 0.05 | Not the focus. Score 3 (neutral). |
| D5: Reactivation Precision | 0.05 | No reactivation needed. Score 5 if none fires. |
| D6: Self-Correction | 0.05 | Not meaningfully tested. Score 3 (neutral). |
| D7: Memory Hierarchy Usage | 0.20 | Critical test: sense findings must be in working memory when the act step executes. The act payload or context should reference the data learned from sense. Both sense and act findings written to scratch. |
| D8: Output Quality | 0.30 | Two sub-components: (a) Response confirms what was done (0.10). (b) Ground truth: /tmp/brain-eval-s08/summary.txt exists with all three user entries and correct roles (0.20). Partial credit if file exists but is incomplete. |

### Passing Threshold
Composite score >= 3.5

### Red Flags
- The PFC calls `act` before `sense` (writes output without reading input)
- The PFC calls `act` with hardcoded/hallucinated user data instead of using sense findings from working memory
- The PFC attempts to do everything in one sense or one act call (conflating perception with mutation)
- The PFC calls readFile or writeFile directly (not PFC-level effectors)
- The output file is missing users or has wrong roles
- Working memory does not contain sense findings when the act step executes
- The system calls sense on the output file after writing it (unnecessary verification -- act should handle its own verification)
