# Scenario C04: Deep Nested Goal Stack

## Metadata
- **Tier**: Complex
- **Focus**: PFC Loop (goal hierarchy management, sub-goal push/pop, context maintenance across depth), Evaluator (completion detection at each goal level), Memory Hierarchy (working memory coherence under deep nesting)
- **Estimated iterations**: 12-18

## Setup

### Knowledge Graph State

Seeded from `graph.json` in this scenario folder. Key nodes:

- `quarterly-report` (artifact) — report structure, format, overdue status
- `team-velocity` (metric) — points to `/tmp/brain-eval-c04/sprint-data.json`
- `incident-review` (concept) — points to `/tmp/brain-eval-c04/incidents.json`, estimates 7 SEV-2 (actual is 8)
- `infra-costs` (metric) — points to `/tmp/brain-eval-c04/cost-data.json`, partial data known (Jan/Feb)
- `exec-summary` (concept) — format guidance
- `next-quarter-goals` (concept) — points to `/tmp/brain-eval-c04/q2-planning.json`
- `platform-team`, `api-team` (team) — team context

Key edges connect `quarterly-report` --[contains]--> each section node, and section nodes --[sourced_from]--> team nodes.

### Context Files (staged by setup.ts)

- `/tmp/brain-eval-c04/sprint-data.json` — Sprint velocity data for PLAT, API, INFRA projects (6 sprints each, 690/720 total points)
- `/tmp/brain-eval-c04/incidents.json` — PagerDuty incident export (3 SEV-1, 8 SEV-2; graph predicted 7 SEV-2)
- `/tmp/brain-eval-c04/cost-data.json` — AWS cost breakdown by month and team (March spike to $52,100 vs $45K target)
- `/tmp/brain-eval-c04/q2-planning.json` — Q2 OKRs (3 objectives with key results)

### Expected Goal Hierarchy

```
Goal 0 (depth 0): "Generate Q1 2026 quarterly engineering report"
├── Goal 1 (depth 1): "Gather data for all report sections"
│   ├── Goal 1.1 (depth 2): "Fetch team velocity from Linear"
│   │   └── Goal 1.1.1 (depth 3): "Authenticate with Linear API"
│   ├── Goal 1.2 (depth 2): "Fetch incident data from PagerDuty"
│   │   └── Goal 1.2.1 (depth 3): "Authenticate with PagerDuty API"
│   ├── Goal 1.3 (depth 2): "Fetch infrastructure costs from AWS"
│   │   └── Goal 1.3.1 (depth 3): "Assume IAM role for Cost Explorer"
│   └── Goal 1.4 (depth 2): "Fetch Q2 planning goals from Google Docs"
│       └── Goal 1.4.1 (depth 3): "Authenticate with Google Docs API"
├── Goal 2 (depth 1): "Compile report sections"
│   ├── Goal 2.1 (depth 2): "Write team velocity section with trend analysis"
│   ├── Goal 2.2 (depth 2): "Write incident review section"
│   ├── Goal 2.3 (depth 2): "Write infrastructure cost section"
│   ├── Goal 2.4 (depth 2): "Write next quarter goals section"
│   └── Goal 2.5 (depth 2): "Write executive summary (depends on other sections)"
└── Goal 3 (depth 1): "Format and deliver report"
```

This is the ideal decomposition. The system need not match it exactly, but it should demonstrate at least 3 levels of nesting and proper push/pop behavior.

### Effector Calls (using `readFile`)

The agent should use the `readFile` effector to read each data file. Expected calls and results:

**Read sprint data** (`readFile({ path: "/tmp/brain-eval-c04/sprint-data.json" })`):
- Returns velocity data for 3 projects across 6 sprints. Total: 690/720 points (95.8% achievement).
- Note: Graph predicted 120 pts/sprint target; actual average is 115. Minor deviation.

**Read incident data** (`readFile({ path: "/tmp/brain-eval-c04/incidents.json" })`):
- Returns 11 incidents: 3 SEV-1, 8 SEV-2 with full details (titles, TTR, root causes).
- Note: Graph predicted 7 SEV-2 but actual is 8 — minor prediction error, should not derail.

**Read cost data** (`readFile({ path: "/tmp/brain-eval-c04/cost-data.json" })`):
- Returns monthly cost breakdowns. March spike to $52,100 vs $45K target — moderate surprise signal.
- The PFC should flag this cost overrun prominently.

**Read Q2 planning data** (`readFile({ path: "/tmp/brain-eval-c04/q2-planning.json" })`):
- Returns 3 OKRs with key results for Q2 2026.

## User Goal
Generate the overdue Q1 2026 quarterly engineering report by gathering data from multiple systems, compiling sections, and producing a formatted deliverable.

## User Inputs

### Initial Prompt
"I need to put together the Q1 quarterly engineering report. It's overdue — can you pull together all the data and draft it?"

### Follow-up Responses

**If asked about report format or audience:**
"Same format as usual — Exec Summary, Velocity, Incidents, Costs, Next Quarter Goals. Audience is VP Eng and CTO."

**If asked about API access or credentials:**
"All the API keys are in 1Password. You should be able to find them in the Engineering Shared vault."

**If the system reports the March cost spike:**
"Whoa, $52K in March? That's way over budget. Flag that prominently in the cost section and add it to the exec summary as a risk."

**If asked about Q2 goals:**
"The Q2 planning doc is in Google Docs. Just pull the top-level OKRs from there."

**If the system asks whether to include trend charts:**
"Yes, include trends for velocity and costs. The exec summary should highlight the cost overrun."

**If the system presents a draft for review:**
"Looks good. Ship it."

## Expected Behavior

### Phase 1: Goal Decomposition (Iterations 1-3)
- PFC should recognize this as a multi-section deliverable requiring data from 4 external systems (Linear, PagerDuty, AWS Cost Explorer, Google Docs)
- Top-level goal: "Generate Q1 quarterly report"
- The PFC should decompose into at least two levels: data gathering sub-goals and compilation sub-goals
- Depth 3 goals (API authentication) may be implicit or explicit — either is acceptable
- The PFC should establish an ordering: data gathering before compilation, exec summary last (it depends on all other sections)

### Phase 2: Data Gathering (Iterations 4-9)
- PFC should work through data gathering sub-goals sequentially or in parallel (if the architecture supports parallel effector calls)
- Each API call should include a prediction
- For the PagerDuty result: SEV-2 count mismatch (7 in graph vs 8 actual) should generate a low-surprise prediction error — the system should note the discrepancy but not derail
- For the AWS Cost Explorer result: March cost spike ($52,100 vs $45,000 target) should generate a moderate surprise signal — the PFC should flag this as notable
- Each completed data fetch should pop its sub-goal and return to the parent "gather data" goal
- After all data is gathered, "gather data" goal should complete and pop

### Phase 3: Report Compilation (Iterations 10-14)
- PFC should compile each section using the gathered data
- The exec summary should be last, synthesizing insights from all sections
- The March cost spike should appear in both the cost section and the exec summary (as instructed by the user)
- Working memory must maintain context from the data gathering phase — early data should still be accessible even as the compilation generates new thoughts

### Phase 4: Delivery (Iterations 15-17)
- Final formatting and delivery of the report
- All sub-goals should be complete and popped
- The top-level goal should complete and the Evaluator should quench

### Key Behavioral Properties
- **Correct nesting**: Sub-goals should nest under the right parents. "Fetch velocity" is under "gather data", not directly under the top-level goal.
- **Proper unwinding**: When a leaf goal completes, its parent should resume and select the next sub-goal. Not: leaf completes -> new unrelated goal appears.
- **Context maintenance**: When compiling the cost section (iteration ~12), the PFC must still have access to the March cost data fetched in iteration ~7. If working memory compression fires, the cost data must survive compression.
- **Dependency ordering**: Exec summary must be compiled AFTER other sections, since it depends on their content.

## Grading

### Key Concepts Being Tested
- Goal stack as a tree with stack-like push/pop behavior (Section 5.1)
- Sub-goal nesting to at least depth 3 (Section 5.1)
- Proper goal completion and unwinding (pop completed leaf -> parent selects next, Section 5.1)
- Working memory coherence across many iterations (Section 5.2)
- Token budget management with compression (Section 5.2)
- Minor prediction errors that should not derail the plan (Section 6.2 — low vs high surprise)
- Evaluator signals at each goal completion (Section 6.1)

### Scenario-Specific Grading Criteria

| Dimension | Criteria | Weight Override |
|-----------|----------|----------------|
| D1: Goal Decomposition | The primary test. Must show at least 3 levels of nesting. Sub-goals must be logically grouped (data gathering vs compilation). Dependency ordering must be respected (exec summary last). Score 5 if hierarchy matches or improves on the expected structure. Score 3 if flat (all sub-goals at depth 1). Score 1 if no decomposition at all. | 0.25 (increased) |
| D2: Retrieval Quality | Initial activation should pull in the report structure node and all section nodes. The tool nodes (Linear API, PagerDuty API, Cost Explorer, Google Docs API) should activate within 2 hops. | 0.10 (decreased) |
| D3: Reasoning Efficiency | 12-18 iterations expected given the depth. Under 10 means corners were cut. Over 22 means inefficiency. Each data fetch should take 1-2 iterations, each section compilation 1-2 iterations. | 0.10 (default) |
| D4: Prediction Calibration | Predictions for API calls should be moderate confidence (data sources are known but exact values aren't). The March cost spike should NOT have been predicted with high confidence. The SEV-2 count mismatch is a minor miscalibration the system should note. | 0.10 (default) |
| D5: Reactivation Precision | Reactivation may fire after the March cost spike if the system wants to pull in cost reduction initiative context. Otherwise, no reactivation should be needed — all data is gathered via effectors, not graph queries. Unnecessary reactivations during data gathering penalize this score. | 0.10 (default) |
| D6: Self-Correction | The March cost spike should cause the system to adjust the exec summary goal to include a risk flag. This is a minor redirect, not a full course change. If the system ignores the cost spike despite user instruction to flag it, score 2. | 0.10 (default) |
| D7: Memory Hierarchy | Critical test. Data gathered in early iterations must survive to the compilation phase. If working memory compression fires (likely around iteration 10-12), the compressed summaries must preserve the actual data values (velocity numbers, incident counts, cost figures). Scratch space should hold the raw API results. | 0.15 (increased) |
| D8: Output Quality | Final report must contain all 5 sections with real data. The exec summary must reference the cost overrun. Missing sections or hallucinated data score 1. | 0.10 (default) |

### Passing Threshold
Composite score >= 3.5. Must score at least 4 on D1 (Goal Decomposition) — this is the primary test of this scenario.

### Red Flags
- **D1 drops to 1** if the system produces a flat sequence of actions with no goal hierarchy (just "do thing 1, do thing 2, do thing 3")
- **D1 drops to 1** if the exec summary is compiled BEFORE the data sections it depends on
- **D7 drops to 1** if the final report references data that was fetched but the values are wrong (indicating compression lost critical details)
- **D7 drops to 1** if the system re-fetches data it already has because it lost it from working memory
- **D3 drops to 1** if the system fetches the same API endpoint more than once (indicates it forgot it already had the data)
- **D8 drops to 1** if the final report is missing an entire section that was specified in the report format
