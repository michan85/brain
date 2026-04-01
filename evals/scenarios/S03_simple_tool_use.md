# Scenario S03: Simple Tool Use

## Metadata
- **Tier**: Simple
- **Focus**: Effectors (prediction + action + result), Evaluator (prediction error computation), PFC Loop (action path through the recurrent cycle)
- **Estimated iterations**: 2-3

## Setup
The knowledge graph contains context about a project and its CI pipeline:

```
Node: {
  id: "node_atlas_api",
  name: "Atlas API",
  type: "project",
  observations: [
    { content: "Backend API service for the Atlas platform", confidence: 0.9 },
    { content: "Uses GitHub Actions for CI/CD pipeline", confidence: 0.85 },
    { content: "Repository is at github.com/acme-corp/atlas-api", confidence: 0.9 },
    { content: "Main branch deploys automatically to staging", confidence: 0.8 }
  ]
}

Node: {
  id: "node_github_actions",
  name: "GitHub Actions",
  type: "tool",
  observations: [
    { content: "CI/CD platform used by the team for automated builds and deployments", confidence: 0.9 }
  ]
}

Edge: {
  sourceNodeId: "node_atlas_api",
  targetNodeId: "node_github_actions",
  relation: "uses_ci",
  weight: 0.8
}
```

Scratch space is empty. The system has access to a `github_ci` effector that can check the status of CI runs for a given repository.

## User Goal
The user wants to know whether the latest CI build for the Atlas API is passing. This requires making one effector call to check the CI status.

## User Inputs
### Initial Prompt
"Is the CI build passing for Atlas API?"

### Follow-up Responses
N/A -- this scenario should not require clarification.

## Expected Behavior

1. **Sensor processing**: Extracts entities: `{name: "Atlas API", type: "project"}`, `{name: "CI build", type: "concept"}`. Generates embedding. Raw input forwarded to PFC.

2. **Graph Activation**: Seed search finds `node_atlas_api` via observation embedding similarity. Spread activation (1 hop) brings in `node_github_actions` via the `uses_ci` edge. The activated subgraph contains both nodes, the connecting edge, and relevant observations (particularly the repository URL and CI platform observations). Activation metadata: low dispersion (tight cluster), no coverage gaps.

3. **PFC Loop iteration 1 (Plan)**: The PFC receives raw input + activated subgraph. It initializes a top-level goal: "Determine if Atlas API CI build is passing." The PFC recognizes from the activated context that Atlas API uses GitHub Actions and the repo is `github.com/acme-corp/atlas-api`. It decides it needs to call an effector to check current CI status. It may produce a planning Thought or go directly to the Action.

4. **PFC Loop iteration 2 (Act)**: The PFC produces an Action targeting the `github_ci` effector with the repository identifier. Critically, it also produces a `Prediction`:
   - `expectedResult`: something like "CI is passing" or "Build status is green"
   - `confidence`: moderate (0.5-0.7) -- the system has no recent data about whether the build is actually passing or failing

   The effector executes and returns a result. For this scenario, the mock effector returns:
   ```
   { success: true, data: { status: "passing", lastRun: "2026-03-31T18:42:00Z", branch: "main" } }
   ```

5. **Evaluator**: Computes prediction error. If the PFC predicted "passing" with moderate confidence, deviation should be low (prediction matched). The evaluator signals `status: "continue"` or `status: "done"` (depending on whether the PFC needs one more iteration to compose the response), `quality: "productive"`, `surprise: "none"` or `"low"`.

6. **PFC Loop iteration 3 (Respond)**: If not already done, the PFC composes a response incorporating the effector result and responds to the user. The Evaluator quenches the loop.

**Key structural expectation**: The full prediction -> action -> evaluation cycle executes cleanly. The PFC generates a prediction before calling the effector. The Evaluator computes prediction error by comparing the prediction against the actual result. The deviation and surprise level are appropriate given the prediction's confidence and the actual outcome.

## Grading

### Key Concepts Being Tested
- Effector action with prediction (efference copy) -- Section 7: "Before every effector action, the PFC Loop produces a Prediction"
- Prediction error computation -- Section 6.2: deviation between predicted and actual
- Action path through the PFC recurrent cycle -- Section 5.4: "Action + Prediction -> Effector executes -> result + prediction error return -> Evaluator judges"
- Spread activation across one edge (Atlas API -> GitHub Actions)
- Goal stack with a single actionable goal
- Evaluator writing ConsolidationSignal to scratch space

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good" looks like here |
|-----------|----------------|---------------------------|
| D1: Goal Decomposition | 0.10 | Single goal or one sub-goal ("check CI status"). No elaborate decomposition needed. |
| D2: Retrieval Quality | 0.15 | Both nodes activated. The repository URL observation surfaces (needed to call the effector). The `uses_ci` edge relationship informs which effector to call. |
| D3: Reasoning Efficiency | 0.10 | 2-3 iterations: plan (optional), act, respond. Score 5 for 2 iterations. Score 3 for 3. Score 1 for 4+. |
| D4: Prediction Calibration | 0.25 | The PFC produces a Prediction before the effector call. The confidence level is reasonable (not 0.95 for something it hasn't checked, not 0.1 for a routine CI check). The prediction content describes the expected outcome in enough detail for meaningful comparison. |
| D5: Reactivation Precision | 0.05 | No reactivation needed (low surprise result). Score 5 if no reactivation fires. |
| D6: Self-Correction | 0.05 | Not meaningfully tested (no prediction error in the happy path). Score 3 (neutral). |
| D7: Memory Hierarchy Usage | 0.10 | ConsolidationSignal written to scratch space with quality and surprise annotations. No direct KG writes. |
| D8: Output Quality | 0.20 | The response clearly states whether CI is passing, includes the last run time, and references the main branch. Concise and actionable. |

### Passing Threshold
Composite score >= 3.5

### Red Flags
- The PFC calls the effector without generating a Prediction (missing efference copy)
- The Prediction is trivially empty (e.g., `expectedResult: ""` or `confidence: 0`)
- The system does not route the effector result through the Evaluator
- The Evaluator does not compute or report prediction error
- The system attempts to answer the CI status question from graph context alone without calling the effector (the graph has no current CI status data)
- The system calls the wrong effector or passes incorrect parameters (e.g., wrong repository)
