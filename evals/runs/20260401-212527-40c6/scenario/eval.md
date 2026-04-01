# Scenario S03: Simple Tool Use

## Metadata
- **Tier**: Simple
- **Focus**: Effectors (prediction + action + result), Evaluator (prediction error computation), PFC Loop (action path through the recurrent cycle)
- **Estimated iterations**: 2-3

## Setup
The knowledge graph contains context about a project and its CI pipeline.

### Staged Context

A CI status file is staged at `/tmp/brain-eval-s03/ci-status.json` (see `context/ci-status.json`). Run `setup.ts` before executing the scenario.

Scratch space is empty.

## User Goal
The user wants to know whether the latest CI build for the Atlas API is passing. This requires the agent to investigate a file on disk containing CI status information.

## User Inputs
### Initial Prompt
"Is the CI build passing for Atlas API?"

### Follow-up Responses
N/A -- this scenario should not require clarification.

## Expected Behavior

1. **Sensor processing**: Extracts entities: `{name: "Atlas API", type: "project"}`, `{name: "CI build", type: "concept"}`. Generates embedding. Raw input forwarded to PFC.

2. **Graph Activation**: Seed search finds the Atlas API node via observation embedding similarity. Spread activation (1 hop) brings in the GitHub Actions node via the `uses_ci` edge. The activated subgraph contains both nodes, the connecting edge, and relevant observations (particularly the repository path and CI platform observations). Activation metadata: low dispersion (tight cluster), no coverage gaps.

3. **PFC Loop iteration 1 (Plan/Sense)**: The PFC receives raw input + activated subgraph. It initializes a top-level goal: "Determine if Atlas API CI build is passing." The PFC recognizes from the activated context that Atlas API uses GitHub Actions and the repo is at `/projects/atlas-api`. It decides it needs to investigate the CI status. It produces an Action targeting the `sense` effector to investigate the project directory for CI status:
   ```json
   {"kind": "action", "effectorId": "sense", "payload": {"task": "Check the CI build status for the Atlas API project", "source": "/projects/atlas-api"}}
   ```
   The `sense` effector internally reads the `ci-status.json` file, discovers the build status, and returns structured SenseFindings with entities and observations about the CI state.

   Critically, the PFC also produces a `Prediction`:
   - `expectedResult`: something like "CI status information found" or "Build status is available"
   - `confidence`: moderate (0.5-0.7) -- the system has no recent data about whether the build is actually passing or failing

4. **Evaluator**: Computes prediction error. If the PFC predicted the sense would find CI status, deviation should be low. The evaluator signals `status: "continue"` -- sense was productive but the user hasn't received a response yet.

5. **PFC Loop iteration 2 (Respond)**: The PFC composes a response using the sense findings from working memory. It uses the `respond` effector to deliver the answer, incorporating the CI status, last run time, and branch information.

6. **Evaluator**: Signals `status: "done"`, `quality: "productive"`. The loop quenches.

**Key structural expectation**: The full prediction -> action -> evaluation cycle executes cleanly. The PFC uses the `sense` effector (not raw `readFile` or `bash`) to investigate the CI status. The PFC generates a prediction before calling the effector. The Evaluator computes prediction error by comparing the prediction against the actual result.

## Grading

### Key Concepts Being Tested
- Effector action with prediction (efference copy) -- Section 7: "Before every effector action, the PFC Loop produces a Prediction"
- Prediction error computation -- Section 6.2: deviation between predicted and actual
- PFC routes perception tasks to `sense` effector (not raw tools)
- Spread activation across one edge (Atlas API -> GitHub Actions)
- Goal stack with a single actionable goal
- Evaluator writing ConsolidationSignal to scratch space

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good" looks like here |
|-----------|----------------|---------------------------|
| D1: Goal Decomposition | 0.10 | Single goal or one sub-goal ("check CI status"). No elaborate decomposition needed. |
| D2: Retrieval Quality | 0.15 | Both nodes activated. The repository path observation surfaces (needed to know where to look). The `uses_ci` edge relationship informs what kind of CI to look for. |
| D3: Reasoning Efficiency | 0.10 | 2-3 iterations: sense, respond (possibly with a planning thought). Score 5 for 2 iterations. Score 3 for 3. Score 1 for 4+. |
| D4: Prediction Calibration | 0.25 | The PFC produces a Prediction before the sense call. The confidence level is reasonable (not 0.95 for something it hasn't checked, not 0.1 for a routine check). The prediction content describes the expected outcome in enough detail for meaningful comparison. |
| D5: Reactivation Precision | 0.05 | No reactivation needed (low surprise result). Score 5 if no reactivation fires. |
| D6: Self-Correction | 0.05 | Not meaningfully tested (no prediction error in the happy path). Score 3 (neutral). |
| D7: Memory Hierarchy Usage | 0.10 | Sense findings enter working memory. ConsolidationSignal written to scratch space with quality and surprise annotations. No direct KG writes. |
| D8: Output Quality | 0.20 | The response clearly states whether CI is passing, includes the last run time, and references the main branch. Concise and actionable. |

### Passing Threshold
Composite score >= 3.5

### Red Flags
- The PFC calls the effector without generating a Prediction (missing efference copy)
- The Prediction is trivially empty (e.g., `expectedResult: ""` or `confidence: 0`)
- The system does not route the effector result through the Evaluator
- The Evaluator does not compute or report prediction error
- The system attempts to answer the CI status question from graph context alone without calling an effector (the graph has no current CI status data)
- The PFC uses `readFile` or `bash` directly instead of routing through the `sense` effector
- The PFC uses `act` instead of `sense` for a read-only perception task
