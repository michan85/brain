# Scenario L03: Knowledge Accumulation

## Metadata
- **Tier**: Longitudinal
- **Focus**: Graph Activation (contextDensity and coverageGap trends), Dreamer (Phase 1 promotion), PFC Loop (leveraging richer context), Knowledge Graph (organic growth)
- **Sessions**: 5
- **Estimated iterations per session**: Session 1: 5-6, Session 2: 4-5, Session 3: 3-4, Session 4: 3-4, Session 5: 3
- **Estimated iterations**: 5-6

## User Inputs
### Initial Prompt
"What technology stack does the platform team use?"

### Follow-up Responses
- "The main languages are Go for backend services and TypeScript for internal tooling."
- "We use Kubernetes for orchestration, Terraform for infrastructure-as-code, and ArgoCD for GitOps deployments."
- "Observability is handled by Datadog for metrics, Grafana for dashboards, and PagerDuty for alerting."
- "The API gateway is built on Envoy proxy with custom Go filters."

### Expected Behavior
- Graph activation returns the sparse `platform_team` and `api_gateway` nodes. Activation metadata should show low `contextDensity` and `coverageGaps` for terms like "technology", "stack", "languages".
- The PFC recognizes insufficient graph knowledge and asks clarification questions.
- The user's responses provide substantial new information.
- Scratch space should be rich with traces containing technology details.
- The PFC synthesizes a comprehensive answer from the user-provided information.
- Expected iterations: 5-6.

## Setup
The knowledge graph starts with a minimal domain -- a single team and its basic structure. The scenario measures how the graph grows organically through interaction and whether richer context translates to better reasoning.

- **Node**: `platform_team` (type: `"team"`) -- observations: `"Platform team is responsible for shared infrastructure services"`, `"Team has 6 engineers"`
- **Node**: `api_gateway` (type: `"service"`) -- observations: `"API gateway routes all external traffic to internal services"`
- **Edge**: `platform_team --owns--> api_gateway`

This is deliberately sparse. Session 1 will have significant coverage gaps. By Session 5, the graph should be much richer, and those gaps should be filled.

## Session Sequence

### Session 1
**User Goal**: Learn about the platform team's tech stack.
**Initial Prompt**: "What technology stack does the platform team use?"
**Follow-up Responses**:
- "The main languages are Go for backend services and TypeScript for internal tooling."
- "We use Kubernetes for orchestration, Terraform for infrastructure-as-code, and ArgoCD for GitOps deployments."
- "Observability is handled by Datadog for metrics, Grafana for dashboards, and PagerDuty for alerting."
- "The API gateway is built on Envoy proxy with custom Go filters."

**Expected Outcome**:
- Graph activation returns the sparse `platform_team` and `api_gateway` nodes. Activation metadata should show low `contextDensity` and `coverageGaps` for terms like "technology", "stack", "languages".
- The PFC recognizes insufficient graph knowledge and asks clarification questions.
- The user's responses provide substantial new information.
- Scratch space should be rich with traces containing technology details.
- The PFC synthesizes a comprehensive answer from the user-provided information.
- Expected iterations: 5-6 (initial reasoning on sparse context, 2-3 clarification rounds, synthesis).

### Session 2
**User Goal**: Understand the platform team's deployment process.
**Initial Prompt**: "How does the platform team deploy services to production?"
**Follow-up Responses**:
- "We follow a GitOps workflow. Engineers push to main, ArgoCD detects the change and syncs the Kubernetes manifests."
- "There's a staging environment that mirrors production. All changes go through staging first with a 1-hour bake time."
- "Rollbacks are automatic via ArgoCD if health checks fail within 5 minutes of deployment."
- "The API gateway has a special canary deployment process -- 5% traffic shift, then 25%, then 100% over 30 minutes."

**Expected Outcome**:
- Between sessions, the Dreamer has consolidated Session 1's traces. The graph should now have nodes for Go, TypeScript, Kubernetes, Terraform, ArgoCD, Datadog, Grafana, PagerDuty, Envoy, with appropriate edges.
- Graph activation for "deployment" should pull in ArgoCD, Kubernetes, and the API gateway -- all of which were added after Session 1.
- `contextDensity` should be measurably higher than Session 1. `coverageGaps` should be smaller (deployment-related terms may still have gaps, but technology terms should not).
- The PFC should have richer context to reason from. It may still need clarification (specific deployment details), but the clarification should be more targeted -- not "what tools do you use?" but "what is the deployment cadence?" or "how do rollbacks work?"
- Expected iterations: 4-5 (fewer broad clarification questions needed because the base context is richer).

### Session 3
**User Goal**: Understand how the platform team handles incidents.
**Initial Prompt**: "Walk me through the platform team's incident response process."
**Follow-up Responses**:
- "PagerDuty pages the on-call engineer. There's a primary and secondary rotation."
- "The on-call engineer opens a Slack channel #incident-NNNN and posts an initial assessment within 15 minutes."
- "For SEV1 incidents, we assemble a war room. The API gateway has automatic circuit breakers that trip if error rates exceed 5%."
- "Post-incident, we do a blameless retro within 48 hours. Action items get tracked in Linear."

**Expected Outcome**:
- The graph now has technology stack AND deployment process knowledge. Activation for "incident response" should pull in PagerDuty (already in the graph from Session 1), API gateway, Kubernetes -- the system has enough context to understand the infrastructure where incidents occur.
- `contextDensity` should be significantly higher than Session 1. The coverage gap for "incident" may still exist, but related concepts (alerting, services, infrastructure) should activate.
- The PFC should be able to reason about the incident context more intelligently -- e.g., it knows the team uses PagerDuty, so it might ask specifically about escalation policies rather than asking a generic "how do you get alerted?"
- Clarification questions should be more sophisticated and targeted.
- Expected iterations: 3-4.

### Session 4
**User Goal**: Plan a capacity upgrade for the API gateway.
**Initial Prompt**: "We're expecting a 3x traffic increase next quarter. What would a capacity plan for the API gateway look like?"
**Follow-up Responses**:
- "Current API gateway handles 10,000 RPS at p99 of 50ms. We need to handle 30,000 RPS."
- "Envoy scales horizontally via Kubernetes HPA. We'd need to increase the node pool and adjust resource limits."
- "The canary deployment process would need to be adapted for the scaled configuration."
- "Budget approval is needed for the additional compute -- about $2,000/month increase."

**Expected Outcome**:
- This is the first session that requires synthesizing knowledge from MULTIPLE prior sessions. The PFC needs: API gateway details (Session 1), Kubernetes/Envoy (Session 1), deployment process including canary (Session 2), and potentially incident response considerations (Session 3 -- what happens if the capacity plan goes wrong?).
- Graph activation should pull in a rich, multi-cluster subgraph. `contextDensity` should be high. `dispersion` may be elevated (touching technology, deployment, and infrastructure clusters). `coverageGaps` should be minimal.
- The PFC should produce a more comprehensive plan because it has richer context. It should mention HPA, canary deployment for the upgrade rollout, monitoring via Datadog, and alerting via PagerDuty -- all information from prior sessions that it didn't need the user to re-state.
- Expected iterations: 3-4 (fewer clarification rounds because the base knowledge is rich).

### Session 5
**User Goal**: Diagnose a hypothetical scenario that requires cross-session knowledge.
**Initial Prompt**: "Hypothetical: after the capacity upgrade, the API gateway starts dropping 1% of requests during the canary phase. What would you investigate?"
**Follow-up Responses**:
- If asked about specifics: "Assume the error is intermittent -- some pods are healthy, some are returning 502s."
- If asked about logs: "The unhealthy pods show Envoy failing to connect to upstream services."

**Expected Outcome**:
- This question can be answered almost entirely from accumulated graph knowledge. The system knows: API gateway runs Envoy (Session 1), canary deployment process (Session 2), circuit breakers trip at 5% error rate (Session 3), and the capacity plan details (Session 4).
- `contextDensity` should be at its peak. `coverageGaps` should be near zero for this domain.
- The PFC should produce a thorough diagnostic plan referencing specific technologies and processes without needing to ask the user for basic context. It should mention: checking Envoy config, HPA scaling behavior, upstream service health, circuit breaker thresholds, and potentially the rollback process.
- Expected iterations: 3 (rich context means less need for clarification, the PFC can reason deeply from what it already knows).

## Dreamer Expectations

### After Session 1
- **Promote (many)**: Each technology mentioned should become a node in the graph:
  - `go_lang` (type: `"technology"`) with observations about backend usage
  - `typescript` (type: `"technology"`) with observations about tooling usage
  - `kubernetes` (type: `"technology"`) with observations about orchestration
  - `terraform` (type: `"technology"`) with IaC observation
  - `argocd` (type: `"tool"`) with GitOps observation
  - `datadog` (type: `"tool"`) with metrics observation
  - `grafana` (type: `"tool"`) with dashboards observation
  - `pagerduty` (type: `"tool"`) with alerting observation
  - `envoy` (type: `"technology"`) with API gateway proxy observation
- **Edges**: `platform_team --uses--> {each technology}`, `api_gateway --built_with--> envoy`, etc.
- **Strengthen**: The `platform_team --owns--> api_gateway` edge should strengthen.

### After Session 2
- **Promote**: Deployment-related nodes:
  - `staging_environment` (type: `"environment"`) with bake-time observation
  - Observations on existing nodes: ArgoCD gets "syncs Kubernetes manifests from Git", Kubernetes gets "runs staging and production environments"
  - API gateway gets canary deployment observations
- **Consolidate**: If Session 1 already created ArgoCD/Kubernetes nodes, Session 2's deployment details should be added as new observations on those existing nodes, not as duplicate nodes.
- **Edges**: `argocd --deploys_to--> kubernetes`, `api_gateway --has_process--> canary_deployment`

### After Session 3
- **Promote**: Incident response observations:
  - Existing PagerDuty node gets on-call rotation details
  - `linear` (type: `"tool"`) for action item tracking
  - API gateway gets circuit breaker observation
  - New observations about blameless retro process
- **Consolidate**: PagerDuty already exists from Session 1 (alerting). The incident response details should be added as new observations on the same node, enriching it.

### After Session 4
- **Promote**: Capacity planning observations on existing nodes. API gateway gets RPS metrics and scaling details.
- **Edges**: Connections between capacity concerns and monitoring (Datadog), deployment (canary), and infrastructure (Kubernetes HPA).
- **Strengthen**: Cross-cutting edges that connect technology, deployment, and monitoring clusters should strengthen as they are repeatedly co-activated.

### After Session 5
- **Minimal new promotion**: Session 5 is primarily a retrieval-and-reasoning session. The main Dreamer work is strengthening edges that were co-activated during the diagnostic reasoning.
- **Strengthen**: The connections between API gateway, Envoy, canary deployment, circuit breakers, and monitoring should all strengthen -- they were simultaneously relevant in the diagnostic.

## Grading

### Key Concepts Being Tested
- **Organic graph growth**: Does the knowledge graph grow meaningfully with each session, without graph pollution?
- **Context density improvement**: Does `contextDensity` measurably increase across sessions for the same domain?
- **Coverage gap reduction**: Do `coverageGaps` shrink as the graph grows?
- **Cross-session synthesis**: Can the PFC leverage accumulated knowledge from multiple prior sessions to answer questions it couldn't have answered with any single session's knowledge?
- **Targeted clarification**: As context gets richer, does the system ask better (more specific, more targeted) clarification questions?

### Scenario-Specific Grading Criteria

| Dimension | Weight | What "good" looks like here |
|-----------|--------|---------------------------|
| D1: Goal Decomposition | 0.10 | Goal granularity should improve as context gets richer. Session 1 has broad "learn about tech stack" goals. Session 5 has targeted "diagnose this specific scenario" goals. |
| D2: Retrieval Quality | 0.20 | **Key dimension.** The activated subgraph should grow richer and more relevant each session. Session 4 and 5 should activate nodes from multiple prior sessions. No critical nodes missed in sessions 4-5. |
| D3: Reasoning Efficiency | 0.10 | Iteration count should generally decrease (less need for clarification as context grows). |
| D4: Prediction Calibration | 0.10 | Predictions about what the user will say should improve as the system knows more about the domain. |
| D5: Reactivation Precision | 0.10 | Reactivation should fire when the user's clarification responses introduce new entities not in the current activation. Should NOT fire when responses align with already-activated context. |
| D6: Self-Correction | 0.05 | Not the primary focus. |
| D7: Memory Hierarchy Usage | 0.10 | Traces must be complete for every session. The Dreamer must be the only writer to the KG. |
| D8: Output Quality | 0.15 | **Sessions 4-5 are key.** The quality of the capacity plan (Session 4) and diagnostic analysis (Session 5) should be measurably better because of accumulated knowledge. The system should reference specific technologies and processes from prior sessions without the user restating them. |
| **L3: Coverage Gap Trend** | 0.25 | **Primary longitudinal metric.** Measure `coverageGaps.length` per session for queries within the platform team domain. Score 5: monotonically decreasing, near zero by Session 4. Score 3: general decrease but some regressions. Score 1: gaps don't shrink or grow. |
| **L5: Consolidation Quality** | 0.15 | Of nodes promoted by the Dreamer, how many are actually activated in future sessions? Score 5: >80% of promoted nodes activate at least once in sessions 2-5. Score 3: 50-80%. Score 1: <50% (promoting noise that never gets used). |

Additional metric -- **Context Density Trend**: Measure `contextDensity` per session for domain-relevant queries. This is tracked as part of L3 scoring. Score 5 requires both decreasing coverage gaps AND increasing context density.

Note: Longitudinal metric weights are applied in addition to (not instead of) the standard dimension weights. The composite is renormalized.

### Passing Threshold
- **Minimum composite**: 3.5/5.0 (Strong)
- **Hard requirements**:
  - The knowledge graph must contain at least 10 more nodes after Session 5 than at setup.
  - `contextDensity` in Session 5 must be at least 3x Session 1's `contextDensity`.
  - Session 5's output must reference specific information from at least 3 prior sessions without the user restating it.
  - `coverageGaps` for domain-relevant queries must be smaller in Session 5 than in Session 1.

### Red Flags
- **Graph pollution**: Nodes that are never activated after creation. If the Dreamer promotes 15 nodes but only 5 ever activate, 10 are pollution. The Dreamer should be selective, not exhaustive.
- **Duplicate nodes**: If `pagerduty` gets created as separate nodes in Sessions 1 and 3 instead of enriching the same node with new observations, the consolidation logic is broken.
- **No cross-session activation**: If Session 4's activation only pulls in Session 4's user responses and not prior session knowledge, the graph is siloed by session rather than integrated.
- **Stale observations**: If observations from Session 1 never get their `lastActivatedAt` updated despite being relevant to later queries, the recency weighting may be suppressing useful older knowledge.
- **Coverage gaps not shrinking**: If the system keeps asking basic clarification questions in Session 5 that were already answered in Session 1, the consolidated knowledge is not being retrieved.
- **Output quality plateau**: If Session 5's diagnostic analysis is no better than what could be produced from a single session's context, the accumulated knowledge is not being leveraged.
