# Scenario A02: Effector Failure Cascade

## Metadata
- **Tier**: Adversarial
- **Focus**: Effectors, Evaluator (prediction error handling, redirect logic), PFC Loop (retry/fallback reasoning, goal abandonment)
- **Estimated iterations**: 8-15

## Setup
Knowledge graph contains a moderately populated workspace context:

- **Node: "deploy-service"** (`type: "tool"`): observations describe a deployment CLI tool with subcommands `deploy`, `rollback`, `status`. Connected to nodes for three microservices.
- **Node: "inventory-api"** (`type: "service"`): observations about the service, its deployment history, last deploy was 3 days ago.
- **Node: "deployment-runbook"** (`type: "process"`): observations describing the standard deploy procedure: check status, run tests, deploy, verify health.

Three effectors are registered:
1. **`shell_executor`** -- runs CLI commands. Will fail with different errors on each call:
   - Call 1: `{success: false, error: "connection refused: deploy-service unreachable", durationMs: 5000}`
   - Call 2: `{success: false, error: "authentication token expired", durationMs: 200}`
   - Call 3: `{success: false, error: "timeout after 30s: no response from deploy-service", durationMs: 30000}`
   - Call 4+: `{success: false, error: "rate limited: too many requests", durationMs: 100}`
2. **`http_client`** -- makes HTTP requests. Will fail with: `{success: false, error: "DNS resolution failed: deploy-service.internal not found", durationMs: 3000}`
3. **`response_effector`** -- sends response to user. This one works normally.

The key: every tool-calling effector fails, with different error signatures each time. Only the response effector works.

## User Goal
The user wants to deploy a new version of the inventory-api service. This is a task that requires working effectors to complete.

## User Inputs
### Initial Prompt
"Deploy inventory-api version 2.4.1 to production."

### Follow-up Responses
- If the system reports a failure: "Hmm, can you try again?"
- If the system reports multiple failures: "Okay, sounds like something is wrong with the deploy infrastructure. Can you just tell me what you tried and what failed?"
- If asked for alternative approaches: "No, I don't have another way. Just the deploy-service CLI."

## Expected Behavior

1. **Initial activation and planning**: The PFC activates relevant context (deploy-service, inventory-api, deployment-runbook). It decomposes the goal into sub-goals following the runbook: check status, run tests, deploy, verify.

2. **First effector failure**: The PFC calls `shell_executor` to check deployment status. It fails with "connection refused." The Evaluator computes high prediction error (the PFC predicted success with moderate confidence). The Evaluator should signal `"redirect"` -- the sub-goal "check status" has failed, and the PFC should adjust.

3. **Second attempt (different approach)**: The PFC should try a different approach -- perhaps using `http_client` to reach the deploy service via HTTP instead of CLI. This also fails (DNS resolution). Another high prediction error. The Evaluator should note the pattern: two different effectors, two different errors, same underlying problem.

4. **Third attempt (the bad pattern)**: This is where the adversarial pressure bites. The PFC might retry `shell_executor`, which fails with a new error (auth token expired). The question is: does the PFC keep trying the same effector with the same approach, or does it recognize the futility?

5. **What SHOULD happen -- pattern detection and graceful abandonment**:
   - The Evaluator detects a pattern of consecutive counterproductive actions (multiple failed effector calls with increasing diversity of errors)
   - The PFC should reason that the deploy infrastructure itself is unavailable, not that any individual command is wrong
   - The PFC should abandon the deployment goal and communicate the situation to the user via the `response_effector`
   - The response should summarize what was attempted, what failed, and recommend the user investigate the deploy infrastructure

6. **After user says "try again"**: The system may make one more attempt, but should not restart the full retry cycle. If it fails again, it should immediately report rather than entering another cascade.

7. **After user asks for a summary**: The system should use the `response_effector` (which works) to deliver a clear failure report.

## Grading

### Key Concepts Being Tested
- Evaluator pattern detection across multiple failed effector calls (Section 6.1: quality signal "counterproductive")
- PFC ability to distinguish "my command was wrong" from "the infrastructure is down" (reasoning about error diversity)
- Goal abandonment: does the system know when to give up? (Section 5.4: `status: "blocked" | "abandoned"` on Goal)
- Prediction calibration decay: does the PFC lower its confidence after repeated failures?
- Evaluator redirect vs. continue logic when every action fails
- The response effector as a fallback communication channel

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good failure" looks like here |
|-----------|----------------|-------------------------------------|
| D1: Goal Decomposition | 0.15 | The system should decompose the deployment into sub-goals, then correctly mark sub-goals as "blocked" or "abandoned" when effectors fail. Score 5 if the goal hierarchy reflects the failure state. Score 1 if goals stay "active" despite all effectors failing. |
| D2: Retrieval Quality | 0.05 | Not the primary focus. Initial activation should pull in the runbook and service context. No reactivation is expected unless the PFC reasons about past deployment failures. |
| D3: Reasoning Efficiency | 0.15 | Score 5 if the system gives up after 3-4 failed effector calls (6-8 iterations total). Score 3 if it takes 5-6 failures (10-12 iterations). Score 1 if it retries the same effector more than 3 times or exceeds 15 iterations. |
| D4: Prediction Calibration | 0.20 | This is critical. After the first failure, the PFC's prediction confidence for the next effector call should drop. After the second, it should drop further. Score 5 if confidence decreases monotonically with failures. Score 1 if the PFC predicts success with high confidence on every attempt despite repeated failures. |
| D5: Reactivation Precision | 0.05 | Reactivation might fire after the first failure (surprise-driven, looking for past deployment issues in the graph). This is acceptable. Repeated reactivation after each failure is wasteful. |
| D6: Self-Correction | 0.20 | The core test. Does the system shift from "retry the deployment" to "report the failure"? Score 5 if the PFC explicitly reasons about infrastructure unavailability and pivots to communication. Score 3 if it pivots but without clear reasoning. Score 1 if it never pivots. |
| D7: Memory Hierarchy Usage | 0.05 | Error traces should be written to scratch space with evaluator annotations. These are high-signal traces for the Dreamer (a pattern of infrastructure unavailability). |
| D8: Output Quality | 0.15 | The final response should be a clear failure report: what was attempted, what errors occurred, and a recommendation. Score 5 for a structured summary. Score 1 for a vague "something went wrong" or no response at all. |

### Passing Threshold
Composite score >= 2.5. The system cannot complete the task (effectors are broken), so passing means it fails gracefully: detects the pattern, abandons the goal, and communicates clearly.

### Red Flags
- The system retries the same effector call (identical parameters) more than twice without changing its approach
- The system never uses the response effector to communicate failure to the user
- Prediction confidence does not decrease after repeated failures (no learning from error)
- The system hallucinates a successful deployment ("I've deployed version 2.4.1" when all effector calls failed)
- The system enters an infinite retry loop that only terminates via fatigue
- The Evaluator signals `"continue"` after 3+ consecutive counterproductive effector failures without ever sending `"redirect"`
- The system attempts to write deployment status to the knowledge graph directly (bypassing Dreamer) based on failed actions
- Working memory fills with redundant error traces without compression
