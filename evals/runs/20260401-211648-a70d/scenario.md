# Scenario I05: Scratch Space Continuity

## Metadata
- **Tier**: Intermediate
- **Focus**: Scratch space (session-scoped memory tier 2), graph activation reading from scratch, memory hierarchy separation
- **Estimated iterations**: 3-4 per part (6-8 total across two parts)

## Setup

Seed the knowledge graph with the following nodes and edges:

**Nodes:**

1. `node:checkout_flow` (type: `"feature"`)
   - Observation: "The checkout flow is the multi-step purchase process on the e-commerce platform: cart review -> shipping -> payment -> confirmation."
   - Observation: "Checkout flow is implemented in the frontend monorepo under packages/checkout/."

2. `node:cart_service` (type: `"service"`)
   - Observation: "CartService manages shopping cart state. It stores carts in DynamoDB with a 24-hour TTL."
   - Observation: "CartService exposes REST endpoints: GET /cart/{userId}, POST /cart/{userId}/items, DELETE /cart/{userId}/items/{itemId}."

3. `node:shipping_calculator` (type: `"service"`)
   - Observation: "ShippingCalculator computes shipping rates based on destination, weight, and carrier. It calls the FedEx and UPS APIs."
   - Observation: "ShippingCalculator has a 5-second timeout on carrier API calls. If both carriers timeout, it falls back to flat-rate shipping."

4. `node:payment_processor` (type: `"service"`)
   - Observation: "PaymentProcessor handles credit card charges via Stripe. It implements idempotency keys to prevent double charges."
   - Observation: "PaymentProcessor logs all charge attempts to an audit table in PostgreSQL."

**Edges:**

- `checkout_flow --[uses]--> cart_service` (weight: 0.9)
- `checkout_flow --[uses]--> shipping_calculator` (weight: 0.8)
- `checkout_flow --[uses]--> payment_processor` (weight: 0.9)

**Scratch Space:** Empty at start. **Same sessionId will be used for both parts.**

## User Goal

This is a two-part interaction within the same session. In Part 1, the user asks the system to investigate a checkout bug, and the system gathers information (writing traces to scratch space). In Part 2 (different prompt, same session), the user asks a follow-up question, and the system should pull the Part 1 traces from scratch space during graph activation -- demonstrating session-scoped memory continuity.

## User Inputs

### Part 1: Initial Investigation

#### Initial Prompt
"Users are reporting that sometimes their orders go through but they get charged twice. Can you investigate the checkout flow for double-charge issues?"

#### Follow-up Responses (Part 1)
- If asked "Should I check the PaymentProcessor logs?": "Yes, check what the audit logs show for duplicate charges."
- If asked "Do you want me to look at the idempotency key implementation?": "Yes, that's probably where the bug is."

### Part 2: Follow-Up (same session, different prompt)

#### Initial Prompt
"Based on what you found earlier, what's the fastest fix we can ship?"

#### Follow-up Responses (Part 2)
- If asked "Are you referring to the double-charge issue from earlier?": "Yes, exactly."
- If asked "Do you want a quick fix or a proper fix?": "Quick fix first, we can do the proper fix later."

## Expected Behavior

### Part 1: Investigation

**Iteration 1 (Plan):**
- Sensor extracts entities: `checkout_flow`, `double_charge`, `orders`.
- Graph activation seeds on `checkout_flow`, `payment_processor`.
- Spread activation pulls in `cart_service`, `shipping_calculator`, `payment_processor`.
- PFC initializes goal: "Investigate double-charge issue in the checkout flow."
- PFC pushes sub-goal: "Check PaymentProcessor for idempotency key issues."
- Evaluator: CONTINUE.
- **Scratch space write:** Thought trace with reasoning about the investigation plan.

**Iteration 2 (Investigate):**
- PFC generates Action to check PaymentProcessor audit logs.
- Prediction: "Audit logs will show duplicate charge entries for the same order. Confidence: 0.65."
- Effector calls `database.query({ sql: "SELECT * FROM charge_audit WHERE created_at > now() - interval '7 days' GROUP BY order_id HAVING count(*) > 1" })`.
- Returns: `{ rows: [{ order_id: "ORD-4821", charge_count: 2, amounts: ["$149.99", "$149.99"], idempotency_keys: ["ik_4821_v1", "ik_4821_v2"] }, { order_id: "ORD-5033", charge_count: 2, amounts: ["$89.00", "$89.00"], idempotency_keys: ["ik_5033_v1", "ik_5033_v2"] }] }`.
- Evaluator: deviation moderate (expected duplicates confirmed, but the idempotency keys are different for the same order -- this is the root cause signal). Surprise: "low" (duplicates expected). Quality: "productive".
- **Scratch space write:** Action result trace. Evaluator signal trace.
- PFC produces Thought: "The audit logs confirm double charges. Critically, the idempotency keys are different for the same order (e.g., ik_4821_v1 and ik_4821_v2). The idempotency key is being regenerated on retry instead of reusing the original key. This means Stripe treats each attempt as a new charge."
- **Scratch space write:** Thought trace containing the root cause analysis. Tags: `["root_cause", "idempotency_key_regeneration"]`.

**Iteration 3 (Respond Part 1):**
- PFC generates response summarizing findings.
- Response: "Found the issue. The PaymentProcessor is generating a new idempotency key on each charge attempt instead of reusing the key for the same order. When a charge request times out and retries, Stripe sees a different idempotency key and processes it as a new charge. Orders ORD-4821 and ORD-5033 were both double-charged this way."
- Evaluator: DONE.
- **Scratch space write:** Final response trace and completion signal.

**At this point, scratch space contains ~5 traces:**
1. Investigation plan thought
2. Audit log query result
3. Evaluator signal (productive, low surprise)
4. Root cause analysis thought (tagged: root_cause, idempotency_key_regeneration)
5. Final response and completion

### Part 2: Follow-Up (same session)

**Iteration 1 (Activate with scratch context):**
- Sensor extracts entities: `fix`, `earlier`, `found`.
- Graph activation:
  - Vector search on "fix based on what you found earlier" seeds on `checkout_flow`, `payment_processor`.
  - **Graph activation also queries scratch space** for this session's traces.
  - Scratch space returns the root cause analysis trace (tagged `root_cause`) and the audit log result trace -- both are semantically relevant to "what you found."
  - The activated context now includes BOTH graph nodes AND scratch traces from Part 1.
- PFC initializes goal: "Recommend fastest fix for the double-charge issue identified earlier."
- PFC sees the scratch trace about idempotency key regeneration without needing to re-investigate.
- PFC produces Thought: "From the earlier investigation (scratch traces), the root cause is idempotency key regeneration on retry. The fastest fix is to make the idempotency key deterministic based on order ID (e.g., hash of order_id + amount), so retries reuse the same key."

**Iteration 2 (Respond Part 2):**
- PFC generates response with the fix recommendation.
- Response: "Fastest fix: change the idempotency key generation in PaymentProcessor to be deterministic -- derive it from the order ID (e.g., `ik_{orderId}`) instead of generating a new UUID each time. This ensures that retry attempts for the same order reuse the same Stripe idempotency key, and Stripe will automatically deduplicate the charge. The proper follow-up would be to add a charge-attempt state machine to the order model, but the key fix alone will stop the double charges immediately."
- Evaluator: DONE.

**Key structural requirement:** Part 2's graph activation must read from scratch space and merge those traces into the activated context. The PFC in Part 2 must NOT re-investigate the issue from scratch -- it should reference the findings from Part 1 as available context. If scratch space is not queried or its traces are not included in the activation, the system will either re-investigate (wasting iterations) or fail to connect "what you found earlier" to the root cause.

## Grading

### Key Concepts Being Tested
- Scratch space writes during Part 1 (thought traces, action results, evaluator signals)
- Scratch space reads during Part 2's graph activation (session-scoped trace retrieval)
- Merging scratch traces with graph nodes in the activated subgraph
- Session continuity without direct knowledge graph writes (the Dreamer hasn't run yet)
- The three-tier memory hierarchy working as designed: working memory (Part 1 loop), scratch space (persists between parts), knowledge graph (unchanged)

### Scenario-Specific Grading Criteria

**D7: Memory Hierarchy Usage (weight: 0.30, override from 0.10)**
- Score 5: Part 1 writes meaningful traces to scratch space (at minimum: root cause analysis, audit log results). Part 2's graph activation queries scratch space and includes relevant traces in the activated context. No direct KG writes from the PFC. Working memory from Part 1 is gone (as expected -- loop ended), but scratch space preserves the key findings.
- Score 3: Scratch space is written to in Part 1 but not read in Part 2, or only partially read. The system partially re-investigates.
- Score 1: Scratch space is unused. Part 2 starts from scratch with no memory of Part 1. Or the PFC writes directly to the knowledge graph during Part 1.

**D2: Retrieval Quality (weight: 0.15)**
- Score 5: Part 2's activated context includes both relevant graph nodes (checkout_flow, payment_processor) AND the root cause scratch trace from Part 1. The scratch traces are properly merged with graph nodes.
- Score 3: Graph nodes are activated in Part 2 but scratch traces are missing or not merged.
- Score 1: Neither graph nodes nor scratch traces are relevant in Part 2.

**D3: Reasoning Efficiency (weight: 0.15, override from 0.10)**
- Score 5: Part 2 completes in 2-3 iterations because the root cause is already known from scratch space. Total across both parts: 5-7 iterations.
- Score 3: Part 2 takes 4-5 iterations because it partially re-investigates.
- Score 1: Part 2 fully re-investigates from scratch (6+ iterations for Part 2 alone).

**D1: Goal Decomposition (weight: 0.10, override from 0.15)**
- Score 5: Part 1 has clear investigation goals. Part 2 has a clear fix-recommendation goal that references prior findings.
- Score 3: Goals exist but Part 2 doesn't clearly connect to Part 1.
- Score 1: Goals are incoherent or Part 2 treats the task as entirely new.

**D8: Output Quality (weight: 0.15, override from 0.10)**
- Score 5: Part 1 response correctly identifies the root cause (idempotency key regeneration). Part 2 response provides a concrete, actionable fix grounded in the Part 1 findings, and distinguishes quick fix from proper fix.
- Score 3: Responses are partially correct or Part 2 is generic advice not connected to Part 1 findings.
- Score 1: Either response is wrong or Part 2 contradicts Part 1.

**D4: Prediction Calibration (weight: 0.05, override from 0.15)**
- Predictions in Part 1 should reflect moderate confidence (investigation with uncertain outcome). Low weight since this isn't the focus.

**D5: Reactivation Precision (weight: 0.05, override from 0.10)**
- Score 5: No unnecessary reactivations. Part 2's initial activation (which includes scratch space) is sufficient.
- Score 3: One unnecessary reactivation in Part 2.
- Score 1: Multiple reactivations.

**D6: Self-Correction (weight: 0.05, override from 0.15)**
- Score 5: Not heavily tested here. If the system encounters unexpected audit log results in Part 1, it adjusts appropriately.
- (Low weight because the scenario focuses on memory hierarchy, not error recovery.)

### Passing Threshold
Composite score >= 3.5

### Red Flags
- Part 2's graph activation does not query scratch space at all (D7 drops to 1)
- Part 2 re-runs the audit log query because it has no memory of Part 1's results (D7 drops to 1, D3 drops to 1)
- PFC writes the root cause finding directly to the knowledge graph during Part 1 instead of scratch space (D7 drops to 1)
- Part 2's response is generic advice ("check the idempotency implementation") without referencing the specific findings from Part 1 (ORD-4821, key regeneration pattern) (D8 drops to 2)
- Scratch space traces from Part 1 are present but the evaluator tag `root_cause` is not used to prioritize them during Part 2 activation (D2 drops to 3)
