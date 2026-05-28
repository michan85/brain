# Deliberation Engine: Implementation Description

This document describes the deliberation engine as it will be implemented within the brain architecture. It supersedes the exploratory analysis in `archive/deliberation-options.md` (which evaluated Options A, B, and C) and focuses exclusively on the chosen path: **Option C — deliberation as a new effector**.

For the product vision, problem statement, and neuroscience grounding, see `01-vision.md`.

---

## Architecture: Deliberation as an Effector

Deliberation is a new effector type alongside the existing `sense`, `act`, and `respond`. When the PFC loop encounters a task that warrants rigorous reasoning, it triggers the `deliberate` effector, which runs its own inner loop and returns a structured `DeliberationResult` — decisions with tracked assumptions, a dependency-aware plan, and verifiable assertions.

The PFC loop is unchanged. It already decides when to use effectors. The only additions are:
- A new effector registration in `effectors.ts`
- A new effector description in the PFC prompt (`prompts.ts`)
- The deliberation implementation itself (`deliberate.ts`)
- New type definitions (`types.ts`)

### Where Deliberation Sits

```
PFC Loop
  ├── respond  (communicate to user)
  ├── sense    (investigate / gather information)
  ├── act      (execute / change the world)
  └── deliberate (explore, decide, plan — then PFC executes via sense/act)
```

Deliberation is *above* sense and act in the hierarchy. The deliberation inner loop can call sense ("read the project and tell me what auth exists") and act ("send an email to clarify requirements") as part of its exploration. It returns a plan whose steps are executed by the PFC via sense and act.

### The Deliberation Inner Loop

```
Receive task from PFC
  → Sense current state (what exists? what's the context?)
  → Query knowledge graph (what do I know? prior lessons?)
  → Explore perspectives (what dimensions matter?)
  → Synthesize (where do perspectives converge/diverge?)
  → Need more info? → Sense/Act → back to Explore
  → Commit decisions (with assumptions, alternatives, cost-of-wrong)
  → Formulate plan (ordered steps with preconditions + assertions)
  → Converged? → Return DeliberationResult to PFC
```

---

## Triage: When to Deliberate

Not every task warrants deliberation. A two-stage gate classifies tasks before the PFC loop begins.

### Stage 1: Heuristic Pre-filter (< 50ms)

Score weighted signals:
- Input length and complexity
- Entity count (from existing sensor)
- Systems/files referenced
- Ambiguity markers ("should", "best way", "how to approach", "design")
- Prior failure rate for similar tasks (knowledge graph lookup)
- Scope keywords ("refactor", "migrate", "redesign", "across")
- Estimated files touched

Fast exits:
- Score < 0.25 → **skip** (just execute)
- Score > 0.65 → **full** deliberation
- Between → proceed to Stage 2

### Stage 2: Fast LLM Classification (< 1.5s)

Single call to a fast model (Haiku-class), structured output:

```json
{ "level": "skip" | "light" | "full", "confidence": 0.0-1.0, "reasoning": "..." }
```

### Three Levels

| Level | What happens | Example |
|-------|-------------|---------|
| **skip** | Execute immediately, no deliberation | Fix typo, add import, rename variable |
| **light** | One deliberation pass: state goal, identify top risks, then execute | Add feature to existing pattern, write a test |
| **full** | Iterative deliberation with perspective exploration | Architecture, cross-system changes, security-adjacent work |

### User Override

- "just do it" / "quick" / `!` prefix → force skip
- "think about this" / "be careful" / `?` prefix → force full
- Overrides bypass both stages

### Learning

After every task, record the triage classification and outcome. If a skipped task failed or required correction, increase matching signal weights. The triage model improves with use. Error costs are asymmetric: unnecessary deliberation costs 30 seconds; skipping deliberation on a complex task costs 10x in compounding errors. So the ambiguous band defaults to deliberation.

---

## Data Model

### Core Types

```typescript
interface Assumption {
  claim: string;
  confidence: number;           // 0-1 (precision-weighting: high confidence = deep propagation if broken)
  costIfWrong: "low" | "medium" | "high" | "critical";
  validationMethod?: string;    // how to check this assumption
}

interface Alternative {
  description: string;
  tradeoff: string;             // why this wasn't chosen
}

interface Decision {
  id: string;
  what: string;                 // the decision
  why: string;                  // reasoning
  assumptions: Assumption[];
  alternatives: Alternative[];
  dependsOn?: string[];         // IDs of decisions this one depends on
}

interface Assertion {
  claim: string;                // provably true or false statement
  verificationCommand?: string; // optional: a command/test that checks this
}

interface PlanStep {
  order: number;
  action: string;               // what to do
  effector: "sense" | "act" | "respond";
  rationale: string;
  dependsOnSteps?: number[];    // step orders this blocks on
  dependsOnDecisions?: string[];// decision IDs this step rests on
  assertions: Assertion[];      // conditions that must be true when this step completes
  status: "pending" | "executing" | "completed" | "invalidated";
}

interface DeliberationResult {
  summary: string;
  decisions: Decision[];
  plan: PlanStep[];
  risks: string[];              // top 3-5 risks, plain text
  confidence: number;           // overall 0-1
}
```

### Decision Graph (V1+)

V0 does not persist decisions. The `DeliberationResult` lives in working memory for the duration of the task. In V1, decisions are stored in SQLite:

```sql
decisions(id, task_id, parent_id, statement, reasoning, assumptions JSON,
          alternatives JSON, cost_of_wrong TEXT,
          status ENUM(active|invalidated|superseded), created_at)

decision_deps(decision_id, depends_on_decision_id)

assumption_checks(decision_id, assumption_index, checked_at, held BOOLEAN, evidence TEXT)
```

Propagation is a recursive CTE on `decision_deps`. When an assumption fails, find the decision, walk forward through dependencies, mark descendants as invalidated. This is a query, not a graph traversal algorithm. The decision graph is task-scoped and short-lived — archived or consolidated into the knowledge graph after convergence.

---

## Validation: Assertions, Not Reviews

Validation is the highest-risk component. An LLM reviewing another LLM's general work is unreliable. Instead, validation is based on **assertions** — specific, provably true-or-false conditions produced during deliberation.

Each plan step carries assertions:
- "The `users` table has a `password_hash` column"
- "The `/login` route returns 401 on invalid credentials"
- "The password reset email is sent within 5 seconds"

The validator receives **limited, scoped context** with specific verification instructions — not the full deliberation history. This is an air-gapped check: a separate task with narrow scope. The validator doesn't know what the agent was trying to do overall. It only knows what conditions must be true.

Where possible, assertions map to executable checks (a test, a query, a command). Where they can't be automated, they're flagged for human review.

### Precision-Weighted Propagation

Not all assumption violations are equal. Each assumption carries a `confidence` score. When a high-confidence assumption breaks, it triggers deep propagation — re-deliberation of all downstream decisions. When a low-confidence / speculative assumption breaks, it triggers light re-evaluation — a check of whether downstream decisions are actually affected, without full re-deliberation.

This is borrowed from active inference (precision-weighting on prediction errors) and is the mechanism that makes convergence decisions concrete rather than hand-wavy.

---

## Perspectives

### V0: Generated by One LLM Call

The deliberation prompt includes canonical categories as scaffold (user experience, security, maintainability, performance, operations) but the model chooses which are relevant for the current task and can add domain-specific ones. One call generates all perspectives, one call synthesizes them into decisions.

### V1: Perspectives With Memory

Perspectives develop their own accumulated memories and identities. When the "security" perspective is activated, it carries lessons from prior security-related deliberations: "last time we forgot session revocation," "JWT token size was a problem in project X." Perspectives become a mix of generated (from the current task) and recalled (from experience).

### V1+: Parallel Perspective Agents

When evidence shows that perspective quality improves with isolation (different system prompts produce meaningfully different findings), perspectives are spawned as parallel LLM calls. This is an optimization, not a V0 requirement.

---

## User Experience

### Principle: Quiet by Default, Loud Only When Judgment Is Needed

**Skip tasks:** No UI. The agent just acts.

**Light tasks:** One-liner rationale, then acts.

**Full tasks:** Collapsible summary → approval gate → step-by-step execution.

### During Deliberation

```
⠋ Deliberating...  [security] [engineering] [ops]  3 perspectives explored
```

Single live-updating line. Perspective tags appear as each completes. Collapses to summary when done.

### Approval Gate

```
Plan (3 steps):
  1. Add migration for user_preferences table
  2. Update UserService to read new columns          ⚠ assumes existing tests cover service
  3. Add API endpoint /preferences

  Assumptions: [a]  Alternatives: [alt]  Cost of wrong: low

  [enter] approve  [e] edit  [r] reject  [1-3] inspect step
```

Single keypress to approve. Assumptions and alternatives hidden behind hotkeys. Step numbers to inspect preconditions and assertions.

### During Execution

```
[1/3] ✓ Migration created
[2/3] ⠋ Updating UserService...
```

Validations pass silently. Failures interrupt with context:

```
[2/3] ✗ Assertion failed: expected UserService.getPreferences to exist
       Assumption broken: "existing tests cover service" — they don't test this path

  [f] fix and continue  [s] skip assertion  [p] show plan  [q] abort
```

### Post-Task Feedback

```
Task complete. [enter] done  [f] feedback
```

Structured feedback: missed something / overkill / wrong emphasis / good. Feeds back into triage model and knowledge graph.

### Project Configuration

`.deliberation` file for project-level defaults:

```yaml
defaults:
  skip_perspectives: [ops]       # this is a prototype
  auto_approve: light            # only gate on full deliberation
  cost_threshold: medium         # don't interrupt for low cost-of-wrong
```

---

## Evaluation

See `01-vision.md` for the full evaluation philosophy. Key points:

### Scoring Axes

| Axis | What it measures |
|------|-----------------|
| Coverage | Fraction of relevant dimensions explored vs. gold-standard checklist |
| Assumption Quality | Precision/recall of load-bearing assumptions (precision-weighted) |
| Plan Coherence | Are preconditions necessary? Are assertions verifiable? |
| Propagation Correctness | After injected change, fraction of invalidated decisions correctly identified |

### Scenario Design

Each eval scenario defines:
1. A task with hidden complexity
2. A gold-standard dimension checklist (questions that should have been considered)
3. Load-bearing assumptions ranked by blast radius
4. An injection point (mid-task change) and expected invalidation set

Example scenarios:
- **"Add Stripe payments to a SaaS app"** — gold dimensions include idempotency, webhook reliability, failed payment retry, subscription state machine, PCI scope, currency, tax, refunds. Injection: "also support PayPal" — should invalidate payment abstraction, not UI decisions.
- **"Build a caching layer"** — gold dimensions include invalidation strategy, thundering herd, memory bounds, consistency model. Injection: "data changes every 30 seconds" — should invalidate TTL assumptions and potentially the entire caching rationale.
- **"Migrate REST to GraphQL"** — gold dimensions include N+1 queries, per-field authorization, breaking clients, schema evolution. Injection: "mobile clients can't update for 6 months" — should require backward compatibility decisions.

### Measuring the Negative

The core evaluation challenge is measuring what was *not* thought about. Partial credit scoring:
- Dimension mentioned + correctly assessed: 1.0
- Dimension mentioned + poorly assessed: 0.5
- Dimension implicitly handled by a broader concern: 0.3
- Dimension completely absent: 0.0

### Learning Metric

**Novel blind spot rate**: on never-seen-before scenarios, what fraction of gold dimensions does the system find? This curve over time is the system's actual learning rate.

---

## V0 Scope

### What Gets Built

| File | Change | Lines |
|------|--------|-------|
| `src/types.ts` | Add deliberation interfaces (Decision, Assumption, PlanStep, etc.) | ~30 |
| `src/deliberate.ts` | **New.** Deliberation effector: one structured LLM call, JSON parsing, result formatting | ~150-200 |
| `src/effectors.ts` | Register deliberate effector | ~2 |
| `src/prompts.ts` | Add deliberate effector description to PFC prompt | ~5 |
| `src/deliberate.test.ts` | **New.** 2-3 test scenarios | ~80 |

### What's Explicitly Out of Scope (V1+)

- Decision graph persistence (SQLite storage)
- Assumption propagation (cascading invalidation)
- Parallel perspective agents
- User approval gate (blocking execution until confirm)
- Re-deliberation triggers (auto re-plan on step failure)
- Triage classifier (V0 relies on PFC judgment)
- Somatic markers / RDS
- Confidence decay
- Plan versioning
- MCP server interface

### Build Estimate

- **Day 1:** Types + `deliberate.ts` + effector registration
- **Day 2:** PFC prompt update + tests + manual REPL testing
- **Day 3 (buffer):** Prompt tuning, eval scenario, edge case fixes

---

## Evolution Path

### V0 — Prove the Model

**Goal:** Demonstrate that a structured deliberation step produces meaningfully better reasoning than going straight to execution. The minimum viable test of the core thesis.

**What it does:**
- Single structured LLM call that takes a task + context and produces a `DeliberationResult`
- PFC decides when to trigger deliberation (no triage classifier — relies on PFC judgment)
- Result lives in working memory only (no persistence)
- PFC executes the plan steps sequentially via existing sense/act effectors
- No user approval gate — the plan is shown but execution isn't blocked

**What it proves:**
- Does forcing explicit assumptions and alternatives improve output quality?
- Does the PFC correctly identify when to deliberate vs. when to act directly?
- Are the produced assumptions real (load-bearing) or plausible-sounding (decorative)?

**The prompt at this stage:** One system prompt that instructs the LLM to decompose a task into decisions with assumptions, generate perspectives relevant to the task, and produce an ordered plan. The prompt includes canonical perspective categories as scaffold. Output is structured JSON matching `DeliberationResult`.

---

### V1 — Make It Durable and Gated

**Goal:** Decisions persist across the session. The user has a say before execution begins. Triage prevents deliberation on simple tasks.

**What it adds:**
- **Decision graph in SQLite** — `decisions`, `decision_deps`, `assumption_checks` tables. Decisions survive beyond working memory. Can be queried during execution.
- **Triage classifier** — two-stage gate (heuristic pre-filter + fast LLM fallback). Three levels: skip / light / full. User overrides.
- **Assertion-based validation** — each plan step carries assertions. After execution, an air-gapped validator checks assertions against reality with limited context. Failed assertions flag the specific assumption that broke.
- **User approval gate** — before execution, the plan is shown and the user approves, edits, or rejects via single-keypress interface. Auto-approve for light tasks (configurable).
- **Post-task feedback** — structured feedback (missed something / overkill / wrong emphasis / good) feeds into triage weights and knowledge graph.

**What it proves:**
- Does triage correctly sort tasks? (Measure: false-skip rate vs. false-deliberate rate)
- Do assertions catch real failures? (Measure: assertion failure → actual broken assumption correlation)
- Does user feedback improve triage accuracy over time?

**The prompt evolves:** Deliberation prompt now explicitly requires assertions per plan step — "for each step, state what must be provably true when it completes." The validator gets a separate, narrow prompt: "Given these assertions and this code/output, which are true and which are false? Do not speculate."

---

### V2 — Propagation and Re-Deliberation

**Goal:** When an assumption breaks mid-execution, the system traces the impact and re-deliberates only what's affected.

**What it adds:**
- **Propagation logic** — recursive CTE on `decision_deps`. When an assertion fails and an assumption is broken: find the decision, walk dependencies forward, mark downstream decisions as invalidated, flag affected plan steps.
- **Precision-weighted re-deliberation** — high-confidence assumption breaking triggers deep propagation and full re-deliberation of affected subtree. Low-confidence assumption breaking triggers light re-evaluation (check if downstream decisions are actually affected).
- **Perspectives with memory** — when a perspective is activated (e.g., "security"), it carries lessons from prior security-related deliberations. Perspectives query the knowledge graph for domain-specific prior experience.
- **Scoped re-deliberation** — when propagation invalidates plan steps, only the affected portion is re-deliberated. Unaffected decisions and steps are preserved. The re-deliberation prompt receives the original decisions, the broken assumption, and the invalidated subtree.

**What it proves:**
- Does propagation correctly identify the blast radius of a broken assumption?
- Does precision-weighting reduce unnecessary re-deliberation?
- Do perspectives with memory produce better coverage than perspectives without?

---

### V3 — Learning and Intuition

**Goal:** The system develops experiential intuition and gets measurably better over time.

**What it adds:**
- **Parallel perspective agents** — when evidence shows isolation improves perspective quality, perspectives are spawned as separate LLM calls with different system prompts. Findings are synthesized by a merge step.
- **Somatic markers (Resonance Dissonance Signal)** — three-channel fast heuristic: failure embedding proximity, decision graph structural anomaly, prediction error acceleration. Fires advisory signals before/during deliberation. Weights learned via logistic regression over task outcomes.
- **Triage learning loop** — triage weights updated via online gradient descent from task outcomes. Task-signature-level overrides stored in knowledge graph.
- **Perspective identity evolution** — perspectives accumulate their own observation histories. The "security" perspective remembers what it's seen across projects. New perspectives can emerge from repeated activation patterns.

**What it proves:**
- Does the novel blind spot rate improve over time? (The key learning metric)
- Do somatic markers fire on tasks that later fail? (Precision/recall of the RDS)
- Do evolved perspectives outperform generic ones?

---

### V4+ — Integration and Scale

**Goal:** Deliberation becomes available to any agent, not just this brain's PFC.

**What it adds:**
- **MCP server interface** — the deliberation engine exposes itself as an MCP tool. Claude Code, or any MCP-compatible agent, can call `deliberate` and get back a structured plan. The calling agent executes and reports results for validation.
- **Cross-project learning** — lessons from deliberation in project A inform deliberation in project B. The knowledge graph spans projects; perspectives carry cross-project experience.
- **Incubation effects** — async re-deliberation. When a task converges but with unresolved tensions, the Dreamer can revisit the decision graph during consolidation and flag decisions that look fragile in hindsight.
- **Collaborative deliberation** — multiple users can contribute perspectives or override assumptions in a shared deliberation session.

---

### What Each Version Proves (Summary)

| Version | Core Question |
|---------|--------------|
| V0 | Does structured deliberation improve reasoning quality at all? |
| V1 | Can we make deliberation practical for daily use? (triage, validation, UX) |
| V2 | Can we handle mid-task assumption failures gracefully? (propagation) |
| V3 | Does the system get measurably better over time? (learning) |
| V4+ | Can deliberation work as infrastructure for any agent? (scale) |
