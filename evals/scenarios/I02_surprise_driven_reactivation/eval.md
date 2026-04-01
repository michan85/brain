# Scenario I02: Surprise-Driven Reactivation

## Metadata
- **Tier**: Intermediate
- **Focus**: Prediction error, evaluator surprise signal, reactivation policy (surprise-driven), self-correction
- **Estimated iterations**: 4-5

## Setup

Seed the knowledge graph with the following nodes and edges:

**Nodes:**

1. `node:auth-service` (type: `"service"`)
   - Observation: "AuthService handles all authentication for the customer-facing platform. Runs on Kubernetes namespace 'auth-prod'."
   - Observation: "AuthService uses Redis for session storage. Redis cluster: redis-auth-prod-01."
   - Observation: "AuthService current version: v3.2.1, deployed 2026-02-15. Stable, no known issues." (confidence: 0.85)
   - Observation: "AuthService health status can be checked by reading the file /tmp/brain-eval-i02/healthz.json."

2. `node:redis-auth-cluster` (type: `"infrastructure"`)
   - Observation: "redis-auth-prod-01 is a 3-node Redis Sentinel cluster. Last failover: 2025-11-03."
   - Observation: "Redis auth cluster memory utilization typically runs at 40-55%."

3. `node:k8s-auth-namespace` (type: `"infrastructure"`)
   - Observation: "Kubernetes namespace 'auth-prod' hosts AuthService and its sidecar proxies."
   - Observation: "auth-prod namespace has a PodDisruptionBudget requiring minAvailable: 2."

4. `node:auth-migration-rfc` (type: `"document"`)
   - Observation: "RFC-2024-041 proposes migrating AuthService from custom token validation to OpenID Connect via Keycloak. Status: approved, target Q1 2026."
   - Observation: "The migration involves replacing the /auth/token endpoint and adding Keycloak as an upstream dependency."

**Edges:**

- `auth-service --[depends_on]--> redis-auth-cluster` (weight: 0.9)
- `auth-service --[deployed_in]--> k8s-auth-namespace` (weight: 0.9)
- `auth-service --[subject_of]--> auth-migration-rfc` (weight: 0.7)

**Context files (staged by setup.ts):**

- `/tmp/brain-eval-i02/healthz.json` — health check response showing v4.0.0-rc1 with Keycloak dependency (contradicts graph's v3.2.1)

**Scratch Space:** Empty (new session).

## User Goal

Check the current status of AuthService. The key test: the graph says AuthService is v3.2.1 and stable, but the effector (health check) will return that it has been upgraded to v4.0.0-rc1 (the Keycloak migration happened). This contradiction should trigger high surprise, reactivation pulling in the migration RFC context, and a self-corrected response.

## User Inputs

### Initial Prompt
"Can you check on AuthService for me? I want to make sure it's healthy."

### Follow-up Responses

- If asked "Should I check just the health endpoint or also look at infrastructure?": "Just the health endpoint is fine for now."
- If asked "Are you aware of any recent changes to AuthService?": "Not sure, that's why I'm asking you to check."
- If asked "The version has changed significantly -- should I investigate further?": "Yes, please tell me what you find."

## Expected Behavior

**Iteration 1 (Plan):**
- Sensor extracts entities: `auth-service`, `healthy`, `status`.
- Graph activation seeds on `auth-service`, spreads to `redis-auth-cluster`, `k8s-auth-namespace`, `auth-migration-rfc`.
- PFC initializes goal: "Check AuthService health status."
- PFC notes from activated context: AuthService is v3.2.1, stable, health can be checked at /tmp/brain-eval-i02/healthz.json.
- PFC pushes sub-goal: "Read AuthService health status from /tmp/brain-eval-i02/healthz.json."
- Evaluator: CONTINUE.

**Iteration 2 (Act -- the surprise):**
- PFC generates Action to call the health-check effector.
- Prediction: "Healthz returns status: healthy, version: v3.2.1, uptime in the tens of thousands of seconds. Confidence: 0.80." (Based on graph observation that v3.2.1 is current and stable.)
- Effector calls `readFile({ path: "/tmp/brain-eval-i02/healthz.json" })`.
- Returns: `{ status: "healthy", version: "v4.0.0-rc1", uptime_seconds: 3847, dependencies: { keycloak: "connected", redis: "connected" } }`.
- **Evaluator computes prediction error:**
  - Predicted version v3.2.1, actual v4.0.0-rc1: major version jump.
  - Predicted no Keycloak dependency, actual shows Keycloak connected.
  - Deviation: 0.75. Surprise: "high". Valence: "neutral" (service is healthy, but different from expected).
- **Evaluator produces reactivationQuery:** "AuthService v4.0.0 Keycloak migration"
- Evaluator signal written to scratch space with tag `"contradiction"`.
- Evaluator: CONTINUE + reactivate.

**Iteration 3 (Reactivation + self-correction):**
- PFC loop feeds reactivationQuery "AuthService v4.0.0 Keycloak migration" into Graph Activation.
- Graph activation re-queries, now pulling in `auth-migration-rfc` with higher activation (the query matches the RFC's observations about Keycloak migration).
- PFC receives expanded context including RFC-2024-041 details.
- PFC produces Thought: "The health check shows v4.0.0-rc1 with Keycloak connected. This aligns with RFC-2024-041 which proposed migrating to OpenID Connect via Keycloak, targeted for Q1 2026. The migration appears to have been executed. The graph's stored version (v3.2.1) is now outdated."
- Sub-goal "check health" marked completed, popped.
- PFC notes the version observation in the graph is stale -- writes observation to scratch space for future Dreamer consolidation.

**Iteration 4 (Respond):**
- PFC generates response incorporating both the health check result and the migration context.
- Prediction: "User wants to know AuthService is healthy and will appreciate context about the version change. Confidence: 0.85."
- Response: "AuthService is healthy. However, it's now running v4.0.0-rc1 instead of the previously recorded v3.2.1. It appears the Keycloak migration (RFC-2024-041) has been deployed -- the service now shows Keycloak as a connected dependency alongside Redis. Uptime is about 1 hour, consistent with a recent deployment."
- Evaluator: DONE.

**Critical structural requirement:** The system must NOT simply report the health check result and ignore the contradiction with its stored knowledge. The prediction error must trigger reactivation, which must pull in the migration RFC, and the final response must reflect the corrected understanding.

## Grading

### Key Concepts Being Tested
- Prediction generation that reflects stored graph state (predicting v3.2.1)
- Prediction error computation when reality contradicts the graph
- Evaluator surprise signal triggering reactivation (not just logging)
- Reactivation pulling in contextually relevant nodes (the migration RFC)
- Self-correction: updating the reasoning trajectory based on new context
- Scratch space receiving contradiction signals for future Dreamer processing

### Scenario-Specific Grading Criteria

**D4: Prediction Calibration (weight: 0.20, override from 0.15)**
- Score 5: Prediction explicitly states expected version (v3.2.1) and expected health shape based on graph observations. Confidence is moderate-to-high (graph says stable, so reasonable to expect).
- Score 3: Prediction mentions health check but is vague about expected version or omits it.
- Score 1: No prediction generated, or prediction doesn't reference any graph knowledge.

**D5: Reactivation Precision (weight: 0.20, override from 0.10)**
- Score 5: Exactly one reactivation fires, driven by the high surprise signal. The reactivationQuery targets the version change / Keycloak migration. The reactivated context includes the migration RFC.
- Score 3: Reactivation fires but with a poor query (e.g., just "AuthService" again), pulling in the same context as before.
- Score 1: No reactivation fires despite the major version contradiction.

**D6: Self-Correction (weight: 0.25, override from 0.15)**
- Score 5: PFC explicitly acknowledges the contradiction between stored version and actual version. Reasoning trajectory pivots to incorporate migration context. Final response explains the discrepancy.
- Score 3: PFC notices the version difference but doesn't connect it to the migration RFC or explain it.
- Score 1: PFC ignores the version change entirely and reports "AuthService is healthy, running v3.2.1."

**D1: Goal Decomposition (weight: 0.05, override from 0.15)**
- Score 5: Clear goal hierarchy. Sub-goal for health check, properly popped after completion.
- Score 3: Goals exist but are loosely structured.
- Score 1: No goal hierarchy.

**D2: Retrieval Quality (weight: 0.10, override from 0.15)**
- Score 5: Initial activation includes auth-service and its neighbors. Post-reactivation activation includes migration RFC with high relevance.
- Score 3: Initial activation is good but reactivation misses the RFC.
- Score 1: Poor initial activation.

**D3: Reasoning Efficiency (weight: 0.05, override from 0.10)**
- Score 5: 4-5 iterations total. Each iteration is productive — no wasted cycles.
- Score 3: 6-7 iterations with some redundancy.
- Score 1: Excessive iterations or circular reasoning.

**D7: Memory Hierarchy Usage (weight: 0.05, override from 0.10)**
- Score 5: Contradiction signal and stale-version observation written to scratch space. No direct KG writes.
- Score 3: Some signals written but incomplete.
- Score 1: Direct KG write or no scratch writes.

**D8: Output Quality (weight: 0.10)**
- Score 5: Response confirms health, explains version change, references migration context, notes recency of deployment.
- Score 3: Reports health and version but lacks migration context.
- Score 1: Reports wrong version or ignores the change.

### Passing Threshold
Composite score >= 3.5

### Red Flags
- System reports AuthService is running v3.2.1 despite the health check returning v4.0.0-rc1 (D6 drops to 1, D8 drops to 1)
- No prediction error is computed (D4 drops to 1)
- Reactivation never fires despite deviation >= 0.7 (D5 drops to 1)
- System asks the user what the version should be instead of consulting the graph and reasoning about the discrepancy (D6 drops to 1)
