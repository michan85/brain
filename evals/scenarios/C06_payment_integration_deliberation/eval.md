# Scenario C06: Payment Integration Deliberation

## Metadata
- **Tier**: Complex
- **Focus**: Assumption tracking (load-bearing assumption identification), multi-perspective formation (security/UX/compliance/architecture), mid-task injection response (requirements change), error compounding prevention
- **Estimated iterations**: 8-14

## Setup
The knowledge graph contains three clusters: existing architecture (auth, user model, API patterns), prior integration lessons (Stripe webhooks, idempotency, PCI compliance), and business context (pricing model, launch timeline). A mock SaaS project is staged at `/tmp/brain-eval-c06/mock-saas/` with existing source files that reveal architectural constraints (no webhook infra, no billing fields, no RBAC, no Stripe deps).

### Staged Context
Run `setup.ts` before executing. Files are staged to `/tmp/brain-eval-c06/mock-saas/`.

Scratch space is empty.

## User Inputs

### Initial Prompt
"We need to add payment processing to the app. Users should be able to subscribe to the pro plan and manage their billing. Use Stripe."

### Follow-up Responses
- "Actually, the CEO just confirmed we're going usage-based. Pro plan will be $0.01 per API call above 1000/month instead of flat $10/month."
- "No, we haven't done a PCI audit before."
- "The usage_events table tracks all API calls already, yes."

## Problem Being Tested

**Failure mode**: Agents jump from "add payments" straight to "install Stripe SDK, create checkout endpoint" without surfacing the assumptions that make or break the integration. A normal agent treats this as a coding task. It is actually a *decision field* with hidden coupling between security, compliance, data modeling, and existing architecture.

**Blind spots we are testing for**:
- PCI compliance implications are invisible until you ask about them
- Existing auth/session architecture constrains payment flow design
- Idempotency and failure handling are not in the prompt but dominate production correctness
- A mid-task pricing model change (flat-fee to usage-based) invalidates upstream decisions about when and how to charge

An agent without deliberation will produce working code that fails its first audit or its first double-charge incident.

## Expected Behavior

### Sense/Discovery (Iterations 1-3)
The agent should:
- Activate all three clusters (architecture + lessons + business context)
- Read existing codebase files via `sense`/`readFile` to confirm graph observations
- Discover the missing webhook infrastructure, missing billing fields, missing RBAC
- Surface the low-confidence observation about usage-based pricing as an unresolved ambiguity

### Deliberation Output (Iterations 3-6)
Expected perspectives:
- **Security/Compliance**: PCI scope, webhook verification, token storage
- **Data Architecture**: Schema migrations, Stripe customer ID mapping, subscription state machine
- **UX Flow**: Checkout vs embedded elements, upgrade/downgrade/cancel flows, billing portal
- **Operational**: Idempotency, webhook retry handling, failure modes, testing in Stripe test mode

Expected assumptions surfaced:
- "Pricing model is flat monthly fee" (confidence: moderate, CEO quote is low-confidence)
- "We will use Stripe Checkout (hosted) to stay PCI SAQ-A" (decision, not assumption)
- "Webhook infrastructure must be built from scratch" (confirmed by codebase investigation)
- "No RBAC means any authenticated user can manage any subscription" (security gap)

Expected plan: schema migration first, then Stripe customer creation on signup, then checkout session endpoint, then webhook handler, then billing portal link.

### Response to Injection (Iterations 8-10)
After receiving the usage-based pricing change, the agent should:
- Identify which decisions are invalidated (checkout flow changes, need metered billing, usage_events table becomes billing-critical)
- Identify which decisions survive (webhook infra, Stripe customer mapping, PCI scope, idempotency)
- NOT restart from scratch
- Revise the plan: add Stripe metered subscription setup, usage reporting endpoint, billing period aggregation
- Flag new assumption: "usage_events table accurately tracks all billable API calls" (high blast radius if wrong)

### Task Complete
- Revised plan accounts for usage-based billing
- Schema migration includes metered subscription fields
- Webhook handler covers `invoice.created`, `invoice.payment_failed` (not just `checkout.session.completed`)
- The agent explicitly states which parts of the original plan survived and which were replaced

## Gold Standard Dimensions

### CRITICAL (missing this causes real damage)
- PCI compliance scope decision (SAQ-A via Checkout/Elements, never handle raw cards)
- Webhook signature verification (forged events = financial fraud)
- Idempotency keys on charge-creating endpoints (double charges)
- Stripe customer ID stored on user model (orphaned subscriptions)
- Usage-based billing invalidates flat-fee checkout flow (post-injection)

### IMPORTANT (missing this causes technical debt)
- Schema migration plan (billing fields, subscription state)
- Webhook retry/dedup handling (at-least-once delivery)
- Subscription state machine (active/past_due/canceled/trialing)
- Test mode strategy (Stripe test keys, clock simulation)
- RBAC gap: any user can hit billing endpoints for any user

### NICE-TO-HAVE (thorough but not essential)
- Billing portal for self-serve invoice access
- Proration handling for mid-cycle plan changes
- Tax calculation (Stripe Tax)
- Multi-currency support
- Dunning email configuration

## Load-Bearing Assumptions (ranked by blast radius)

1. **"Pricing model is flat monthly fee"** -- Blast radius: TOTAL. Invalidated by injection. Every checkout/subscription endpoint changes. The agent that tracked this assumption adapts; the agent that buried it restarts.
2. **"Stripe Checkout keeps us PCI SAQ-A"** -- Blast radius: HIGH. If wrong (someone builds a custom card form), triggers a full PCI audit. Blocks launch.
3. **"usage_events table is the source of truth for billable calls"** -- Blast radius: HIGH (post-injection). If usage_events misses calls or double-counts, every invoice is wrong.
4. **"Webhook delivery is at-least-once"** -- Blast radius: MEDIUM. If the handler is not idempotent, duplicate events cause duplicate state transitions.
5. **"No RBAC needed for billing endpoints"** -- Blast radius: MEDIUM. Any authenticated user can view/modify any other user's subscription.

## Grading

### Scoring Rubric

| Dimension | Full Credit (5) | Partial Credit (3) | Zero Credit (1) | Weight |
|-----------|----------------|-------------------|-----------------|--------|
| D1: Goal Decomposition | Decomposes into security, data, UX, and operational sub-goals before coding | Identifies 2 of 4 dimensions | Jumps straight to "install stripe, create endpoint" | 0.15 |
| D2: Retrieval Quality | All 3 clusters activate; prior lessons (idempotency, webhook) inform the plan | 2 clusters activate; some lessons used | Only architecture cluster; lessons ignored | 0.15 |
| D3: Assumption Tracking | Explicitly names 3+ load-bearing assumptions with confidence levels | Notes pricing uncertainty but does not track formally | No assumptions surfaced | 0.20 |
| D4: Injection Response | Identifies what survives vs what is invalidated; revises without restarting | Acknowledges the change; partially revises | Ignores the injection or restarts from scratch | 0.20 |
| D5: Security/Compliance | PCI scope decision, webhook verification, idempotency all present | 2 of 3 present | None mentioned | 0.15 |
| D6: Prior Lesson Application | Both stripe_integration_lesson and idempotency_lesson observations appear in reasoning | One lesson referenced | Graph lessons completely ignored | 0.10 |
| D7: Output Quality | Sequenced plan with rationale, tradeoffs noted, assumptions explicit | Plan exists but missing rationale or assumptions | Flat task list with no reasoning visible | 0.05 |

**"Considered but deferred"** (e.g., "Tax calculation is out of scope for v1 but should be addressed before international launch") scores the same as "addressed" for NICE-TO-HAVE items. **"Completely missed"** means the dimension never appears in reasoning, scratch space, or output.

### Dimension Weights
D1: 0.15, D2: 0.15, D3: 0.20, D4: 0.20, D5: 0.15, D6: 0.10, D7: 0.05, D8: 0.00

### Passing Threshold
Composite >= 3.5. Must score >= 3 on D3 (Assumption Tracking) and >= 3 on D4 (Injection Response) -- these are the deliberation-specific dimensions. Failure on either is automatic fail.

### Red Flags
- **D3 drops to 1** if the pricing model uncertainty is never surfaced despite the low-confidence graph observation
- **D4 drops to 1** if the agent's response to the usage-based injection does not reference any prior decisions that need revision
- **D5 drops to 1** if the plan includes handling raw card numbers or skips webhook verification

## What We Learn

**If the agent scores well**: The deliberation engine successfully forces exploration of non-obvious dimensions (compliance, idempotency) that live in the knowledge graph but are not in the prompt. It tracks assumptions with enough fidelity to perform surgical revision when requirements change mid-task. This is the core value proposition working.

**If the agent scores poorly on D3/D4 but well on D1/D2**: The graph retrieval works (context is present) but the PFC does not synthesize it into trackable assumptions. The deliberation layer is *finding* relevant knowledge but not *reasoning* over it structurally. Fix: the PFC prompt needs explicit assumption-extraction instructions.

**If the agent scores poorly on D2**: The graph activation is failing to pull in the "prior lessons" cluster, meaning cross-cluster edge weights or seed selection are too narrow. The deliberation engine cannot catch blind spots it never retrieves.

**If the agent scores poorly on D4 specifically**: The system lacks a mechanism to map incoming information against existing assumptions and propagate invalidation. This is the hardest capability -- it requires maintaining a dependency graph between assumptions and decisions, not just a flat plan.
