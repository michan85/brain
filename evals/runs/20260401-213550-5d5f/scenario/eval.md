# Scenario I03: Multi-Hop Graph Traversal

## Metadata
- **Tier**: Intermediate
- **Focus**: Graph activation spread, multi-hop retrieval, observation-level relevance filtering
- **Estimated iterations**: 3-4

## Setup

Seed the knowledge graph with the following nodes and edges. The critical path is A -> B -> C, where the user asks about A but the answer lives on C.

**Nodes:**

1. `node:order_service` (type: `"service"`) [Entity A]
   - Observation: "OrderService processes customer orders for the e-commerce platform. It validates payment, reserves inventory, and emits an OrderPlaced event."
   - Observation: "OrderService is a Java Spring Boot application deployed on ECS."
   - Observation: "OrderService depends on InventoryService for stock reservation before confirming an order."

2. `node:inventory_service` (type: `"service"`) [Entity B -- the bridge]
   - Observation: "InventoryService manages warehouse stock levels. It exposes a /reserve endpoint called by OrderService and a /replenish endpoint called by the warehouse system."
   - Observation: "InventoryService uses a PostgreSQL database: inventory-db-prod."
   - Observation: "InventoryService was recently refactored to use event sourcing. Stock levels are computed from the event log rather than a mutable row."

3. `node:inventory_db_prod` (type: `"database"`) [Entity C -- where the answer is]
   - Observation: "inventory-db-prod is a PostgreSQL 15 instance on RDS. Instance class: db.r6g.xlarge."
   - Observation: "inventory-db-prod hit 92% storage utilization on 2026-03-28. An alert fired and the on-call expanded the volume to 500GB."
   - Observation: "After the event sourcing refactor, inventory-db-prod's write amplification increased 3x due to append-only event log growth. The team is evaluating partitioning the events table by month."
   - Observation: "inventory-db-prod connection pool max is 100. InventoryService uses 60-70 connections during peak hours."

4. `node:warehouse_system` (type: `"system"`)
   - Observation: "The warehouse management system sends replenishment signals to InventoryService when physical stock arrives."

5. `node:payment_gateway` (type: `"service"`)
   - Observation: "PaymentGateway processes credit card charges. OrderService calls it during checkout."

**Edges:**

- `order_service --[depends_on]--> inventory_service` (weight: 0.85)
- `order_service --[depends_on]--> payment_gateway` (weight: 0.8)
- `inventory_service --[uses_database]--> inventory_db_prod` (weight: 0.9)
- `inventory_service --[receives_from]--> warehouse_system` (weight: 0.6)

**Scratch Space:** Empty (new session).

## User Goal

The user asks about OrderService's risk of failing during peak traffic. The answer requires understanding that OrderService depends on InventoryService, which depends on inventory-db-prod, which is under storage pressure and has connection pool concerns. This is a two-hop traversal: `order_service -> inventory_service -> inventory_db_prod`.

## User Inputs

### Initial Prompt
"What are the risks to OrderService during our upcoming peak sale event? Anything downstream that could break?"

### Follow-up Responses

- If asked "How much traffic increase do you expect during the peak event?": "Roughly 3x normal volume."
- If asked "Should I check the payment gateway as well?": "Sure, but I'm most worried about inventory -- we've had issues there before."
- If asked "Do you want me to look at the database layer too?": "Yes, definitely. That's usually where things break."

## Expected Behavior

**Iteration 1 (Activate + Plan):**
- Sensor extracts entities: `order_service`, `risk`, `peak`, `failure`, `downstream`.
- Graph activation seeds on `order_service`.
- Spread activation (2 hops, decay 0.5):
  - Hop 0: `order_service` (activation: 1.0)
  - Hop 1: `inventory_service` (activation: ~0.85 * 0.5 = 0.425), `payment_gateway` (activation: ~0.8 * 0.5 = 0.4)
  - Hop 2: `inventory_db_prod` (activation: ~0.9 * 0.5 * 0.425 = ~0.19), `warehouse_system` (activation: ~0.6 * 0.5 * 0.425 = ~0.13)
- All nodes above minActivationThreshold (0.1) are included.
- **Critical:** `inventory_db_prod` must be in the activated subgraph despite being 2 hops away. Its observations about storage pressure and connection pool limits are directly relevant to the risk question.
- PFC initializes goal: "Identify risks to OrderService during peak traffic, focusing on downstream dependencies."
- PFC produces Thought examining the activated subgraph, noting the dependency chain and the database-level risks.
- PFC may push sub-goal: "Analyze inventory database capacity under 3x load."

**Iteration 2 (Reason about risks):**
- PFC works through the dependency chain:
  - OrderService -> InventoryService: event sourcing refactor means more DB writes per order.
  - InventoryService -> inventory-db-prod: storage at 92% (recently expanded but event log growth is 3x), connection pool at 60-70/100 (at 3x traffic, could hit 180-210, exceeding the pool max of 100).
- PFC produces Thought synthesizing the risk chain.
- No reactivation needed -- the initial 2-hop spread captured the relevant context.

**Iteration 3 (Respond):**
- PFC generates response identifying the risks with the dependency chain traced:
  1. Connection pool exhaustion: inventory-db-prod has a max of 100 connections, InventoryService uses 60-70 at normal load, 3x would exceed capacity.
  2. Storage pressure: event sourcing 3x write amplification + 3x traffic = rapid event log growth on an already-pressured volume.
  3. Secondary: PaymentGateway is also a dependency but the user flagged inventory as the primary concern.
- Evaluator: DONE.

**Key structural requirement:** The activated subgraph from the initial activation must include `inventory_db_prod` (2 hops from the seed). The PFC must trace the dependency chain through the intermediate node (`inventory_service`) to reach the database-level observations. If spread activation only goes 1 hop, the critical risk information is missed entirely.

## Grading

### Key Concepts Being Tested
- Spread activation reaching 2 hops with appropriate decay
- Activation scores correctly computed through edge weights and decay
- Observation-level filtering: the database storage and connection pool observations are the most relevant despite being on a node 2 hops away
- PFC reasoning across a dependency chain (not just using seed node observations)
- The difference between graph-structured retrieval and flat embedding search (embedding search on "OrderService risk" would unlikely surface database connection pool limits)

### Scenario-Specific Grading Criteria

**D2: Retrieval Quality (weight: 0.30, override from 0.15)**
- Score 5: Activated subgraph includes `order_service`, `inventory_service`, `inventory_db_prod`, and `payment_gateway`. Activation scores decrease appropriately with hops. The database storage and connection pool observations are in `relevantObservations`.
- Score 3: Subgraph includes hop-1 nodes but misses `inventory_db_prod` (hop 2). The PFC must explicitly request reactivation to reach it.
- Score 1: Only the seed node is activated. No downstream dependencies retrieved.

**D1: Goal Decomposition (weight: 0.15)**
- Score 5: Clear goal focused on downstream risk analysis. Sub-goals for analyzing specific dependency layers if the chain is long.
- Score 3: Goal is reasonable but doesn't distinguish between dependency layers.
- Score 1: Goal is vague or unrelated to the risk question.

**D3: Reasoning Efficiency (weight: 0.10)**
- Score 5: 3-4 iterations. The system doesn't need reactivation because the initial spread captured everything. Each iteration advances the analysis.
- Score 3: 5-6 iterations, possibly with an unnecessary reactivation.
- Score 1: Excessive iterations or the system cannot connect the dependency chain.

**D5: Reactivation Precision (weight: 0.10)**
- Score 5: No reactivation fires (correct -- initial 2-hop spread was sufficient).
- Score 3: One reactivation fires to get database context (acceptable if hop config was 1, but suboptimal).
- Score 1: Multiple reactivations or reactivation with irrelevant queries.

**D8: Output Quality (weight: 0.20, override from 0.10)**
- Score 5: Response traces the full dependency chain (OrderService -> InventoryService -> inventory-db-prod), identifies connection pool exhaustion and storage pressure as concrete risks, and provides specific numbers (100 pool max, 60-70 current, 3x projection).
- Score 3: Identifies that InventoryService is a dependency but is vague about database-level risks.
- Score 1: Only discusses OrderService itself without tracing downstream, or misses the database entirely.

**D4: Prediction Calibration (weight: 0.05, override from 0.15)**
- Score 5: If effector calls are made, predictions are reasonable.
- (This scenario may not involve effector calls if the graph has enough information, making this dimension less relevant.)

**D6: Self-Correction (weight: 0.05, override from 0.15)**
- Score 5: Not heavily tested here -- no major prediction errors expected.
- (Low weight because the scenario focuses on retrieval, not correction.)

**D7: Memory Hierarchy Usage (weight: 0.05, override from 0.10)**
- Score 5: Working memory stays within budget, intermediate reasoning is appropriately managed, no direct KG writes.
- Score 3: Some minor memory management issues.
- Score 1: Direct KG writes or critical information lost.

### Passing Threshold
Composite score >= 3.5

### Red Flags
- Activated subgraph contains only `order_service` and the PFC never reaches `inventory_db_prod` (D2 drops to 1)
- The response discusses OrderService in isolation without any downstream dependency analysis (D8 drops to 1)
- The system hallucinates risks not grounded in the graph's observations (D8 drops to 2)
- Spread activation decay produces activation scores of 0 for hop-2 nodes due to misconfigured decay/threshold (D2 drops to 1)
