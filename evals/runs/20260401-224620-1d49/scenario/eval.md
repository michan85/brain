# Scenario L05: Emergent Skill Formation

## Metadata
- **Tier**: Longitudinal
- **Focus**: Dreamer (Phase 2 pattern abstraction), Graph Activation (pattern node activation and utilization), PFC Loop (skill-guided reasoning), Evaluator (prediction calibration against skill expectations)
- **Sessions**: 6
- **Estimated iterations per session**: Session 1: 7-9, Session 2: 6-8, Session 3: 5-7, Session 4: 4-6, Session 5: 4-5, Session 6: 3-5
- **Estimated iterations**: 7-9

## User Inputs
### Initial Prompt
"The checkout service is experiencing high latency -- p99 is at 2 seconds, normal is 200ms. Can you investigate?"

### Follow-up Responses
- If asked about CloudWatch metrics: "CPU is at 85% on 3 of 4 instances. The fourth instance looks normal at 30%."
- If asked about recent deployments: "A new version was deployed 2 hours ago with a change to the cart calculation logic."
- If asked about the unhealthy instances: "The 3 high-CPU instances are running the new version. The 4th is still on the old version -- it didn't get the rolling update yet."
- If asked about the code change: "The new cart calculation has an N+1 query issue -- it's hitting the database once per item instead of batching."
- If asked about rollback: "We can rollback via the deployment pipeline. It takes about 5 minutes."

### Expected Behavior
- The PFC should follow a general investigation path: understand the symptom, check metrics, identify the trigger, find root cause, recommend action.
- This is the first incident investigation. The PFC has no prior experience to draw on.
- Scratch space should capture the full investigation trajectory.
- Expected iterations: 7-9 (complex investigation with multiple information-gathering steps).

## Setup
The knowledge graph is bootstrapped with a production environment domain:

- **Node**: `production_environment` (type: `"environment"`) -- observations: `"Production runs on AWS us-east-1"`, `"Multi-AZ deployment across 3 availability zones"`, `"All services behind ALB"`
- **Node**: `cloudwatch` (type: `"tool"`) -- observations: `"CloudWatch collects metrics and logs from all production services"`, `"Alarms configured for CPU, memory, error rate, and latency"`
- **Node**: `runbook_repository` (type: `"knowledge_base"`) -- observations: `"Runbooks stored in Confluence under /ops/runbooks"`, `"Each service has a runbook with troubleshooting steps"`
- **Node**: `slack` (type: `"tool"`) -- observations: `"Incident channels created as #inc-NNNN"`, `"Bot posts CloudWatch alarm details to incident channels"`
- **Node**: `jira` (type: `"tool"`) -- observations: `"Post-incident action items tracked in Jira project OPS"`, `"Incidents linked to affected services"`
- **Edges**: `production_environment --monitored_by--> cloudwatch`, `production_environment --documented_in--> runbook_repository`

No pattern nodes or skill-like structures exist. The scenario tests whether an "incident investigation skill" emerges naturally from repeated experience.

## Session Sequence

### Session 1
**User Goal**: Investigate a latency spike in the checkout service.
**Initial Prompt**: "The checkout service is experiencing high latency -- p99 is at 2 seconds, normal is 200ms. Can you investigate?"
**Follow-up Responses**:
- If asked about CloudWatch metrics: "CPU is at 85% on 3 of 4 instances. The fourth instance looks normal at 30%."
- If asked about recent deployments: "A new version was deployed 2 hours ago with a change to the cart calculation logic."
- If asked about the unhealthy instances: "The 3 high-CPU instances are running the new version. The 4th is still on the old version -- it didn't get the rolling update yet."
- If asked about the code change: "The new cart calculation has an N+1 query issue -- it's hitting the database once per item instead of batching."
- If asked about rollback: "We can rollback via the deployment pipeline. It takes about 5 minutes."
**Expected Outcome**:
- The PFC should follow a general investigation path: understand the symptom, check metrics, identify the trigger, find root cause, recommend action.
- This is the first incident investigation. The PFC has no prior experience to draw on.
- The investigation should follow a somewhat exploratory path. The PFC may go down wrong paths before converging.
- Scratch space should capture the full investigation trajectory: hypotheses, metric checks, the discovery of the deployment correlation, root cause identification.
- Expected iterations: 7-9 (this is a complex investigation with multiple information-gathering steps).

### Session 2
**User Goal**: Investigate an error rate spike in the search service.
**Initial Prompt**: "Search service error rate jumped to 15%. Users are seeing 500 errors on search results pages. Please investigate."
**Follow-up Responses**:
- If asked about CloudWatch metrics: "Memory usage is at 95% on all instances. GC pause times are through the roof."
- If asked about recent deployments: "No deployments in the last 24 hours."
- If asked about traffic patterns: "Traffic is normal. No unusual spike."
- If asked about memory leak: "The search index cache has been growing unbounded since the last deployment 3 days ago. It's a memory leak in the caching layer."
- If asked about mitigation: "Restarting the instances clears the cache and restores normal memory usage. Long-term fix needs a cache eviction policy."
**Expected Outcome**:
- The Dreamer has consolidated Session 1's investigation. The PFC should have some prior knowledge about the investigation workflow (check metrics first, look for deployment correlation).
- The PFC should start with metrics sooner (CloudWatch was useful last time).
- The investigation path is different (memory leak, not CPU/deployment), but the meta-pattern is the same: symptom -> metrics -> trigger -> root cause -> action.
- Expected iterations: 6-8 (slightly more efficient than Session 1).

### Session 3
**User Goal**: Investigate a connectivity failure in the payment processing service.
**Initial Prompt**: "Payment processing is failing for about 30% of transactions. Customers are getting 'payment failed' errors. Investigate."
**Follow-up Responses**:
- If asked about CloudWatch metrics: "All metrics look normal -- CPU, memory, error rate on the service itself are fine."
- If asked about downstream dependencies: "The payment gateway is returning timeout errors for 30% of requests."
- If asked about the payment gateway: "The payment gateway vendor reported a partial outage in their us-east-1 region 45 minutes ago."
- If asked about failover: "We have a secondary payment gateway configured but it's not active. It needs manual failover."
- If asked about mitigation: "Switch to the secondary gateway. It typically takes 10 minutes for DNS propagation."
**Expected Outcome**:
- With two prior investigations consolidated, the PFC should have a clearer investigation workflow. It should check metrics first (learned from Sessions 1-2), and when metrics are clean, it should investigate dependencies (a step that was implicit before but should now be emerging as part of the pattern).
- The Dreamer may be forming a proto-pattern at this point.
- Expected iterations: 5-7.

### Session 4
**User Goal**: Investigate high CPU on the recommendation engine.
**Initial Prompt**: "The recommendation engine is using 100% CPU across all instances. Response times are degrading. What's happening?"
**Follow-up Responses**:
- If asked about CloudWatch: "CPU spiked to 100% exactly 90 minutes ago across all instances simultaneously."
- If asked about deployments: "A model update was pushed 90 minutes ago. The new recommendation model is 3x larger."
- If asked about the model: "The new model requires GPU inference but was deployed to CPU instances. It's falling back to CPU inference which is extremely slow."
- If asked about mitigation: "Roll back the model to the previous version while GPU instances are provisioned."
**Expected Outcome**:
- **By Session 4, a pattern node should exist.** The Dreamer has processed three structurally similar investigations (symptom -> metrics -> trigger -> root cause -> action) and should have abstracted the common workflow.
- The pattern node should activate alongside the `recommendation_engine` context. The PFC should follow the pattern: immediately check CloudWatch, look for deployment/change correlation, identify root cause, recommend action.
- The investigation should be noticeably more efficient. The PFC should not explore irrelevant hypotheses.
- Prediction confidence should be higher for each investigation step (the system knows this workflow).
- Expected iterations: 4-6 (the pattern provides a roadmap).

### Session 5
**User Goal**: Investigate intermittent failures in the notification service.
**Initial Prompt**: "The notification service is dropping about 10% of push notifications. Email notifications are fine. Can you look into it?"
**Follow-up Responses**:
- If asked about CloudWatch: "All resource metrics are healthy. But the push notification error metric shows 'device token expired' errors spiking."
- If asked about the push notification provider: "APNs (Apple Push Notification service) recently deprecated the legacy binary protocol. We're still using it."
- If asked about the timeline: "APNs sent deprecation notices 3 months ago. Enforcement started last week."
- If asked about the fix: "Migrate to the HTTP/2 APNs API. The notification service library needs an upgrade."
**Expected Outcome**:
- The pattern node should activate immediately. The PFC should execute the investigation workflow efficiently: metrics -> identify anomaly -> trace to root cause -> recommend action.
- The pattern is now well-established (4 instances). The PFC should spend minimal iterations on investigation planning and more on actual investigation steps.
- Prediction confidence should be high for the general investigation steps. The specific findings will still have prediction error (each incident is unique), but the investigation structure should be low-surprise.
- Expected iterations: 4-5.

### Session 6
**User Goal**: A more complex incident that requires the investigation skill PLUS additional reasoning.
**Initial Prompt**: "Multiple services are experiencing intermittent failures. The checkout service, search service, and notification service are all seeing elevated error rates. Is this a coordinated issue or separate problems?"
**Follow-up Responses**:
- If asked about CloudWatch: "All three services show elevated error rates starting at the same time -- 14:32 UTC."
- If asked about shared dependencies: "All three depend on the API gateway (ALB) for inbound traffic."
- If asked about the ALB: "ALB health checks show 2 of 3 availability zones are healthy. AZ us-east-1c is reporting unhealthy targets."
- If asked about the AZ: "AWS posted a service event for us-east-1c -- network connectivity issues affecting EC2 instances in that AZ."
- If asked about mitigation: "Traffic is already being drained from us-east-1c by the ALB automatically. The remaining 2 AZs can handle the load. Error rate should stabilize once health checks mark 1c targets as unhealthy."
**Expected Outcome**:
- **The hardest test.** This incident is more complex than previous ones -- it involves multiple services and a shared infrastructure root cause.
- The investigation skill (pattern node) should activate and guide the initial approach. But the PFC must also reason beyond the pattern: recognizing that simultaneous failures across services suggest a shared cause, not three independent issues.
- The PFC should leverage accumulated knowledge from ALL prior sessions: CloudWatch for metrics (Sessions 1-5), deployment checks (Sessions 1, 2, 4), dependency tracing (Session 3), and the shared infrastructure context (all sessions).
- The investigation pattern provides the structure; accumulated domain knowledge provides the content. Both are needed.
- Expected iterations: 3-5 (the pattern node guides the workflow, accumulated knowledge fills in the specifics, the simultaneous-failure signal quickly narrows to shared infrastructure).

## Dreamer Expectations

### After Session 1
- **Promote**: Investigation traces including the workflow steps: symptom identification, CloudWatch metric check, deployment correlation, root cause (N+1 query), resolution (rollback).
- **Strengthen**: `production_environment --monitored_by--> cloudwatch` edge strengthened.
- **Promote**: New observations on `cloudwatch`: "CloudWatch CPU metrics useful for identifying resource-bound issues."

### After Session 2
- **Consolidate**: The investigation workflow observations from Sessions 1 and 2 should be partially consolidated. Both follow: symptom -> metrics -> trigger identification -> root cause -> resolution.
- **Promote**: Memory-leak-specific observations as new knowledge.
- **Detect similarity**: The Dreamer should notice the structural similarity between the two investigation traces but may not yet create a pattern node (two instances is borderline).

### After Session 3
- **Pattern abstraction (Phase 2)**: Three instances of the investigation workflow. The Dreamer should create a pattern node:
  - **Name**: Something like `"production-incident-investigation-workflow"` or `"service-degradation-investigation"`
  - **Type**: `"pattern"`
  - **Observations**:
    - `"Step 1: Check CloudWatch metrics for the affected service (CPU, memory, error rate, latency)"`
    - `"Step 2: Check for recent deployments or configuration changes as potential triggers"`
    - `"Step 3: If metrics are clean, investigate upstream/downstream dependencies"`
    - `"Step 4: Identify root cause by correlating timing of symptom onset with changes or external events"`
    - `"Step 5: Determine immediate mitigation (rollback, restart, failover) and long-term fix"`
  - **Edges**: `instance_of` edges connecting to investigation traces from Sessions 1-3.
  - **Confidence**: 0.65-0.75 (three clear instances).

### After Session 4
- **Strengthen pattern**: Fourth instance confirms the workflow. Pattern confidence should increase to 0.8+.
- **Add new observation to pattern**: "When a resource spike correlates exactly with a deployment/change, the deployment is the likely trigger" (this observation is confirmed across Sessions 1, 2, and 4).
- **Add instance edge**: Session 4 trace connected to pattern via `instance_of`.

### After Session 5
- **Strengthen pattern further**: Fifth instance. Confidence should be 0.85+. This pattern is now a stable "skill" in the graph.
- **Refine pattern observation**: "When service metrics are clean but errors persist, investigate external dependencies or upstream providers" (confirmed in Sessions 3 and 5).

### After Session 6
- **Strengthen pattern**: Sixth instance, the most complex one.
- **Potentially create a sub-pattern or observation**: "When multiple services fail simultaneously, look for shared infrastructure (ALB, AZ, network) as root cause before investigating individual services."
- The pattern node should now be one of the highest-confidence, most-connected nodes in the graph for the incident investigation domain.

## Grading

### Key Concepts Being Tested
- **Emergent skill formation**: Does a pattern node emerge that encodes the incident investigation workflow without being explicitly programmed?
- **Skill utilization**: Once the skill exists, does it measurably improve investigation efficiency (fewer iterations, better predictions)?
- **Skill refinement**: Does the skill get refined over sessions as new instances add detail to the pattern?
- **Skill + knowledge synergy**: In Session 6, does the skill (investigation structure) combine with accumulated domain knowledge (specific technologies, dependencies) to handle a novel-but-related challenge?

### Scenario-Specific Grading Criteria

| Dimension | Weight | What "good" looks like here |
|-----------|--------|---------------------------|
| D1: Goal Decomposition | 0.10 | Early sessions: goals are exploratory ("investigate", "check X", "check Y"). Later sessions: goals are structured by the pattern ("check metrics", "identify trigger", "determine root cause"). The pattern should shape goal decomposition. |
| D2: Retrieval Quality | 0.15 | From Session 4 onward, the pattern node must activate alongside the service-specific nodes. The activated subgraph should include both the investigation workflow (from the pattern) and the service-specific context. |
| D3: Reasoning Efficiency | 0.15 | **Monotonic improvement is expected.** Session 6 should use fewer iterations than Session 1 despite being more complex, because the skill reduces investigation overhead. |
| D4: Prediction Calibration | 0.10 | Early sessions: low confidence on investigation steps (novel task). Later sessions: high confidence on workflow steps (the pattern predicts what will be useful), lower confidence on specific findings (each incident is unique). |
| D5: Reactivation Precision | 0.05 | Reactivation should fire when a new entity is discovered (e.g., "payment gateway vendor" in Session 3) but should not fire for expected investigation steps. |
| D6: Self-Correction | 0.10 | Early sessions may have wrong hypotheses that require correction. Later sessions should have fewer wrong hypotheses because the pattern guides investigation. |
| D7: Memory Hierarchy Usage | 0.05 | Standard expectations. |
| D8: Output Quality | 0.10 | Each investigation should correctly identify the root cause and recommend appropriate action. Session 6 should produce a comprehensive multi-service analysis. |
| **L1: Iteration Efficiency Trend** | 0.20 | **Primary metric.** Plot iterations per session. Score 5: clear downward trend with Session 5/6 at 50-60% of Session 1's count despite similar or greater complexity. Score 3: some decrease but non-monotonic or less than 30% reduction. Score 1: no decrease. |
| **L2: Prediction Error Trend** | 0.10 | Average deviation on investigation-step predictions (not finding-specific predictions) should decrease. Score 5: step-level prediction deviation in Session 5 is less than 0.2. Score 3: some decrease. Score 1: flat or increasing. |
| **L4: Pattern Emergence** | 0.25 | **Co-primary metric.** Score 5: (a) pattern node created by Session 3 or 4, (b) contains observations that accurately encode the investigation workflow, (c) activates on all subsequent investigation queries, (d) measurably improves performance. Score 3: pattern exists but is incomplete or doesn't activate reliably. Score 1: no pattern emerges. |
| **L5: Consolidation Quality** | 0.10 | The pattern node should be refined over time (new observations added, confidence increased) without growing noisy. Score 5: pattern observations are specific and accurate, no contradictory or irrelevant observations added. Score 1: pattern is polluted with incident-specific details that don't generalize. |

Note: Longitudinal metric weights are applied in addition to (not instead of) the standard dimension weights. The composite is renormalized.

### Passing Threshold
- **Minimum composite**: 3.5/5.0 (Strong)
- **Hard requirements**:
  - A pattern node of type `"pattern"` encoding the investigation workflow must exist by Session 4.
  - Session 5 iteration count must be strictly less than Session 1 iteration count.
  - Session 6's output must correctly identify the shared infrastructure root cause (AZ failure).
  - The pattern node must have at least 4 `instance_of` edges by the end of Session 6.

### Red Flags
- **No pattern emergence**: If after 5+ structurally similar investigations the Dreamer has not created a pattern node, Phase 2 abstraction is fundamentally broken. This is the most critical failure.
- **Over-specific pattern**: A pattern that encodes "check CPU metrics, then check deployments" rather than the more general "check metrics, then check for changes" will fail to activate on investigations where CPU is not the issue (Sessions 3, 5). The pattern must be abstracted to the right level of generality.
- **Over-general pattern**: A pattern that says "investigate the problem" without the specific steps (metrics, changes, dependencies, root cause, mitigation) provides no actionable guidance. It's a tautology, not a skill.
- **Pattern node not activated**: If the pattern exists but graph activation does not retrieve it when a new investigation starts, there is an embedding or activation problem. The pattern's embeddings must be semantically close to investigation-related queries.
- **No iteration improvement despite pattern**: If the pattern activates but the PFC does not use it (same iteration count, same exploratory investigation style), the PFC is not incorporating activated pattern context into its reasoning.
- **Session 6 failure**: If the system cannot handle the multi-service investigation in Session 6, the skill is too rigid. A good skill guides investigation structure but does not prevent the PFC from reasoning about novel aspects (shared infrastructure root cause).
- **Incident-specific observations polluting the pattern**: If the pattern node acquires observations like "N+1 queries cause high CPU" or "memory leaks cause OOM," these are instance-level facts, not workflow-level patterns. They belong on the individual incident nodes, not on the pattern.
