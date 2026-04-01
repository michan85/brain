# Brain Agent Evaluation Framework

## Purpose

This framework evaluates the brain agent through scenario-based testing. An **evaluator agent** simulates a user, drives the brain agent through each scenario, logs the full trajectory (every loop state, thought, action, evaluation, reactivation), and grades the result against multi-dimensional rubrics.

The output feeds back into the system: graded trajectories become input for the next iteration of improvement. This is a recursive self-improvement loop.

## How It Works

```
Scenario (text)
    |
    v
Evaluator Agent (simulates user)
    |
    v
Brain Agent (runs the architecture)
    |
    v
Trajectory Log (every LoopState, PFCOutput, EvaluationResult, reactivation event)
    |
    v
Grader (scores trajectory against rubric)
    |
    v
Feedback Report (per-dimension scores + narrative diagnosis)
    |
    v
Next Iteration (feedback informs system improvements)
```

### Step 1: Select Scenario

Each scenario file in `scenarios/` defines:
- **Scenario ID & tier** (simple / intermediate / complex / adversarial / longitudinal)
- **Setup** — initial knowledge graph state, any pre-seeded data
- **User goal** — what the simulated user is trying to accomplish
- **User inputs** — the initial prompt and any follow-up messages the evaluator agent should send
- **Expected behaviors** — what the system should do (not exact outputs, but structural expectations about reasoning, retrieval, tool use, etc.)
- **Grading criteria** — scenario-specific weights or thresholds applied to the grading dimensions

### Step 2: Run

The evaluator agent:
1. Bootstraps the brain agent with the scenario's setup state
2. Sends the initial prompt
3. Responds to any clarification requests using the scenario's user profile
4. Logs the full trajectory: every `LoopState` snapshot, `PFCOutput`, `EvaluationResult`, `PredictionError`, reactivation event, effector call, and scratch space write
5. Continues until the brain agent terminates or a timeout is reached

### Step 3: Grade

The grader scores the trajectory across all dimensions defined in `grading.md`. Each dimension produces a 1-5 score with a narrative justification. Scenario-specific criteria can override default weights.

### Step 4: Feedback

The grading report is structured as:
- **Scores** — per-dimension numeric scores
- **Composite score** — weighted aggregate
- **Diagnosis** — what went well, what went wrong, specific iterations where quality dropped
- **Recommendations** — concrete changes that would improve the score

This report becomes input for the next development iteration.

## Scenario Tiers

| Tier | Description | Count |
|------|-------------|-------|
| Simple | Single goal, minimal graph, direct reasoning | 5 |
| Intermediate | Sub-goals, reactivation, moderate graph | 5 |
| Complex | Multi-perspective, deep graph, prediction errors | 5 |
| Adversarial | Edge cases, failure modes, stress tests | 5 |
| Longitudinal | Multi-session, measures learning over time | 5 |

## Files

- `grading.md` — The multi-dimensional grading rubric
- `scenarios/` — Individual scenario definitions
- `scenarios/index.md` — Scenario index with tier, focus area, and status
