# Scenario C07: Assumption Propagation — Database Migration

## Metadata
- **Tier**: Complex
- **Focus**: Assumption tracking with propagation (broken assumption invalidates downstream decisions), PFC Loop (re-deliberation after injection), Evaluator (detecting stale reasoning after context shift), Graph Activation (prior migration experience retrieval)
- **Estimated iterations**: 10-16

## The Problem Being Tested

**Failure mode**: silent propagation of broken assumptions. An agent makes Decision B on the basis of Assumption A, then makes Decision C on the basis of Decision B. When Assumption A breaks, the agent fixes A but fails to revisit B and C — leaving stale decisions in the plan.

Database migration is ideal for testing this because a single wrong assumption (e.g., "the app uses simple key-value lookups") propagates into schema design, query rewriting, transaction handling, testing strategy, rollback plan, and deployment sequencing. Without deliberation, agents produce plans that are internally consistent but built on sand.

**What goes wrong without deliberation**: the agent generates a plausible-looking migration plan on the first pass, commits to schema decisions based on early assumptions, then discovers mid-execution that those assumptions were wrong — but only patches the immediate failure, leaving downstream decisions silently invalid.

## Setup

### Knowledge Graph State

**Node: `ecommerce_app`** (type: `service`)
- Observation 1: "ecommerce-app is a Python/Django service handling orders, inventory, and user accounts" (confidence: 0.95, source: sensor, createdAt: 2026-03-10)
- Observation 2: "Current database is PostgreSQL 15 on RDS, ~200GB data, 40 tables" (confidence: 0.95, source: sensor, createdAt: 2026-03-10)
- Observation 3: "Application processes ~2000 orders/day with peak at 8000 during sales events" (confidence: 0.9, source: sensor, createdAt: 2026-03-15)

**Node: `pg_usage_patterns`** (type: `concept`)
- Observation 1: "Order processing uses multi-table transactions: order + order_items + inventory decrement in a single ACID transaction" (confidence: 0.95, source: sensor, createdAt: 2026-03-12)
- Observation 2: "Reporting dashboard relies on complex JOINs across orders, users, products, and inventory tables with aggregate functions" (confidence: 0.9, source: sensor, createdAt: 2026-03-12)
- Observation 3: "User accounts have unique constraints on email, foreign keys to orders and reviews" (confidence: 0.92, source: sensor, createdAt: 2026-03-12)
- Observation 4: "The analytics team runs nightly batch queries that JOIN 6+ tables for revenue and cohort reports" (confidence: 0.85, source: sensor, createdAt: 2026-03-20)

**Node: `prior_migration_redis`** (type: `experience`)
- Observation 1: "Last year the team migrated session storage from PostgreSQL to Redis. The migration took 3x longer than estimated because session data had foreign key references to user records that weren't initially accounted for." (confidence: 0.88, source: pfc_inference, createdAt: 2025-09-15)
- Observation 2: "Lesson learned: always map ALL cross-table dependencies before committing to a migration plan" (confidence: 0.9, source: pfc_inference, createdAt: 2025-09-20)

**Node: `mongodb_knowledge`** (type: `technology`)
- Observation 1: "MongoDB uses document model; no native multi-document ACID transactions before v4.0, multi-document transactions available in v4.0+ but with performance overhead" (confidence: 0.93, source: external, createdAt: 2026-01-05)
- Observation 2: "MongoDB does not support JOINs natively; $lookup is available but performs poorly at scale compared to PostgreSQL JOINs" (confidence: 0.9, source: external, createdAt: 2026-01-05)
- Observation 3: "MongoDB excels at flexible schemas, horizontal scaling, and document-oriented access patterns" (confidence: 0.92, source: external, createdAt: 2026-01-05)

**Node: `deployment_infra`** (type: `infrastructure`)
- Observation 1: "Production runs on AWS with blue-green deployment via ECS" (confidence: 0.9, source: sensor, createdAt: 2026-03-01)
- Observation 2: "Current RDS instance is db.r6g.xlarge with Multi-AZ enabled" (confidence: 0.88, source: sensor, createdAt: 2026-03-01)
- Observation 3: "Team has no prior experience operating MongoDB in production" (confidence: 0.8, source: pfc_inference, createdAt: 2026-03-10)

**Edges:**
- `ecommerce_app` --[uses]--> `pg_usage_patterns` (weight: 0.95)
- `ecommerce_app` --[deployed_on]--> `deployment_infra` (weight: 0.85)
- `prior_migration_redis` --[informs]--> `ecommerce_app` (weight: 0.6)
- `mongodb_knowledge` --[alternative_to]--> `pg_usage_patterns` (weight: 0.7)
- `pg_usage_patterns` --[constrains]--> `mongodb_knowledge` (weight: 0.8)

### Effector Simulation

**Effector Call 1: Sense — analyze codebase for PostgreSQL usage patterns**
- Result: `{ success: true, data: { transactionBlocks: 14, joinQueries: 47, uniqueConstraints: 12, foreignKeys: 38, storedProcedures: 0, ormUsage: "Django ORM with raw SQL in 6 places" }, durationMs: 8000 }`

**Effector Call 2: Act — present initial migration plan to user**
- PFC prediction: "User will approve the phased migration plan"
- (Plan is presented; user responds — see Follow-up Responses)

**Effector Call 3: Sense — investigate reporting queries after Injection 1**
- Result: `{ success: true, data: { reportingQueries: 23, avgTablesPerQuery: 4.2, maxTablesPerQuery: 8, scheduledJobs: 3, externalBITools: ["Metabase connected via read replica"], materializedViews: 2 }, durationMs: 5000 }`

**Effector Call 4: Sense — investigate test infrastructure after Injection 2**
- Result: `{ success: true, data: { integrationTests: 142, testsUsingTransactions: 89, testsUsingJoins: 67, testFixtureStrategy: "transaction rollback per test", ciPipelineTimeMinutes: 22 }, durationMs: 4000 }`

## User Goal
Migrate the ecommerce application's database from PostgreSQL to MongoDB. The user expects a comprehensive migration plan with clear phases.

## User Inputs

### Initial Prompt
"We want to migrate our ecommerce app from PostgreSQL to MongoDB. The CTO wants better horizontal scaling for the product catalog. Put together a migration plan."

### Follow-up Responses

- "Good points. The CTO is firm on MongoDB for the product catalog at minimum. Let's figure out the best approach — maybe we don't migrate everything."
- "Looks reasonable. One thing I forgot to mention — our analytics team runs Metabase directly against a read replica. They have about 20 saved dashboards with complex SQL queries. They absolutely cannot lose access during the migration."
- "Also — I just checked with the QA lead and our entire integration test suite uses transaction rollback for test isolation. Every test starts a transaction and rolls it back. If we move anything off PostgreSQL, those tests all break."
- "89 of our 142 integration tests rely on transaction rollback. The QA lead says rewriting them is a 3-4 week effort minimum."
- "This is much more realistic now. Let's go with this."

## Expected Behavior

### Phase 1: Sensing & Initial Deliberation (Iterations 1-3)
- Graph activation retrieves PostgreSQL usage patterns, MongoDB knowledge, AND prior migration experience
- PFC should identify tension: the app uses ACID transactions and JOINs heavily, which are PostgreSQL strengths and MongoDB weaknesses
- PFC should recall the prior Redis migration lesson ("map ALL cross-table dependencies")
- System uses sense effector to analyze codebase
- **Load-bearing assumptions formed here:**
  - A1: "Reporting is handled through the Django ORM within the application" (implicit — no external tools mentioned)
  - A2: "Test infrastructure is database-agnostic and can be adapted independently" (implicit)
  - A3: "A hybrid approach (MongoDB for catalog, PostgreSQL for orders) is feasible" (explicit)

### Phase 2: Initial Plan (Iterations 4-5)
- PFC produces a phased migration plan:
  - Phase 1: Migrate product catalog to MongoDB (flexible schema, read-heavy, few JOINs)
  - Phase 2: Keep orders/inventory on PostgreSQL (ACID transactions critical)
  - Phase 3: Evaluate remaining tables case-by-case
- Plan includes rollback strategy, data sync approach, and timeline
- Prediction: user approves

### Phase 3: Injection 1 — External Analytics Dependency (Iterations 6-8)
- User reveals Metabase connects directly to PostgreSQL read replica with complex SQL dashboards
- **Assumption A1 breaks**: reporting is NOT application-only; external BI tools depend on the SQL interface
- **Required propagation**: the system must trace what A1 invalidates:
  - Schema migration for catalog tables affects Metabase dashboards (those JOINs reference catalog tables)
  - The "migrate catalog first" sequencing assumed no external SQL consumers of catalog data
  - Rollback strategy must now account for Metabase compatibility
  - Timeline estimate is invalid (didn't include dashboard migration work)
- PFC should NOT just add "also migrate Metabase dashboards" as an addendum — it should re-evaluate whether the catalog-first sequencing is still correct given external SQL dependencies

### Phase 4: Revised Plan (Iterations 9-10)
- Plan revises to account for analytics:
  - Add a data synchronization layer or maintain a read replica during migration
  - Adjust sequencing: catalog migration must be coordinated with analytics team
  - Timeline expands
- **New assumptions formed in this revision become vulnerable to Injection 2**

### Phase 5: Injection 2 — Test Infrastructure Coupling (Iterations 11-13)
- User reveals integration tests use PostgreSQL transaction rollback for isolation
- **Assumption A2 breaks**: testing is deeply coupled to PostgreSQL
- **Required second propagation wave — this cascades through ALREADY-REVISED decisions:**
  - The revised timeline (from Phase 4) assumed testing effort was minimal
  - The hybrid approach (A3) now has a testing problem: how do you test code that touches both databases?
  - The phased rollout assumed each phase could be independently validated via existing CI — that assumption is now invalid
  - Rollback strategy assumed tests would catch regressions — but the tests themselves are broken by the migration
- This is the critical test: the system must propagate through decisions that were ALREADY revised once

### Phase 6: Final Plan (Iterations 14-16)
- System produces a final plan that accounts for all three constraint layers:
  - Catalog migration to MongoDB with PostgreSQL read replica maintained for Metabase
  - Test infrastructure rewrite as a prerequisite phase (before any data migration)
  - Revised timeline reflecting the 3-4 week test rewrite
  - Rollback strategy that doesn't depend on the test suite it's currently rewriting
  - Clear dependency graph showing which phases gate which
- Evaluator quenches

## Grading

### Gold Standard Dimensions

| Dimension | Rating | Criteria |
|-----------|--------|----------|
| D1: Goal Decomposition | CRITICAL | Initial plan must decompose into phases. Each injection must trigger goal stack revision, not just addendum. Sub-goals must reflect dependency ordering (test rewrite gates data migration). |
| D2: Retrieval Quality | IMPORTANT | Must retrieve PostgreSQL usage patterns, MongoDB limitations, AND prior migration experience. The Redis migration lesson is a key test of whether the graph informs deliberation. |
| D3: Reasoning Efficiency | IMPORTANT | 10-16 iterations. Under 8 means the system didn't re-deliberate after injections. Over 20 means it's spiraling. Each injection should take 2-4 iterations to propagate through. |
| D4: Prediction Calibration | IMPORTANT | Initial plan confidence should be moderate (hybrid approach is reasonable). Confidence should DROP after each injection reveals hidden complexity. If confidence stays high, the system isn't learning. |
| D5: Reactivation Precision | CRITICAL | After Injection 1: reactivation should target "external SQL consumers", "read replica usage", "Metabase". After Injection 2: "test isolation strategy", "transaction rollback testing", "CI pipeline dependencies". Reactivation must be injection-specific. |
| D6: Self-Correction / Propagation | CRITICAL | **The core test.** After each injection, the system must identify which prior decisions are invalidated — not just the immediately adjacent one, but downstream decisions that depended on the broken assumption. Score 5: full propagation chain traced. Score 3: immediate impact addressed but downstream not revisited. Score 1: injection treated as addendum, no re-deliberation. |
| D7: Memory Hierarchy | NICE-TO-HAVE | Assumptions should be tracked in scratch space. After each injection, scratch should show which assumptions were invalidated and what depends on them. |
| D8: Output Quality | IMPORTANT | Final plan must be structurally different from initial plan (not just the initial plan with patches). Must include dependency ordering, revised timeline, and explicit acknowledgment of what changed and why. |

### Load-Bearing Assumptions (Ranked by Blast Radius)

| Rank | Assumption | Blast Radius | Downstream Dependents |
|------|-----------|--------------|----------------------|
| 1 | A3: Hybrid approach is feasible | Entire plan structure | Schema design, query rewriting, transaction handling, deployment sequencing, rollback, timeline |
| 2 | A1: Reporting is application-only | Phase sequencing, rollback strategy, timeline | Catalog-first ordering, data sync approach, rollback plan, analytics team coordination |
| 3 | A2: Testing is DB-agnostic | Timeline, validation strategy, rollback confidence | CI pipeline, phased rollout validation, rollback verification, test rewrite as prerequisite |
| 4 | "Team can operate MongoDB in production" (implicit) | Operational readiness, timeline | Training needs, monitoring setup, on-call procedures, incident response |
| 5 | "Data can be migrated without downtime" (implicit) | Deployment strategy | Blue-green approach, sync layer design, cutover timing |

### Scoring Rubric

**D6 (Propagation) — detailed partial credit:**

| Score | Behavior |
|-------|----------|
| 5 | After EACH injection: identifies broken assumption, traces full propagation chain (3+ downstream impacts), revises all affected decisions, explains what changed and why |
| 4 | After each injection: identifies broken assumption, traces most downstream impacts (2+), revises most affected decisions |
| 3 | After each injection: identifies broken assumption, addresses immediate impact, but misses 1-2 downstream decisions that silently remain invalid |
| 2 | Addresses injections as addenda ("also, we need to handle Metabase") without re-evaluating prior decisions |
| 1 | Injection acknowledged but prior plan left unchanged; new constraint bolted on without integration |
| 0 | Injection ignored or contradicted |

**Propagation-specific scoring after Injection 1:**
- +1 if system identifies that catalog-first sequencing is affected
- +1 if system identifies that rollback strategy must change
- +1 if system revises timeline estimate
- -1 if system only adds "migrate Metabase dashboards" without revisiting sequencing

**Propagation-specific scoring after Injection 2:**
- +1 if system identifies that the ALREADY-REVISED timeline (from Injection 1 response) is now invalid again
- +1 if system identifies that phased rollout validation depends on the test suite being rewritten first
- +1 if system reorders phases to put test rewrite before data migration
- +1 if system identifies that rollback verification depends on working tests
- -1 if system treats test rewrite as a parallel workstream that doesn't gate anything

### Passing Threshold
Composite score >= 3.5. Must score at least 4 on D6 (Propagation) and at least 3 on D1 (Goal Decomposition) — these are the core tests. Automatic fail if D6 < 3 regardless of composite.

### Red Flags
- **D6 drops to 0** if the system produces a final plan identical in structure to the initial plan with bullet points appended
- **D6 drops to 1** if after Injection 2, the system does not revisit decisions made in response to Injection 1
- **D1 drops to 1** if the system never decomposes the migration into phases, or if phases have no dependency ordering
- **D2 drops to 1** if the prior Redis migration experience is in the graph but never retrieved or referenced
- **D4 drops to 1** if prediction confidence increases after an injection
- **D5 drops to 1** if no reactivation fires after either injection
- **D8 drops to 1** if the final plan contains contradictions (e.g., "rollback by running test suite" when the test suite is being rewritten)

### Dimension Weights
D1: 0.18
D2: 0.10
D3: 0.08
D4: 0.10
D5: 0.15
D6: 0.25
D7: 0.04
D8: 0.10

## What We Learn

This scenario tests **second-order propagation** — something no other scenario in the suite covers. C02 (Cascading Prediction Errors) tests sequential failures where each failure is independent and resolved before the next appears. Here, Injection 2 cascades through decisions that were ALREADY revised by Injection 1, forcing the system to propagate through its own corrections.

Specifically, this proves:
1. **Assumption lineage tracking**: can the system trace which decisions depend on which assumptions?
2. **Re-propagation through revised state**: when a second assumption breaks, does the system correctly invalidate decisions that were products of the first revision (not just the original plan)?
3. **Structural revision vs. addendum**: does the system restructure its plan, or just append new constraints to a stale skeleton?

A system that scores 5 on D6 here has demonstrated that it maintains a live dependency graph between assumptions and decisions, and can walk that graph backward when an assumption is falsified. This is the difference between deliberation and autocompletion.
