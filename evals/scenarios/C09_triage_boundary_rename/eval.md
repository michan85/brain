# Scenario C09: Triage Boundary — "Rename `user_id` to `account_id`"

## Metadata
- **Tier**: Complex
- **Focus**: Triage calibration (false-simplicity detection), discovery completeness, resistance to premature action, propagation after injection
- **Estimated iterations**: 6-10

## Setup

The knowledge graph contains two nodes: a prior incident where renaming `org_id` to `workspace_id` broke partner integrations for 2 weeks (2024-03), and the API versioning policy requiring a 6-month deprecation window for field renames. These are connected by an `informs` edge.

The `setup.ts` copies a mock multi-system project to `/tmp/brain-eval-c09/mock-rename/`. The project contains 7 distinct dependency zones where `user_id` appears:

1. **DB schema** (`src/db/schema.sql`) — `user_id` as PK in `users`, FK in `orders`, `sessions`, `audit_log`. Multiple indexes.
2. **REST API** (`src/api/v1/routes.ts`) — endpoints returning `{ user_id, name, email }` to external consumers.
3. **Stripe webhooks** (`src/webhooks/stripe.ts`) — Stripe echoes `user_id` in webhook metadata. Cannot change Stripe's stored metadata retroactively.
4. **Redis cache** (`src/cache/session.ts`) — `JSON.stringify({ user_id, token, expires })` with ~50K active sessions.
5. **CSV export** (`src/exports/csv.ts`) — `user_id` column header consumed by downstream teams.
6. **External API docs** (`src/docs/api-reference.md`) — partners have integrated against documented `user_id` field.
7. **Mobile app** (`mobile/README.md`) — React Native app with local SQLite storing `user_id`.

## Problem Being Tested

**Failure mode**: False-simplicity bias — the pattern where a task's syntactic simplicity ("rename a field") masks semantic complexity (data migration, API versioning, backward compatibility across systems you don't control). Agents fail here because the action verb ("rename") maps directly to a known primitive (find-and-replace), so the triage classifier short-circuits to "skip deliberation."

The specific failure mode: **the agent produces a syntactically correct but operationally catastrophic change** — every replacement compiles, tests pass locally, but production breaks because serialized data, external contracts, and cached objects still use the old name.

## User Goal

Rename the `user_id` field to `account_id` across the codebase. The user expects a comprehensive plan that accounts for all dependency zones, not a naive find-and-replace.

## User Inputs

### Initial Prompt
"Rename the `user_id` field to `account_id` across the codebase."

### Follow-up Responses

- "Oh, the mobile app also stores `user_id` in its local SQLite database and we can't push an app update for 3 months."
- "Good catch. Yes, the Stripe metadata is set during checkout and Stripe echoes it back — we can't change what's already stored there."
- "The downstream teams consuming the CSV export parse by column name. About 8 teams use it for their monthly reporting."

## Expected Behavior

### Phase 1: Triage (Iteration 1)
The classifier MUST flag this for deliberation. Surface signal: "rename" + "across the codebase" = mechanical. Deeper signal: field name appears in schema, API, external systems = cascade risk. The knowledge graph contains a prior incident about a similar rename.

**Binary pass/fail**: If the classifier routes this to "skip", the scenario fails immediately.

### Phase 2: Sensing (Iterations 2-3)
Agent should discover at minimum:
- DB schema with FKs and indexes referencing `user_id`
- API response contracts returning `user_id` to external consumers
- Stripe webhook dependency (external system echoes `user_id` back — can't change it)
- Redis serialized objects containing `user_id` (~50K active sessions)
- CSV export with `user_id` column header consumed by downstream teams
- Mobile app local SQLite storing `user_id`
- External API docs that partners have integrated against

Each is a distinct blast radius zone.

### Phase 3: Deliberation (Iterations 4-6)
Expected dimensions explored:
- **(a) What can be renamed atomically?** Internal variable names, private functions — safe to rename freely.
- **(b) What requires migration?** DB columns — `ALTER TABLE RENAME COLUMN` + FK/index updates + backfill.
- **(c) What requires versioning?** API responses — add `account_id` field alongside `user_id`, deprecate old field with timeline.
- **(d) What can't change at all?** Stripe metadata — must map incoming `user_id` to `account_id` at ingestion boundary.
- **(e) What needs a transition strategy?** Redis cache — dual-read during rollout. CSV export — version format with consumer notification.

Expected plan: Categorize all references into rename-safe / migrate-needed / version-needed / can't-touch zones. Internal code first, then DB migration, then API versioning with deprecation timeline, then boundary mapping for Stripe, then cache transition strategy.

### Phase 4: Injection Handling (Iterations 7-8)
The mobile constraint creates a hard timeline: the backend must continue accepting AND returning `user_id` for at least 3 months. This isn't just backward compatibility — it's a firm timeline that governs the entire deprecation schedule. The API versioning plan must be revised: `user_id` cannot be removed from any response for minimum 3 months. The DB may need both column names during transition.

### Phase 5: Final Plan (Iterations 9-10)
Agent produces a categorized migration plan with:
- Clear zones: rename-safe, migrate-needed, version-needed, can't-touch
- Phased timeline governed by the 3-month mobile constraint
- Stripe boundary mapping strategy
- Redis cache dual-read/invalidation approach
- CSV export versioning with consumer notification plan
- Reference to the prior org_id rename incident as cautionary precedent

## Grading

### Gold Standard Dimensions

| Priority | Dimension |
|----------|-----------|
| CRITICAL | Triage escalation — agent must NOT attempt find-and-replace |
| CRITICAL | DB migration strategy (not just ALTER — FK/index handling, backfill) |
| CRITICAL | API backward compatibility / versioning plan with deprecation timeline |
| CRITICAL | Stripe webhook boundary — cannot rename, must map at ingestion |
| CRITICAL | Mobile client hard constraint on deprecation timeline |
| IMPORTANT | Redis cache dual-read or invalidation strategy |
| IMPORTANT | CSV export versioning with consumer notification |
| IMPORTANT | Prior incident recall (org_id rename broke partners for 2 weeks) |
| NICE-TO-HAVE | Audit log historical data — rename or preserve? |
| NICE-TO-HAVE | OpenAPI spec versioning |

### Load-Bearing Assumptions (All Likely Wrong)

1. **"Every reference to `user_id` is under our control."** Stripe isn't. Mobile app isn't (for 3 months).
2. **"Renaming is atomic — do it all at once."** Mobile forces phased rollout over months.
3. **"If it compiles, it works."** Serialized data in Redis and mobile SQLite doesn't compile.
4. **"Column rename = done."** Indexes, FKs, and query plans are invisible dependencies.

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good" looks like here |
|-----------|----------------|---------------------------|
| D1: Goal Decomposition | 0.20 | Plan decomposes into categorized zones (rename-safe, migrate, version, can't-touch) with dependency ordering. Triage correctly escalates to deliberation. Score 5 if zones are clearly articulated with rationale. Score 1 if agent produces a flat "rename everywhere" plan. |
| D2: Retrieval Quality | 0.20 | Agent discovers 6-7 of the 7 dependency zones before proposing any action. Prior org_id rename incident is retrieved from graph and referenced. Score 5 if all zones found plus incident recall. Score 1 if 0-2 zones found. |
| D3: Reasoning Efficiency | 0.05 | 6-10 iterations. Under 5 means insufficient exploration. Over 14 means spiraling. |
| D4: Prediction Calibration | 0.15 | Agent resists premature action. Does NOT attempt find-and-replace before completing analysis. Confidence should be moderate (rename is complex). Score 5 if agent explicitly pauses to analyze before acting. Score 1 if find-and-replace attempted as first action (automatic fail). |
| D5: Reactivation Precision | 0.05 | After mobile injection, reactivation should target deprecation timeline, API versioning, backward compatibility nodes. |
| D6: Self-Correction | 0.15 | Mobile constraint correctly propagates to revise the deprecation timeline and API plan. Score 5 if timeline revised and API plan updated with 3-month minimum. Score 3 if injection acknowledged but plan not materially revised. Score 1 if injection ignored or plan restarted from scratch. |
| D7: Memory Hierarchy | 0.05 | Dependency zones tracked in scratch space. Graph consulted for prior incidents. |
| D8: Output Quality | 0.15 | Final plan distinguishes between rename-safe, migrate-needed, version-needed, and can't-touch zones. Includes phased timeline, Stripe boundary strategy, and consumer notification plan. Score 5 if plan is comprehensive and actionable. Score 1 if output is a flat list of files to rename. |

### Dimension Weights
D1: 0.20
D2: 0.20
D3: 0.05
D4: 0.15
D5: 0.05
D6: 0.15
D7: 0.05
D8: 0.15

### Passing Threshold
Composite score >= 3.5. Must score at least 4 on D1 (Goal Decomposition) and at least 3 on D4 (Prediction Calibration). Automatic fail if D4 < 2 regardless of composite.

### Red Flags
- Agent attempts a global find-and-replace as first action (automatic D4 = 1)
- Agent does not discover the Stripe webhook dependency (D2 capped at 2)
- Agent produces a plan that removes `user_id` from API responses without a deprecation period (D1 capped at 2)
- Agent ignores the mobile app injection entirely (D6 = 1)
- Agent does not retrieve or reference the prior org_id rename incident from the graph (D2 penalty: -1)
- Agent proposes renaming Stripe metadata (misunderstands external system boundary)

## What We Learn

**If the agent scores well**: The triage classifier correctly identifies hidden complexity despite a simple-sounding verb. The deliberation engine discovers cross-system dependencies and categorizes them by changeability. This is the "resist the obvious solution" capability working.

**If the agent fails at triage**: The classifier is over-indexing on action-verb complexity ("rename" sounds simple) rather than blast-radius analysis (field referenced across 7+ systems). The heuristic pre-filter needs to weight entity fan-out higher.

**If the agent discovers dependencies but still plans a big-bang rename**: The deliberation is sensing correctly but not synthesizing — it knows the dependencies exist but doesn't reason about their implications for the approach. The perspective exploration is too shallow.

**If the agent handles everything except the injection**: Propagation is the gap. The system can deliberate well on the initial state but can't revise when new constraints emerge.
