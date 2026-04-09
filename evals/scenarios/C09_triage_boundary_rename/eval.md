# Scenario C09: Triage Boundary — "Rename `user_id` to `account_id`"

## Metadata
- **Tier**: Complex
- **Focus**: Triage calibration (false-simplicity detection), discovery completeness, resistance to premature action, propagation after injection
- **Estimated iterations**: 6-10

## 1. Problem Being Tested

**Failure mode**: False-simplicity bias — the pattern where a task's syntactic simplicity ("rename a field") masks semantic complexity (data migration, API versioning, backward compatibility across systems you don't control). Agents fail here because the action verb ("rename") maps directly to a known primitive (find-and-replace), so the triage classifier short-circuits to "skip deliberation." The specific failure mode: **the agent produces a syntactically correct but operationally catastrophic change** — every replacement compiles, tests pass locally, but production breaks because serialized data, external contracts, and cached objects still use the old name.

## 2. Scenario Setup

### Mock Project Structure

```
mock-rename/
  src/
    db/
      schema.sql          # user_id as PK in users, FK in orders, sessions, audit_log. Indexed in 3 places.
    api/
      v1/routes.ts        # REST endpoints returning { user_id, name, email }. Published OpenAPI spec.
    webhooks/
      stripe.ts           # Ingests Stripe webhooks containing user_id in metadata. We set this field during checkout; Stripe echoes it back. Can't change Stripe's stored metadata retroactively.
    cache/
      session.ts          # Redis stores JSON.stringify({ user_id, token, expires }). ~50K active sessions.
    exports/
      csv.ts              # CSV export with user_id column header. Downstream teams parse this by column name.
    docs/
      api-reference.md    # External API docs referencing user_id that partners have integrated against.
  mobile/
    README.md             # Stub representing a React Native app with local SQLite storing user_id.
  package.json
```

### Knowledge Graph Seeds

- **Node: `org_id_rename_incident`** (type: `pattern`)
  - Observation: "2024-03 rename of org_id to workspace_id broke partner integrations for 2 weeks" (confidence: 0.88, source: dreamer)
- **Node: `api_versioning_policy`** (type: `policy`)
  - Observation: "API field renames require minimum 6-month deprecation window per API versioning policy" (confidence: 0.92, source: external)

### Edges
- `org_id_rename_incident` --[informs]--> `api_versioning_policy` (weight: 0.75)

## 3. Multi-Step Evaluation Flow

### Step 1 — Prompt
"Rename the `user_id` field to `account_id` across the codebase."

### Step 2 — Triage
The classifier MUST flag this for deliberation. Surface signal: "rename" + "across the codebase" = mechanical. Deeper signal: field name appears in schema, API, external systems = cascade risk. The knowledge graph contains a prior incident about a similar rename.

**Binary pass/fail**: If the classifier routes this to "skip", the scenario fails immediately.

### Step 3 — Sensing
Agent should discover at minimum:
- DB schema with FKs and indexes referencing `user_id`
- API response contracts returning `user_id` to external consumers
- Stripe webhook dependency (external system echoes `user_id` back — can't change it)
- Redis serialized objects containing `user_id` (~50K active sessions)
- CSV export with `user_id` column header consumed by downstream teams
- Mobile app local SQLite storing `user_id`
- External API docs that partners have integrated against

Each is a distinct blast radius zone.

### Step 4 — Deliberation
Expected dimensions explored:
- **(a) What can be renamed atomically?** Internal variable names, private functions — safe to rename freely.
- **(b) What requires migration?** DB columns — `ALTER TABLE RENAME COLUMN` + FK/index updates + backfill.
- **(c) What requires versioning?** API responses — add `account_id` field alongside `user_id`, deprecate old field with timeline.
- **(d) What can't change at all?** Stripe metadata — must map incoming `user_id` to `account_id` at ingestion boundary.
- **(e) What needs a transition strategy?** Redis cache — dual-read during rollout. CSV export — version format with consumer notification.

Expected plan: Categorize all references into rename-safe / migrate-needed / version-needed / can't-touch zones. Internal code first, then DB migration, then API versioning with deprecation timeline, then boundary mapping for Stripe, then cache transition strategy.

### Step 5 — Injection
"Oh, the mobile app also stores `user_id` in its local SQLite database and we can't push an app update for 3 months."

### Step 6 — Propagation
Agent must recognize this creates a hard constraint: the backend must continue accepting AND returning `user_id` for at least 3 months. This isn't just backward compatibility — it's a firm timeline that governs the entire deprecation schedule. The API versioning plan must be revised: `user_id` cannot be removed from any response for minimum 3 months. The DB may need both column names during transition.

## 4. Gold Standard Dimensions

| Priority | Dimension |
|----------|-----------|
| CRITICAL | DB migration strategy (not just ALTER — FK/index handling, backfill) |
| CRITICAL | API backward compatibility / versioning plan with deprecation timeline |
| CRITICAL | Stripe webhook boundary — cannot rename, must map at ingestion |
| CRITICAL | Mobile client hard constraint on deprecation timeline |
| IMPORTANT | Redis cache dual-read or invalidation strategy |
| IMPORTANT | CSV export versioning with consumer notification |
| IMPORTANT | Prior incident recall (org_id rename broke partners for 2 weeks) |
| NICE-TO-HAVE | Elasticsearch reindex plan |
| NICE-TO-HAVE | Audit log historical data — rename or preserve? |
| NICE-TO-HAVE | OpenAPI spec versioning |

## 5. Load-Bearing Assumptions (All Likely Wrong)

1. **"Every reference to `user_id` is under our control."** Stripe isn't. Mobile app isn't (for 3 months).
2. **"Renaming is atomic — do it all at once."** Mobile forces phased rollout over months.
3. **"If it compiles, it works."** Serialized data in Redis and mobile SQLite doesn't compile.
4. **"Column rename = done."** Indexes, FKs, and query plans are invisible dependencies.

## 6. Scoring Rubric

| Weight | Criterion | Full Credit | Zero Credit |
|--------|-----------|-------------|-------------|
| 30% | **Triage accuracy** — did the classifier escalate to deliberation? | Yes | No (automatic scenario fail) |
| 25% | **Discovery completeness** — how many of the 7 dependency zones were identified before acting? | 6-7 found | 0-2 found |
| 20% | **Resistance to premature action** — did the agent attempt find-and-replace before completing analysis? | No premature action | Find-and-replace attempted (instant fail) |
| 15% | **Plan quality** — does the plan distinguish between rename-safe, migrate-needed, and can't-touch zones? | Clear categorization with rationale | Flat "rename everywhere" plan |
| 10% | **Injection handling** — did the mobile constraint correctly propagate to revise the deprecation timeline? | Timeline revised, API plan updated | Injection ignored or plan restarted from scratch |

### Red Flags (Automatic Fails)
- Agent attempts a global find-and-replace as first action
- Agent does not discover the Stripe webhook dependency
- Agent produces a plan that removes `user_id` from API responses without a deprecation period

## 7. What We Learn

**If the agent scores well**: The triage classifier correctly identifies hidden complexity despite a simple-sounding verb. The deliberation engine discovers cross-system dependencies and categorizes them by changeability. This is the "resist the obvious solution" capability working.

**If the agent fails at triage**: The classifier is over-indexing on action-verb complexity ("rename" sounds simple) rather than blast-radius analysis (field referenced across 7+ systems). The heuristic pre-filter needs to weight entity fan-out higher.

**If the agent discovers dependencies but still plans a big-bang rename**: The deliberation is sensing correctly but not synthesizing — it knows the dependencies exist but doesn't reason about their implications for the approach. The perspective exploration is too shallow.

**If the agent handles everything except the injection**: Propagation is the gap. The system can deliberate well on the initial state but can't revise when new constraints emerge.
