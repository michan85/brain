# Scenario C01: Multi-Perspective API Tradeoff

## Metadata
- **Tier**: Complex
- **Focus**: Graph Activation (multi-perspective formation, dispersion detection), PFC Loop (convergence/divergence reasoning, tradeoff navigation), Evaluator (quality signals on tradeoff reasoning)
- **Estimated iterations**: 5-8

## Setup

### Knowledge Graph State

**Cluster 1: Performance**

- **Node: `api_latency`** (type: `metric`)
  - Observation 1: "P95 latency for /api/v2/orders is 1200ms, exceeding the 500ms SLA target" (confidence: 0.9, source: sensor, createdAt: 2026-03-25)
  - Observation 2: "Latency spike correlates with uncached database joins on the order_items table" (confidence: 0.85, source: pfc_inference, createdAt: 2026-03-26)
- **Node: `caching_layer`** (type: `component`)
  - Observation 1: "Redis cache exists but only covers /api/v2/products with a 60s TTL" (confidence: 0.92, source: sensor, createdAt: 2026-03-20)
  - Observation 2: "Cache hit rate on /products is 94%, but no caching on /orders or /users endpoints" (confidence: 0.88, source: sensor, createdAt: 2026-03-22)
- **Node: `db_query_optimization`** (type: `task`)
  - Observation 1: "Adding a composite index on (order_id, item_id, created_at) reduced order_items join time by 60% in staging" (confidence: 0.8, source: pfc_inference, createdAt: 2026-03-27)

**Edges (Cluster 1):**
- `api_latency` --[caused_by]--> `caching_layer` (weight: 0.7)
- `api_latency` --[caused_by]--> `db_query_optimization` (weight: 0.6)
- `caching_layer` --[mitigates]--> `api_latency` (weight: 0.65)

**Cluster 2: Reliability**

- **Node: `error_handling`** (type: `component`)
  - Observation 1: "API returns raw 500 errors with stack traces in production for unhandled exceptions" (confidence: 0.95, source: sensor, createdAt: 2026-03-28)
  - Observation 2: "No structured error response format — clients receive inconsistent error shapes across endpoints" (confidence: 0.9, source: sensor, createdAt: 2026-03-15)
- **Node: `retry_policy`** (type: `component`)
  - Observation 1: "No retry logic on upstream service calls; a single timeout from payment-service cascades as a user-facing 500" (confidence: 0.88, source: sensor, createdAt: 2026-03-18)
  - Observation 2: "Circuit breaker pattern was proposed in RFC-0042 but never implemented" (confidence: 0.75, source: external, createdAt: 2026-02-10)
- **Node: `uptime_sla`** (type: `metric`)
  - Observation 1: "Current uptime is 99.1%, target is 99.9%; most downtime comes from cascading failures" (confidence: 0.92, source: sensor, createdAt: 2026-03-29)

**Edges (Cluster 2):**
- `error_handling` --[impacts]--> `uptime_sla` (weight: 0.8)
- `retry_policy` --[mitigates]--> `uptime_sla` (weight: 0.7)
- `retry_policy` --[depends_on]--> `error_handling` (weight: 0.5)

**Cluster 3: Developer Experience**

- **Node: `api_documentation`** (type: `artifact`)
  - Observation 1: "OpenAPI spec is 6 months out of date; 12 endpoints added since last update" (confidence: 0.9, source: sensor, createdAt: 2026-03-10)
  - Observation 2: "Three external teams have filed support tickets about undocumented breaking changes in v2.3" (confidence: 0.85, source: sensor, createdAt: 2026-03-20)
- **Node: `sdk_client`** (type: `component`)
  - Observation 1: "Python SDK covers only v2.0 endpoints; v2.1-v2.3 require raw HTTP calls" (confidence: 0.88, source: sensor, createdAt: 2026-03-12)
  - Observation 2: "TypeScript SDK has 14 open issues, 3 of which are type definition mismatches with actual responses" (confidence: 0.82, source: sensor, createdAt: 2026-03-22)
- **Node: `onboarding_friction`** (type: `concept`)
  - Observation 1: "Average time-to-first-successful-call for new API consumers is 4.5 hours, target is 30 minutes" (confidence: 0.78, source: pfc_inference, createdAt: 2026-03-25)

**Edges (Cluster 3):**
- `api_documentation` --[causes]--> `onboarding_friction` (weight: 0.85)
- `sdk_client` --[causes]--> `onboarding_friction` (weight: 0.7)
- `api_documentation` --[describes]--> `sdk_client` (weight: 0.4)

**Cross-cluster edges:**
- `caching_layer` --[complicates]--> `error_handling` (weight: 0.3) — cache invalidation failures can mask real errors
- `api_documentation` --[documents]--> `retry_policy` (weight: 0.2) — weak link, docs mention retries but vaguely
- `db_query_optimization` --[unrelated_to]--> `sdk_client` (weight: 0.05) — near-zero cross-cluster connection

### Activation Metadata (Expected)
- **dispersion**: ~0.78 (high — three distinct clusters with weak cross-links)
- **contextDensity**: ~3.2 observations per query keyword
- **coverageGaps**: none expected for "improve API"
- **clusterCount**: 3

### Expected Perspectives
- **Perspective A** ("performance"): api_latency, caching_layer, db_query_optimization — coherence: 0.82
- **Perspective B** ("reliability"): error_handling, retry_policy, uptime_sla — coherence: 0.79
- **Perspective C** ("developer-experience"): api_documentation, sdk_client, onboarding_friction — coherence: 0.85

## User Goal
The user wants a concrete plan to improve their API but has not specified which dimension matters most. The system must detect the ambiguity, surface the tradeoff, and either ask for prioritization or reason through a principled ordering.

## User Inputs

### Initial Prompt
"I want to improve the API. What should we focus on?"

### Follow-up Responses

**If asked to prioritize among the three perspectives:**
"Reliability is the most urgent — we've had customer complaints about downtime. But the documentation gap is also causing us pain with partner integrations."

**If asked about constraints (time, team size, etc.):**
"We have two backend engineers for the next sprint (2 weeks). No dedicated docs writer."

**If the system proposes a phased plan without asking:**
"That makes sense. Can you be more specific about what to do first?"

**If asked about the severity of the performance issues:**
"The latency is annoying but not critical — most users are internal right now. External launch is in 6 weeks."

## Expected Behavior

### Phase 1: Activation & Perspective Detection (Iteration 1)
Graph activation on "improve the API" should produce a high-dispersion activated subgraph with 3 clusters. The system should detect `clusterCount: 3` and form three labeled perspectives. The PFC should recognize this as a multi-perspective situation requiring tradeoff reasoning, not a single-track plan.

### Phase 2: Perspective Analysis (Iterations 2-3)
The PFC should reason across all three perspectives, identifying:
- **Convergence**: Error handling improvements benefit both reliability AND developer experience (consistent error formats help SDK consumers). This is a high-confidence action.
- **Divergence**: Performance optimization (caching, query tuning) is orthogonal to documentation work. These compete for the same engineering time.
- The PFC should note the convergence point as a strong candidate for "do first" regardless of prioritization.

### Phase 3: Tradeoff Surfacing (Iteration 3-4)
The PFC should either:
- **(Preferred)** Ask the user to prioritize, presenting the three perspectives with concrete tradeoffs ("Reliability improvements would address the 99.1% uptime gap but won't help partner onboarding. Documentation fixes would reduce onboarding from 4.5 hours to closer to 30 minutes but won't fix the latency SLA breach.")
- **(Acceptable)** Reason through a prioritization using the graph's confidence and urgency signals — reliability observations are most recent and highest confidence, suggesting it's the most pressing area.

### Phase 4: Plan Formation (Iterations 5-7)
After receiving prioritization (or reasoning through it), the PFC should produce a concrete plan that:
1. Starts with the convergence point (structured error responses — helps reliability AND DX)
2. Sequences the prioritized dimension next
3. Defers the lowest-priority dimension with a rationale
4. Accounts for constraints (2 engineers, 2 weeks, no docs writer)

### Phase 5: Output (Iteration 7-8)
Final output should be a structured plan with rationale, not just a list of tasks. The rationale should explicitly reference the multi-perspective analysis.

## Grading

### Key Concepts Being Tested
- Multi-perspective formation from high-dispersion activation (Section 4.5)
- Convergence/divergence detection across perspectives (Section 5.3)
- Tradeoff navigation — the PFC should not flatten multi-perspective situations into a single track (Section 5.3)
- Goal decomposition under ambiguity (Section 5.1)
- ACC-analog complexity estimation driving PFC approach (Section 4.5)

### Scenario-Specific Grading Criteria

| Dimension | Criteria | Weight Override |
|-----------|----------|----------------|
| D1: Goal Decomposition | Top-level goal should be "improve API" with sub-goals per perspective or per phase. Penalize if system jumps straight to a single improvement track without acknowledging multiplicity. | 0.15 (default) |
| D2: Retrieval Quality | All three clusters must activate. Penalize if any cluster is entirely missing. Cross-cluster edges (caching <-> error handling) should be present in the subgraph. | 0.20 (increased) |
| D3: Reasoning Efficiency | 5-8 iterations is optimal. Under 5 means the system skipped perspective analysis. Over 10 means it's spinning. | 0.10 (default) |
| D4: Prediction Calibration | Predictions about user's priorities should be low-confidence (the user hasn't stated them). If the system predicts user priority with high confidence before asking, that's miscalibration. | 0.10 (decreased) |
| D5: Reactivation Precision | No reactivation should be needed for the initial analysis — all three clusters should activate from the initial query. If the user provides priority information, reactivation MAY fire to pull in deeper context on the prioritized cluster. | 0.10 (default) |
| D6: Self-Correction | If the system initially starts down a single-perspective track and then corrects after noticing dispersion metadata, that's good self-correction. If it never notices, score 1. | 0.15 (default) |
| D7: Memory Hierarchy | Intermediate perspective analysis should be written to scratch space. Working memory should hold the active perspective comparison. | 0.10 (default) |
| D8: Output Quality | Final output must reference multiple perspectives, acknowledge tradeoffs, and present a sequenced plan. A flat list of improvements without tradeoff reasoning scores 2 at most. | 0.10 (default) |

### Passing Threshold
Composite score >= 3.5. The system must score at least 3 on D2 (Retrieval) and at least 3 on D8 (Output Quality) — failure on either is an automatic fail regardless of composite.

### Red Flags
- **D2 drops to 1** if only one perspective cluster activates (e.g., only performance nodes retrieved)
- **D1 drops to 1** if the system never acknowledges that "improve the API" is ambiguous and proceeds with a single interpretation without justification
- **D8 drops to 1** if the final output contains no reference to tradeoffs or competing priorities
- **D6 drops to 1** if the system receives contradictory priority signals (e.g., user says reliability is urgent but system focuses on performance) and does not adjust
