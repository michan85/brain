# Scenario C05: High Working Memory Pressure

## Metadata
- **Tier**: Complex
- **Focus**: Memory Hierarchy (working memory compression, token budget management, scratch space utilization), PFC Loop (reasoning under compressed context, fidelity of early requirements after compression)
- **Estimated iterations**: 14-20

## Setup

### Knowledge Graph State

Seeded from `graph.json` in this scenario folder. Key nodes (10 total, rich with observations):

- `ecommerce-platform` (system) — monorepo with 4 services, 500 orders/hour current capacity
- `storefront` (service) — Next.js 14, Lighthouse perf 62, no caching, 2.1MB avg images
- `cart-service` (service) — Node.js/Express on ECS, DynamoDB, no auth middleware (UUID cookies)
- `payment-service` (service) — Go on ECS, Stripe, sync refunds (8s avg), PCI audit overdue
- `fulfillment-service` (service) — Python FastAPI, ShipStation (30s timeout), no Datadog APM
- `product-db` (infrastructure) — PostgreSQL RDS, 50K SKUs, pg_trgm search, S3 images
- `monitoring` (component) — Datadog APM (missing on fulfillment), 47 alerts with 60% noise
- `scaling-target` (concept) — 5,000 orders/hour by Q3 2026, bottleneck analysis
- `engineering-team` (team) — 8 engineers, team breakdown, no SRE
- `infrastructure` (component) — ECS Fargate, no auto-scaling, 18-min CI pipeline

13 edges connecting the service graph topology.

### Context Files (staged by setup.ts)

- `/tmp/brain-eval-c05/scaling-requirements.json` — Comprehensive requirements document with 32 specific requirements across 6 areas, including numeric targets (200KB images, 90+ Lighthouse, 30-day backward compat, etc.) that must survive working memory compression

### Effector Usage

The agent should use `readFile` to read `/tmp/brain-eval-c05/scaling-requirements.json` for the full structured requirements. The initial user prompt provides the requirements inline, but the file serves as a reference the agent can re-read if needed.

### Token Budget Configuration (Simulated)
- Total token budget: 32,000 tokens (simulating a smaller context window to force compression)
- Working memory allocation: 40% = 12,800 tokens
- Compression threshold: 80% of working memory budget = 10,240 tokens
- This configuration is designed to force compression by iteration 8-10 given the volume of requirements and reasoning

## User Goal
The user provides a long, multi-faceted prompt with many specific requirements spanning all four services, performance, security, monitoring, and scaling. The task requires enough reasoning iterations that working memory compression must fire, testing whether critical early requirements survive compression.

## User Inputs

### Initial Prompt
"I need a comprehensive technical plan for scaling the e-commerce platform to handle 5,000 orders/hour by Q3. Here are the specific requirements:

1. **Storefront Performance**: Lighthouse performance score must reach 90+. Implement server-side caching, optimize images (target < 200KB per product image), and add a CDN-based edge cache for product pages. The product search needs to move from pg_trgm to a proper search engine (Elasticsearch or Meilisearch — evaluate both).

2. **Cart Service Hardening**: Add authentication middleware to validate cart ownership. Replace the cookie-based UUID approach with JWT tokens tied to user sessions. DynamoDB read capacity needs to handle 5x current load — evaluate whether to use DAX or provision higher read capacity.

3. **Payment Service Scaling**: The synchronous refund processing must become async — implement a queue (SQS or similar) for refund jobs. The PCI re-audit must be scheduled before any architectural changes. CPU bottleneck analysis: profile the payment handler and determine if the bottleneck is Stripe API serialization or our business logic.

4. **Fulfillment Service Resilience**: Implement circuit breaker for ShipStation API calls. Add retry with exponential backoff. Add Datadog APM (it's the only service without it). The 30-second timeout should be reduced to 10 seconds with a fallback to queued processing.

5. **Cross-Cutting Concerns**: Implement distributed tracing (OpenTelemetry) across all services. Reduce alert noise from 60% false positives to < 10%. Add a message queue (RabbitMQ or Kafka — evaluate both) for inter-service communication to replace synchronous REST calls where appropriate.

6. **Timeline Constraints**: The PCI audit must happen in the first 2 weeks. Search engine migration must not disrupt storefront during migration. Cart auth changes must be backward-compatible for 30 days. All changes must have rollback plans.

Each area needs specific recommendations, not just 'we should improve X'. I want technology choices justified, sequencing rationale, risk callouts, and rough effort estimates."

### Follow-up Responses

**If asked to prioritize among the 6 areas:**
"Scaling bottlenecks and security (PCI + cart auth) are the highest priority. Monitoring improvements are important but can trail behind. Storefront performance is user-facing so don't defer it too long."

**If asked about team capacity:**
"We have 8 engineers. Two are Go specialists (payment-service), two are full-stack (storefront + cart), two are Python (fulfillment), and two are platform/infra. No dedicated SRE."

**If the system delivers a partial plan and asks if it should continue:**
"Yes, keep going. I need all 6 areas covered."

**If the system asks about budget for new infrastructure (Elasticsearch, queues, etc.):**
"Budget is flexible for scaling — the business case is approved. Prefer managed services over self-hosted to reduce ops burden."

**If the system asks about Requirement 1 details after compression has fired:**
(This tests whether compression preserved the specifics)
"Wait — did you include the image optimization target? I said under 200KB per image. And I want both Elasticsearch AND Meilisearch evaluated, not just one picked."

## Expected Behavior

### Phase 1: Goal Decomposition (Iterations 1-3)
- The PFC should parse the dense prompt and establish a top-level goal with 6 major sub-goals (one per area)
- Each sub-goal should have further decomposition reflecting the specific requirements within each area
- The PFC should note the timeline constraints (PCI first, backward compatibility for cart auth)
- Working memory begins filling with the parsed requirements and initial plan structure

### Phase 2: Early Section Planning (Iterations 4-7)
- PFC works through the first 2-3 areas, generating specific recommendations
- For search engine evaluation: should reason about Elasticsearch vs Meilisearch with specific tradeoffs (managed service availability, latency characteristics, cost)
- For cart auth: should address the backward-compatibility constraint (30-day migration window)
- Working memory accumulates rapidly — each area generates substantial reasoning content
- Token count approaches the compression threshold

### Phase 3: Compression Event (Iterations 8-10)
- Working memory exceeds 80% of its budget
- Compression fires: older thoughts from iterations 1-5 get summarized
- **Critical test**: Do the specific requirements survive compression?
  - Image size target (< 200KB)
  - Search engine evaluation requirement (both, not just one)
  - PCI audit timing (first 2 weeks)
  - Cart auth backward compatibility (30 days)
  - Specific technology options mentioned (DAX vs provisioned capacity, SQS, OpenTelemetry)
- The PFC should continue working on later areas without losing awareness of early requirements
- Raw requirement data should be in scratch space as backup

### Phase 4: Later Section Planning (Iterations 11-14)
- PFC works through remaining areas (fulfillment, cross-cutting, timeline)
- Should reference earlier decisions when they affect later ones (e.g., the message queue choice for cross-cutting affects payment-service refund queue)
- If the PFC needs to reference an early requirement, it should be able to find it in compressed working memory or retrieve it from scratch space

### Phase 5: Synthesis & Sequencing (Iterations 15-17)
- PFC synthesizes all sections into a sequenced plan
- Timeline constraints from Requirement 6 must be reflected in the sequencing
- The PCI audit must appear first in the timeline
- Dependencies between areas should be identified (e.g., distributed tracing infrastructure should be in place before scaling changes to enable debugging)

### Phase 6: User Challenge (Iteration 18-19)
- When the user asks "did you include the image optimization target?" and "I want both Elasticsearch AND Meilisearch evaluated", the system must:
  - Either confirm these were already in the plan (proving compression preserved them)
  - Or retrieve them from scratch space/compressed memory and incorporate them
  - NOT hallucinate different requirements or admit they were lost

### Phase 7: Final Output (Iteration 19-20)
- Deliver the complete plan covering all 6 areas with the level of detail requested
- Each area should have: technology choices with justification, sequencing, risks, effort estimates
- The plan should be internally consistent (no contradictions between sections)

## Grading

### Key Concepts Being Tested
- Working memory token budget management (Section 5.2)
- Compression: older thoughts summarized, not evicted (Section 5.2)
- Compression preserves critical details at reduced fidelity (Section 5.2)
- Scratch space as backup for working memory (Section 8, Tier 2)
- PFC ability to reference early requirements after compression (Section 5.2)
- Dynamic allocation within the token budget (Section 5.2)
- Long-horizon goal management across many iterations (Section 5.1)

### Scenario-Specific Grading Criteria

| Dimension | Criteria | Weight Override |
|-----------|----------|----------------|
| D1: Goal Decomposition | 6 major sub-goals expected, each with further decomposition. Timeline constraints should inform goal ordering. Missing any of the 6 areas means incomplete decomposition. | 0.10 (decreased) |
| D2: Retrieval Quality | All 4 service nodes, product_db, monitoring, and scaling_target should activate. Coverage should be broad since the prompt touches every part of the system. | 0.10 (default) |
| D3: Reasoning Efficiency | 14-20 iterations expected. Under 12 means the system skipped depth on some areas. Over 24 means inefficiency or looping. Each of the 6 areas should take 2-3 iterations. | 0.10 (default) |
| D4: Prediction Calibration | Predictions on technology evaluations should be moderate confidence. Predictions on timeline feasibility should be low-to-moderate (many unknowns). | 0.05 (decreased) |
| D5: Reactivation Precision | Reactivation may fire when the PFC shifts from one service area to another (drift-driven). This is legitimate — the activated context should refresh when the focus shifts from storefront to payment-service. More than 4 reactivations total is excessive. | 0.10 (default) |
| D6: Self-Correction | If the user challenges whether early requirements were preserved, the system must either confirm they're in the plan or retrieve and incorporate them. Admitting they were lost without attempting recovery scores 2. Successfully recovering scores 4+. | 0.15 (increased) |
| D7: Memory Hierarchy | **The primary test.** Compression must fire (verifiable from trajectory). After compression, the plan must still reference specific numeric targets from early requirements (200KB images, 90+ Lighthouse, 30-day backward compat). Scratch space must contain the raw requirements and intermediate reasoning. Score 5 if all critical details survive compression. Score 3 if most survive but 1-2 specifics are lost. Score 1 if compression destroys critical requirements. | 0.25 (increased) |
| D8: Output Quality | Final plan must cover all 6 areas with specific recommendations, technology justifications, sequencing, and risk callouts. Generic advice ("improve performance") scores 2. Detailed, actionable recommendations score 4-5. | 0.15 (increased) |

### Passing Threshold
Composite score >= 3.5. Must score at least 3 on D7 (Memory Hierarchy) — this is the core test. Must score at least 3 on D8 (Output Quality) — the plan must be substantive.

### Red Flags
- **D7 drops to 1** if compression fires and the system subsequently produces recommendations that contradict requirements from the initial prompt (e.g., recommending only Elasticsearch when the user asked for both to be evaluated)
- **D7 drops to 1** if the system re-asks the user for information that was already provided in the initial prompt (unless it's asking for clarification on an ambiguous point)
- **D7 drops to 1** if scratch space contains zero traces — the system must be writing intermediate results to scratch space as insurance against working memory loss
- **D8 drops to 1** if fewer than 4 of the 6 areas are covered in the final output
- **D6 drops to 1** if the user challenges a specific requirement and the system claims it was never mentioned
- **D3 drops to 1** if the system enters a stale-state loop (3+ consecutive iterations with no new content) during planning
