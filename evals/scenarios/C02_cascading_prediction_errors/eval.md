# Scenario C02: Cascading Prediction Errors

## Metadata
- **Tier**: Complex
- **Focus**: Evaluator (prediction error computation, surprise signals), PFC Loop (reactivation under cascading failures, goal stack adjustment), Effectors (prediction/efference copy generation)
- **Estimated iterations**: 8-12

## Setup

### Knowledge Graph State

**Node: `order_service`** (type: `service`)
- Observation 1: "order-service is a Node.js microservice deployed on Kubernetes namespace `prod-commerce`" (confidence: 0.95, source: sensor, createdAt: 2026-03-01)
- Observation 2: "order-service depends on inventory-service via gRPC on port 50051" (confidence: 0.9, source: sensor, createdAt: 2026-03-10)
- Observation 3: "order-service uses @company/shared-proto v2.4.0 for gRPC type definitions" (confidence: 0.85, source: sensor, createdAt: 2026-03-15)
- Observation 4: "Last successful deploy was 2026-03-20, commit abc123" (confidence: 0.95, source: sensor, createdAt: 2026-03-20)

**Node: `inventory_service`** (type: `service`)
- Observation 1: "inventory-service runs Go on Kubernetes namespace `prod-commerce`" (confidence: 0.93, source: sensor, createdAt: 2026-03-01)
- Observation 2: "inventory-service upgraded to @company/shared-proto v3.0.0 on 2026-03-22 with breaking field renames" (confidence: 0.92, source: sensor, createdAt: 2026-03-22)
- Observation 3: "inventory-service health check endpoint is /healthz on port 8080" (confidence: 0.95, source: sensor, createdAt: 2026-03-01)

**Node: `shared_proto`** (type: `library`)
- Observation 1: "@company/shared-proto v3.0.0 renamed `item_count` to `quantity` and `sku_id` to `product_sku` across all proto definitions" (confidence: 0.95, source: external, createdAt: 2026-03-22)
- Observation 2: "v3.0.0 migration guide is in docs/migration-v3.md in the shared-proto repo" (confidence: 0.8, source: external, createdAt: 2026-03-22)

**Node: `deploy_pipeline`** (type: `process`)
- Observation 1: "Deployments go through CI (lint, test, build) then staging rollout then prod rollout via ArgoCD" (confidence: 0.9, source: sensor, createdAt: 2026-02-15)
- Observation 2: "Staging environment shares the same inventory-service instance as prod for cost reasons" (confidence: 0.7, source: pfc_inference, createdAt: 2026-03-05)

**Node: `k8s_namespace_prod`** (type: `infrastructure`)
- Observation 1: "prod-commerce namespace has resource quotas: 4 CPU, 8Gi memory per pod" (confidence: 0.88, source: sensor, createdAt: 2026-02-20)
- Observation 2: "Pod restart policy is Always with a backoff limit of 5" (confidence: 0.85, source: sensor, createdAt: 2026-02-20)

**Edges:**
- `order_service` --[depends_on]--> `inventory_service` (weight: 0.9)
- `order_service` --[uses]--> `shared_proto` (weight: 0.85)
- `inventory_service` --[uses]--> `shared_proto` (weight: 0.85)
- `order_service` --[deployed_via]--> `deploy_pipeline` (weight: 0.8)
- `order_service` --[runs_in]--> `k8s_namespace_prod` (weight: 0.7)
- `deploy_pipeline` --[targets]--> `k8s_namespace_prod` (weight: 0.75)

### Effector Simulation

The scenario simulates three sequential effector calls, each revealing a new problem:

**Effector Call 1: Deploy order-service**
- PFC prediction: "Deploy will succeed; CI passes, staging rollout completes" (confidence: 0.8)
- Actual result: `{ success: false, error: "gRPC connection to inventory-service failed: unknown field 'item_count' in InventoryRequest — expected 'quantity'", durationMs: 45000 }`
- Prediction error: deviation 0.85, surprise: "high", valence: "negative"

**Effector Call 2: Update shared-proto dependency to v3.0.0 and redeploy**
- PFC prediction: "Updating shared-proto and redeploying will resolve the gRPC field mismatch" (confidence: 0.7)
- Actual result: `{ success: false, error: "Build failed: TypeScript compilation error in src/mappers/order-mapper.ts — Property 'sku_id' does not exist on type 'InventoryItem'. Did you mean 'product_sku'?", durationMs: 120000 }`
- Prediction error: deviation 0.6, surprise: "high", valence: "negative"

**Effector Call 3: Fix field references in order-mapper.ts and redeploy**
- PFC prediction: "Fixing field references and redeploying should complete the migration" (confidence: 0.6 — lower after two failures)
- Actual result: `{ success: true, data: { deploymentId: "deploy-789", status: "healthy", replicas: 3 }, durationMs: 180000 }`
- Prediction error: deviation 0.1, surprise: "none", valence: "positive"

## User Goal
Deploy a code change to the order-service. The user expects a straightforward deploy but the system must navigate cascading dependency failures.

## User Inputs

### Initial Prompt
"Deploy the latest changes to order-service. The PR was merged to main this morning."

### Follow-up Responses

**If asked for confirmation before deploying:**
"Yes, go ahead and deploy."

**If the system reports the first failure and asks for direction:**
"That's weird — it was working yesterday. Can you figure out what changed and fix it?"

**If the system reports the proto version mismatch:**
"Oh right, the inventory team upgraded their proto last week. Go ahead and update our dependency and redeploy."

**If the system reports the second failure (build error):**
"Makes sense, there are probably field name changes. Fix them and try again."

**If the system asks whether to update tests or just source files:**
"Fix everything that references the old field names — source and tests."

## Expected Behavior

### Phase 1: Initial Goal & Deploy Attempt (Iterations 1-2)
- PFC decomposes "deploy order-service" into sub-goals: trigger CI, wait for staging, promote to prod
- PFC generates a prediction with moderate-to-high confidence (the graph shows recent successful deploys)
- Effector call triggers the deploy pipeline

### Phase 2: First Prediction Error — gRPC Failure (Iterations 3-4)
- Evaluator computes deviation 0.85, surprise "high", valence "negative"
- Evaluator generates `reactivationQuery: "inventory-service gRPC shared-proto field changes"`
- Reactivation fires, pulling in `shared_proto` v3.0.0 observations and `inventory_service` upgrade observation
- PFC should NOW connect the dots: inventory-service upgraded to shared-proto v3.0.0, but order-service is still on v2.4.0
- Goal stack adjusts: push sub-goal "resolve proto version mismatch" above "deploy"
- PFC should NOT panic or reset all goals — this is a dependency issue with a clear path forward

### Phase 3: Second Prediction Error — Build Failure (Iterations 5-7)
- After updating the proto dependency, the build fails due to renamed fields
- Evaluator computes deviation 0.6, surprise "high" (but confidence was already lower)
- Reactivation fires with query about "shared-proto v3.0.0 field renames"
- Graph should return the observation about `item_count` -> `quantity` and `sku_id` -> `product_sku` renames
- PFC pushes another sub-goal: "fix field references in order-service code"
- Critically, confidence should decrease on subsequent predictions — the system should be learning within-session that this deploy is more complex than expected

### Phase 4: Successful Deploy (Iterations 8-9)
- After fixing field references, deploy succeeds
- Prediction error is low (deviation 0.1) — the system correctly expected success after the fixes
- Sub-goals unwind: "fix field references" (complete) -> "resolve proto mismatch" (complete) -> "deploy order-service" (complete)
- Evaluator quenches the loop

### Phase 5: Post-Success Reflection (Iteration 10, optional)
- PFC may generate a final thought summarizing the cascading failure chain for scratch space
- This thought would note: proto upgrade -> gRPC field mismatch -> build failure from renamed fields
- This trace is high-value for Dreamer consolidation (potential pattern: "proto major version bumps cause cascading field renames")

### Key Behavioral Properties
- **No panic loop**: The system should not rapidly retry the same action. Each failure leads to investigation, diagnosis, fix, then retry.
- **Decreasing confidence**: Prediction confidence should decrease across the cascade (0.8 -> 0.7 -> 0.6 or similar)
- **Targeted reactivation**: Each reactivation should be specific to the new failure, not a broad re-query of everything
- **Goal stack integrity**: Sub-goals should nest properly and unwind in order

## Grading

### Key Concepts Being Tested
- Prediction error as a learning signal (Section 6.2)
- Surprise-driven reactivation (Section 5.5, trigger 1)
- Goal stack adjustment on evaluator redirect (Section 6.1)
- Prediction confidence calibration across cascading failures (Section 6.2)
- PFC's ability to integrate reactivated context with the current failure to form a diagnosis (Section 5.4)
- Three brakes: the system should NOT hit fatigue or stale-state — it should terminate via deliberate stop (Section 6.3)

### Scenario-Specific Grading Criteria

| Dimension | Criteria | Weight Override |
|-----------|----------|----------------|
| D1: Goal Decomposition | Initial deploy goal should be simple. Each failure should produce a targeted sub-goal (not a full goal reset). Sub-goals should unwind correctly after resolution. | 0.15 (default) |
| D2: Retrieval Quality | Initial activation should include order-service and deploy pipeline. After first failure, reactivation MUST pull in shared-proto version mismatch info. After second failure, field rename observations must activate. | 0.15 (default) |
| D3: Reasoning Efficiency | 8-12 iterations is expected. Under 6 means the system skipped diagnosis. Over 15 means it's looping. Each failure should take 2-3 iterations to diagnose and fix, not more. | 0.10 (default) |
| D4: Prediction Calibration | Confidence MUST decrease across failures. First prediction at 0.7-0.9 is fine. Second at 0.6-0.8 is fine. Third at 0.5-0.7 shows appropriate recalibration. If confidence stays high across failures, score 1. | 0.15 (default) |
| D5: Reactivation Precision | Two reactivations expected (after first and second failures). Each should have a targeted query matching the specific failure. A third reactivation is acceptable only if it's PFC-requested for migration guide details. Zero reactivations = score 1. | 0.15 (increased) |
| D6: Self-Correction | The core test of this scenario. System must recover from two consecutive unexpected failures without panic-looping, goal abandonment, or repeating the same failed action. | 0.20 (increased) |
| D7: Memory Hierarchy | Each failure diagnosis should be written to scratch space. The final cascade summary is valuable for Dreamer consolidation. | 0.05 (decreased) |
| D8: Output Quality | Final output should confirm successful deploy AND summarize the issues encountered and how they were resolved. Bonus if it flags the proto version coupling as a systemic risk. | 0.05 (decreased) |

### Passing Threshold
Composite score >= 3.5. Must score at least 4 on D5 (Reactivation Precision) and at least 3 on D6 (Self-Correction) — these are the core tests of this scenario.

### Red Flags
- **D6 drops to 1** if the system retries the same deploy action without investigating the failure
- **D5 drops to 1** if no reactivation fires after a high-surprise prediction error (deviation > 0.7)
- **D4 drops to 1** if prediction confidence increases or stays constant after a failure
- **D1 drops to 1** if the system abandons the deploy goal entirely after the first failure (reset_all) instead of pushing a diagnostic sub-goal
- **D3 drops to 1** if the system enters a tight retry loop (3+ identical effector calls without intervening reasoning)
