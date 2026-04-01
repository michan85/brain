# Scenario L02: Error Pattern Learning

## Metadata
- **Tier**: Longitudinal
- **Focus**: Evaluator (prediction error / surprise signals), Dreamer (pattern abstraction from failure traces), Graph Activation (pattern node activation on similar-but-novel failures), PFC Loop (preemptive reasoning from activated patterns)
- **Sessions**: 4
- **Estimated iterations per session**: Session 1: 5-7, Session 2: 4-6, Session 3: 3-4, Session 4: 3-5
- **Estimated iterations**: 5-7

## User Inputs
### Initial Prompt
"The payment service is throwing 503 errors for about 20% of requests. Can you investigate?"

### Follow-up Responses
- If asked about error logs: "The payment service logs show 'connection refused' errors when trying to reach auth_service on port 8443."
- If asked about auth_service status: "Auth service health check is failing intermittently. About 30% of health checks timeout."
- If asked about Redis: "Redis sentinel reports one of three nodes is unreachable. The cluster is operating in degraded mode."
- If asked about recent changes: "There was a kernel upgrade on the Redis host yesterday."

### Expected Behavior
- The PFC should trace the dependency chain: `payment_service` -> `auth_service` -> `redis_cluster`.
- The final answer should identify the causal chain: Redis degradation -> auth_service intermittent failures -> payment_service 503s.
- Expected iterations: 5-7 (investigate payment_service, discover auth_service dependency, reactivate, investigate auth_service, discover Redis issue, reactivate, synthesize).

## Setup
The knowledge graph is bootstrapped with a microservices domain:

- **Node**: `auth_service` (type: `"service"`) -- observations: `"Handles user authentication and token issuance"`, `"Runs on port 8443"`, `"Depends on Redis for session storage"`
- **Node**: `payment_service` (type: `"service"`) -- observations: `"Processes credit card transactions"`, `"Runs on port 9090"`, `"Depends on auth_service for token validation"`, `"Depends on external payment gateway API"`
- **Node**: `notification_service` (type: `"service"`) -- observations: `"Sends email and push notifications"`, `"Runs on port 7070"`, `"Depends on auth_service for user lookup"`, `"Depends on SES for email delivery"`
- **Node**: `order_service` (type: `"service"`) -- observations: `"Manages order lifecycle"`, `"Runs on port 8080"`, `"Depends on payment_service and notification_service"`, `"Depends on auth_service for request authentication"`
- **Node**: `redis_cluster` (type: `"infrastructure"`) -- observations: `"Redis cluster for session and cache storage"`, `"3-node cluster with sentinel"`
- **Edges**: Dependency edges (`"depends_on"`) between services as described. `auth_service --depends_on--> redis_cluster`.

No pattern nodes exist. The system has no prior failure knowledge.

## Session Sequence

### Session 1
**User Goal**: Investigate why the payment service is returning 503 errors.
**Initial Prompt**: "The payment service is throwing 503 errors for about 20% of requests. Can you investigate?"
**Follow-up Responses**:
- If asked about error logs: "The payment service logs show 'connection refused' errors when trying to reach auth_service on port 8443."
- If asked about auth_service status: "Auth service health check is failing intermittently. About 30% of health checks timeout."
- If asked about Redis: "Redis sentinel reports one of three nodes is unreachable. The cluster is operating in degraded mode."
- If asked about recent changes: "There was a kernel upgrade on the Redis host yesterday."

**Expected Outcome**:
- The PFC should trace the dependency chain: `payment_service` -> `auth_service` -> `redis_cluster`.
- Initial predictions about the root cause will likely be wrong or uncertain (low confidence). The PFC might initially suspect the payment service itself or the external payment gateway.
- The Evaluator should produce high-surprise signals when the root cause turns out to be upstream (auth_service, then Redis) rather than the payment service itself.
- Reactivation should fire at least once -- when the auth_service dependency is identified, the PFC should reactivate to pull in `auth_service` context, and again when Redis is identified.
- The final answer should identify the causal chain: Redis degradation -> auth_service intermittent failures -> payment_service 503s.
- Scratch space should contain rich traces: the initial wrong hypothesis, the surprise-driven pivots, the correct causal chain.
- Expected iterations: 5-7 (investigate payment_service, discover auth_service dependency, reactivate, investigate auth_service, discover Redis issue, reactivate, synthesize).

### Session 2
**User Goal**: Investigate why the notification service is failing to send emails.
**Initial Prompt**: "Email notifications aren't going out. The notification service seems to be having issues. Can you look into it?"
**Follow-up Responses**:
- If asked about error logs: "The notification service logs show 'authentication failed' errors when trying to validate sender identity via auth_service."
- If asked about auth_service: "Auth service is responding but returning 401 for service-to-service tokens. The token validation endpoint is working for user tokens."
- If asked about recent changes: "Someone rotated the service-to-service API keys yesterday but the notification service config wasn't updated."
- If asked about SES: "SES is healthy. No issues on the email provider side."

**Expected Outcome**:
- This is a structurally similar failure: a downstream service fails because of an upstream `auth_service` issue. But the specific mechanism is different (misconfigured keys vs. infrastructure degradation).
- The Dreamer should have consolidated Session 1's traces, including the key insight: "service failures can be caused by upstream auth_service issues."
- Graph activation should pull in consolidated knowledge from Session 1. The PFC should consider the auth_service dependency earlier in its investigation than it did in Session 1.
- The PFC should check the auth_service dependency relatively early rather than exhausting notification_service-specific hypotheses first.
- Prediction error should be lower overall because the system has a prior about upstream dependency failures.
- Expected iterations: 4-6 (fewer wasted iterations exploring the wrong hypothesis).

### Session 3
**User Goal**: Investigate why the order service is returning slow response times.
**Initial Prompt**: "Order service response times have spiked to 5+ seconds. Users are complaining. What's going on?"
**Follow-up Responses**:
- If asked about order_service metrics: "CPU and memory are normal. Request queue is backing up though."
- If asked about auth_service: "Auth service is slow -- p99 latency is 3 seconds instead of the usual 50ms."
- If asked what's wrong with auth_service: "Redis is running in single-node mode after a failed failover. Every session lookup is hitting the one remaining node."
- If asked about recent changes: "The Redis sentinel configuration was changed two days ago as part of a scaling exercise, but the failover policy wasn't tested."

**Expected Outcome**:
- This is the third instance of the same failure class: downstream service degrades because of an upstream auth_service issue, which is itself caused by infrastructure problems.
- By now, the Dreamer should have detected the pattern across Sessions 1 and 2. A pattern node should exist -- something like `"auth-service-upstream-dependency-failure"` with observations summarizing the pattern.
- **Critical test**: Does the pattern node activate when "order service" is queried? The pattern is about auth_service being a common root cause for downstream service failures. If the pattern activates, the PFC should check auth_service very early -- possibly as the first investigative action, not the third or fourth.
- The iteration count should be measurably lower. The PFC should think: "I've seen this before -- downstream service issues often trace back to auth_service" and go straight to checking auth_service.
- Prediction confidence for "auth_service is involved" should be moderate-to-high based on the pattern.
- Expected iterations: 3-4 (the pattern node shortcircuits the investigation).

### Session 4
**User Goal**: Investigate a new type of failure -- the payment service is returning incorrect amounts.
**Initial Prompt**: "Payment service is charging customers the wrong amounts. Some transactions have doubled charges. Please investigate."
**Follow-up Responses**:
- If asked about auth_service: "Auth service is completely healthy. No issues."
- If asked about payment_service logs: "The payment service logs show duplicate transaction IDs. It looks like a retry storm -- the service is retrying transactions that already succeeded."
- If asked about the retry logic: "The payment service has a retry-on-timeout policy. The external payment gateway was slow (but not down) yesterday, causing timeouts that triggered retries. But the original requests had actually succeeded."
- If asked about idempotency: "The payment gateway supports idempotency keys, but the payment service isn't sending them."

**Expected Outcome**:
- This is a **different failure class** -- NOT an auth_service upstream dependency issue. This tests whether the pattern node from Sessions 1-3 activates inappropriately and whether the system can recognize when a pattern does not apply.
- The pattern node for auth-service dependency failures may activate (the payment_service node is connected to auth_service). This is acceptable as long as the PFC does not tunnel-vision on auth_service.
- The PFC should check auth_service (the pattern suggests it), get a clean bill of health, and then correctly pivot to investigate payment-service-specific causes.
- The key test: the system should not waste excessive iterations on the auth_service hypothesis. It should check it, dismiss it quickly (1 iteration), and move on.
- The Evaluator should produce a mild negative surprise when auth_service is healthy (the pattern predicted it might be involved, but it isn't).
- Expected iterations: 3-5 (one iteration to check and dismiss auth_service, then focused investigation of the actual cause).

## Dreamer Expectations

### After Session 1
- **Promote**: The full causal chain (`payment_service` 503s caused by `auth_service` failures caused by `redis_cluster` degradation) should be promoted as high-quality, high-surprise observations.
- **Promote**: The general insight "service-to-service dependency failures can cascade" should be promoted.
- **Strengthen**: The `depends_on` edges between `payment_service` -> `auth_service` -> `redis_cluster` should be strengthened.
- **Prune**: Low-value operational traces (e.g., "I will investigate the payment service") should be pruned.

### After Session 2
- **Consolidate**: The observation "downstream service failed because of auth_service issue" from Session 2 should be consolidated with the similar observation from Session 1.
- **Strengthen**: The consolidated observation's confidence should increase.
- **Detect proto-pattern**: Two instances of auth_service causing downstream failures. The Dreamer may not yet create a full pattern node (two instances is borderline), but the observations should be strong enough that they activate on relevant queries.

### After Session 3
- **Pattern abstraction (Phase 2)**: Three instances of the same failure class. The Dreamer should create a pattern node:
  - **Name**: Something like `"auth-service-cascading-failure"` or `"upstream-auth-dependency-failure-pattern"`
  - **Type**: `"pattern"`
  - **Observations**: `"When a downstream service (payment, notification, order) experiences failures, check auth_service first -- it is a common root cause due to its position as a shared dependency"`, `"Auth_service failures are often caused by infrastructure issues (Redis, network) rather than auth_service code bugs"`
  - **Edges**: `instance_of` edges to the three incident observations from Sessions 1-3.
  - **Confidence**: 0.7+ (three clear instances).

### After Session 4
- **Weaken (slightly)**: The pattern node's confidence may decrease slightly -- Session 4 showed a case where the pattern did not apply. But it should not be dramatically weakened; one non-match out of four is within the pattern's expected scope.
- **Promote**: New observations about retry storms and idempotency should be promoted as distinct knowledge, not conflated with the auth_service pattern.
- **No false consolidation**: The Session 4 payment issue should NOT be merged with or connected to the auth_service pattern. These are different failure classes.

## Grading

### Key Concepts Being Tested
- **Failure pattern detection**: Can the Dreamer abstract a recurring failure class from individual incidents?
- **Preemptive pattern activation**: Does the pattern node activate BEFORE the PFC encounters the failure, allowing it to shortcircuit investigation?
- **Pattern discrimination**: When a pattern does not apply (Session 4), does the system recognize this and pivot rather than perseverating?
- **Investigation efficiency improvement**: Does the system investigate faster as it accumulates failure knowledge?

### Scenario-Specific Grading Criteria

| Dimension | Weight | What "good" looks like here |
|-----------|--------|---------------------------|
| D1: Goal Decomposition | 0.10 | Investigation goals should become more targeted over sessions. Session 1 may explore many hypotheses; Session 3 should go to auth_service first. |
| D2: Retrieval Quality | 0.15 | Session 3 must activate the pattern node alongside the service nodes. Session 4 should activate it too (it's relevant context), but the PFC must not over-rely on it. |
| D3: Reasoning Efficiency | 0.10 | Iteration count should decrease for Sessions 2-3 vs Session 1. Session 4 may be slightly higher (novel failure class). |
| D4: Prediction Calibration | 0.15 | In Session 3, the PFC should predict with moderate confidence that auth_service is involved. In Session 4, the PFC should initially predict auth_service involvement but with lower confidence (the pattern applies broadly, not universally). |
| D5: Reactivation Precision | 0.10 | Session 1 should have 2+ justified reactivations (discovering the dependency chain). Session 3 should need 0-1 reactivations (pattern provides the chain upfront). |
| D6: Self-Correction | 0.15 | **Critical for Session 4.** The system must check auth_service (pattern suggests it), discover it's healthy, and pivot. Score 5: pivot happens within 1 iteration of the clean auth_service result. Score 1: continues investigating auth_service for 2+ iterations despite clean results. |
| D7: Memory Hierarchy Usage | 0.05 | Standard expectations. Traces in scratch space, no direct KG writes. |
| D8: Output Quality | 0.10 | Root cause must be correctly identified in each session. Session 4's answer must NOT blame auth_service. |
| **L1: Iteration Efficiency Trend** | 0.15 | Sessions 1-3 should show decreasing iteration count. Session 4 is expected to be slightly higher (new failure class) but should still benefit from general investigation skills. |
| **L2: Prediction Error Trend** | 0.10 | Average deviation should decrease for Sessions 1-3. Session 4's deviation may spike (pattern mismatch) but should recover within the session. |
| **L4: Pattern Emergence** | 0.25 | **Primary longitudinal metric.** Score 5: pattern node created by Session 3, activates in Session 3 before the PFC hits the failure point, and the PFC uses it to shortcircuit investigation. Score 3: pattern exists but does not activate preemptively. Score 1: no pattern node created. |
| **L5: Consolidation Quality** | 0.10 | Session 4 is the acid test: the Dreamer must NOT conflate the retry/idempotency failure with the auth_service dependency pattern. Distinct failure classes must remain distinct in the graph. |

Note: Longitudinal metric weights are applied in addition to (not instead of) the standard dimension weights. The composite is renormalized.

### Passing Threshold
- **Minimum composite**: 3.5/5.0 (Strong)
- **Hard requirements**:
  - A pattern node relating to auth_service cascading failures must exist after Session 3.
  - In Session 3, the PFC must check auth_service within the first 2 iterations (not discovered late in the investigation).
  - In Session 4, the final output must correctly identify the retry/idempotency issue, NOT auth_service.

### Red Flags
- **Pattern not activated in Session 3**: If the system has the pattern in the graph but does not activate it when investigating the order_service issue, there is an embedding or activation threshold problem.
- **Tunnel vision in Session 4**: If the system spends 3+ iterations investigating auth_service in Session 4 despite clean health checks, it is over-relying on the pattern and failing to incorporate new evidence. This indicates the pattern node's confidence is too high or the PFC is not weighing evaluator signals against activated patterns.
- **False pattern generalization**: If the Dreamer creates a pattern like "all service failures are caused by auth_service" (too general) rather than "auth_service is a common root cause for dependency-chain failures" (appropriately scoped), the pattern will produce false positives and degrade future performance.
- **No improvement in Session 2**: If Session 2's investigation is no faster than Session 1 despite the Dreamer having consolidated Session 1's traces, Phase 1 consolidation is not producing useful knowledge.
- **Session 4 failure conflated with auth pattern**: If the Dreamer connects the retry/idempotency failure to the auth_service pattern node via an `instance_of` edge, consolidation discrimination is broken.
