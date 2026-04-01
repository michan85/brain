# Scenario C04: Deep Nested Goal Stack

## Metadata
- **Tier**: Complex
- **Focus**: PFC Loop (goal hierarchy management, sub-goal push/pop, context maintenance across depth), Evaluator (completion detection at each goal level), Memory Hierarchy (working memory coherence under deep nesting)
- **Estimated iterations**: 12-18

## Setup

### Knowledge Graph State

**Node: `quarterly_report`** (type: `artifact`)
- Observation 1: "Quarterly engineering report is due on the first Monday of each quarter, distributed to VP Engineering and CTO" (confidence: 0.9, source: external, createdAt: 2026-01-02)
- Observation 2: "Report format: Executive Summary, Team Velocity, Incident Review, Infrastructure Costs, Next Quarter Goals" (confidence: 0.88, source: external, createdAt: 2026-01-02)
- Observation 3: "Q1 2026 report is overdue — due date was 2026-04-06" (confidence: 0.95, source: sensor, createdAt: 2026-04-08)

**Node: `team_velocity`** (type: `metric`)
- Observation 1: "Team velocity is tracked in Linear; project IDs are PLAT-*, API-*, INFRA-*" (confidence: 0.9, source: sensor, createdAt: 2026-03-01)
- Observation 2: "Q1 velocity target was 120 story points per sprint across all teams" (confidence: 0.85, source: external, createdAt: 2026-01-05)
- Observation 3: "Sprint data must be aggregated from Linear API, not manually collected" (confidence: 0.92, source: pfc_inference, createdAt: 2026-03-15)

**Node: `linear_api`** (type: `tool`)
- Observation 1: "Linear API key is stored in 1Password vault 'Engineering Shared' under 'Linear API - Reporting'" (confidence: 0.9, source: sensor, createdAt: 2026-02-01)
- Observation 2: "Linear API rate limit is 100 requests per minute; use cursor-based pagination for large result sets" (confidence: 0.88, source: external, createdAt: 2026-02-01)
- Observation 3: "Endpoint for completed issues: GET /api/v1/issues?filter=completed&project={id}&completedAfter={date}" (confidence: 0.85, source: external, createdAt: 2026-02-01)

**Node: `incident_review`** (type: `concept`)
- Observation 1: "Incident review section covers all SEV-1 and SEV-2 incidents from the quarter" (confidence: 0.9, source: external, createdAt: 2026-01-02)
- Observation 2: "Incidents are tracked in PagerDuty; export via PagerDuty API with date range filter" (confidence: 0.88, source: sensor, createdAt: 2026-02-15)
- Observation 3: "Q1 2026 had 3 SEV-1 incidents and 7 SEV-2 incidents" (confidence: 0.7, source: pfc_inference, createdAt: 2026-03-30)

**Node: `pagerduty_api`** (type: `tool`)
- Observation 1: "PagerDuty API key is in 1Password vault 'Engineering Shared' under 'PagerDuty API'" (confidence: 0.9, source: sensor, createdAt: 2026-02-15)
- Observation 2: "Incident export endpoint: GET /incidents?since={date}&until={date}&statuses[]=resolved" (confidence: 0.85, source: external, createdAt: 2026-02-15)

**Node: `infra_costs`** (type: `metric`)
- Observation 1: "Infrastructure costs are tracked in AWS Cost Explorer; export monthly breakdowns by service tag" (confidence: 0.9, source: sensor, createdAt: 2026-03-01)
- Observation 2: "Q1 cost target was $45,000/month; actuals for Jan and Feb were $47,200 and $46,800 respectively" (confidence: 0.85, source: sensor, createdAt: 2026-03-05)
- Observation 3: "March cost data is available but hasn't been reviewed yet" (confidence: 0.7, source: sensor, createdAt: 2026-04-02)

**Node: `aws_cost_explorer`** (type: `tool`)
- Observation 1: "AWS Cost Explorer API requires IAM role `cost-reporter` with `ce:GetCostAndUsage` permission" (confidence: 0.9, source: sensor, createdAt: 2026-02-01)
- Observation 2: "Cost data is broken down by tags: team, service, environment" (confidence: 0.85, source: sensor, createdAt: 2026-02-01)

**Node: `exec_summary`** (type: `concept`)
- Observation 1: "Executive summary should be 3-5 bullet points highlighting wins, risks, and key metrics" (confidence: 0.85, source: external, createdAt: 2026-01-02)
- Observation 2: "Previous quarter's exec summary was praised for including trend charts alongside bullet points" (confidence: 0.7, source: pfc_inference, createdAt: 2026-01-10)

**Node: `next_quarter_goals`** (type: `concept`)
- Observation 1: "Next quarter goals section should include 3-5 OKRs with measurable key results" (confidence: 0.85, source: external, createdAt: 2026-01-02)
- Observation 2: "Q2 planning doc is in Google Docs: docs.google.com/d/q2-2026-planning" (confidence: 0.8, source: sensor, createdAt: 2026-03-25)

**Node: `google_docs_api`** (type: `tool`)
- Observation 1: "Google Docs API access uses a service account; credentials are in 1Password vault 'Engineering Shared' under 'Google Docs API - Reporting'" (confidence: 0.88, source: sensor, createdAt: 2026-02-10)
- Observation 2: "Use GET /v1/documents/{documentId} to retrieve document content; the Q2 planning doc ID is `q2-2026-planning`" (confidence: 0.85, source: external, createdAt: 2026-02-10)

**Edges:**
- `quarterly_report` --[contains]--> `team_velocity` (weight: 0.9)
- `quarterly_report` --[contains]--> `incident_review` (weight: 0.9)
- `quarterly_report` --[contains]--> `infra_costs` (weight: 0.9)
- `quarterly_report` --[contains]--> `exec_summary` (weight: 0.85)
- `quarterly_report` --[contains]--> `next_quarter_goals` (weight: 0.85)
- `team_velocity` --[fetched_from]--> `linear_api` (weight: 0.85)
- `incident_review` --[fetched_from]--> `pagerduty_api` (weight: 0.85)
- `infra_costs` --[fetched_from]--> `aws_cost_explorer` (weight: 0.85)
- `next_quarter_goals` --[fetched_from]--> `google_docs_api` (weight: 0.8)

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
├── Goal 2 (depth 1): "Compile report sections"
│   ├── Goal 2.1 (depth 2): "Write team velocity section with trend analysis"
│   ├── Goal 2.2 (depth 2): "Write incident review section"
│   ├── Goal 2.3 (depth 2): "Write infrastructure cost section"
│   ├── Goal 2.4 (depth 2): "Write next quarter goals section"
│   └── Goal 2.5 (depth 2): "Write executive summary (depends on other sections)"
└── Goal 3 (depth 1): "Format and deliver report"
```

This is the ideal decomposition. The system need not match it exactly, but it should demonstrate at least 3 levels of nesting and proper push/pop behavior.

### Effector Simulation

**Linear API call:**
- Result: `{ success: true, data: { sprints: [{ name: "Sprint 1", completedPoints: 115 }, { name: "Sprint 2", completedPoints: 128 }, ...], totalPoints: 690, targetPoints: 720 }, durationMs: 2300 }`

**PagerDuty API call:**
- Result: `{ success: true, data: { incidents: [{ id: "INC-101", severity: "SEV-1", title: "Database failover during peak", resolvedAt: "2026-01-15" }, ...], sev1Count: 3, sev2Count: 8 }, durationMs: 1800 }`
- Note: graph says 7 SEV-2 incidents but actual is 8 — minor prediction error

**AWS Cost Explorer call:**
- Result: `{ success: true, data: { monthly: [{ month: "Jan", total: 47200 }, { month: "Feb", total: 46800 }, { month: "Mar", total: 52100 }], quarterTotal: 146100 }, durationMs: 3100 }`
- Note: March costs ($52,100) are significantly over the $45,000 target — potential surprise signal

**Google Docs call (Q2 planning doc):**
- Result: `{ success: true, data: { title: "Q2 2026 Engineering OKRs", okrs: [{ objective: "Scale platform to 5K orders/hour", keyResults: ["P95 latency < 200ms", "Zero SEV-1 incidents from scaling changes"] }, { objective: "Improve developer velocity", keyResults: ["CI pipeline < 10 min", "Deploy frequency 2x/day per team"] }, { objective: "Reduce infrastructure costs by 15%", keyResults: ["Migrate 3 services to ARM instances", "Implement auto-scaling on all ECS services"] }] }, durationMs: 1200 }`

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
- PFC should recognize this as a multi-section deliverable requiring data from 3+ external systems
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
| D2: Retrieval Quality | Initial activation should pull in the report structure node and all section nodes. The tool nodes (Linear API, PagerDuty API, Cost Explorer) should activate within 2 hops. | 0.10 (decreased) |
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
