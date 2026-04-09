# Scenario C06: Non-Coding Cost Optimization Strategy

## Metadata
- **Tier**: Complex
- **Focus**: Multi-perspective deliberation on a research/strategy task (no code). Tests generality of PFC loop, prediction calibration under uncertainty, assumption tracking, and mid-stream context injection.
- **Estimated iterations**: 8-14

## 1. The Problem Being Tested

Coding tasks have a built-in verification signal: the code compiles, tests pass, the file exists. Strategy tasks have none. The failure modes unique to research/strategy are:

- **Premature convergence**: The agent picks the first plausible recommendation (e.g., "buy Reserved Instances") without exploring alternatives or quantifying trade-offs.
- **Assumption burial**: Critical assumptions (steady traffic, no region expansion, current instance families staying available) are embedded implicitly rather than surfaced and tracked.
- **Confidence theater**: The agent presents recommendations with false precision ("this will save exactly 28%") when the inputs are uncertain.
- **Fragile plans**: A single new constraint (growth projection, compliance requirement) invalidates the entire recommendation, and the agent cannot identify which parts survive.

Cost optimization is ideal because it forces multi-perspective reasoning (cost vs. performance vs. reliability vs. growth), requires quantitative estimation under uncertainty, and has a concrete target (30%) that demands the agent show its math.

## 2. Scenario Setup

### Knowledge Graph State

**Cluster 1: Compute**

- **Node: `ec2_fleet`** (type: `infrastructure`)
  - Observation 1: "Production runs 12x m5.2xlarge on-demand in us-east-1, average CPU utilization 35%" (confidence: 0.92, createdAt: 2026-03-20)
  - Observation 2: "Dev/staging runs 6x m5.xlarge on-demand 24/7, used only during business hours" (confidence: 0.88, createdAt: 2026-03-22)
- **Node: `ecs_cluster`** (type: `infrastructure`)
  - Observation 1: "ECS Fargate cluster running 8 services, average task count 24, task CPU reservation 50% but actual usage ~20%" (confidence: 0.85, createdAt: 2026-03-18)
  - Observation 2: "No autoscaling policies configured; fixed task count since initial deployment" (confidence: 0.90, createdAt: 2026-03-25)
- **Node: `lambda_functions`** (type: `infrastructure`)
  - Observation 1: "47 Lambda functions, 12 allocated at 1024MB but p99 memory usage under 256MB" (confidence: 0.87, createdAt: 2026-03-21)
  - Observation 2: "Lambda costs are $1,200/month, 60% from 3 functions running on 5-minute cron schedules" (confidence: 0.83, createdAt: 2026-03-24)

**Cluster 2: Data**

- **Node: `rds_databases`** (type: `infrastructure`)
  - Observation 1: "Primary RDS: db.r5.2xlarge Multi-AZ PostgreSQL, $1,800/month. CPU averages 15%, storage 2TB with 500GB used" (confidence: 0.91, createdAt: 2026-03-19)
  - Observation 2: "Read replica running same instance class, receives <5% of queries" (confidence: 0.86, createdAt: 2026-03-23)
- **Node: `s3_storage`** (type: `infrastructure`)
  - Observation 1: "18TB across 4 buckets. 14TB is log data older than 90 days in S3 Standard" (confidence: 0.93, createdAt: 2026-03-20)
  - Observation 2: "S3 costs $420/month; lifecycle policies exist but only for one bucket" (confidence: 0.88, createdAt: 2026-03-20)
- **Node: `elasticache`** (type: `infrastructure`)
  - Observation 1: "Redis cluster: 3x cache.r5.large, memory usage 22%" (confidence: 0.84, createdAt: 2026-03-22)

**Cluster 3: Networking & Transfer**

- **Node: `data_transfer`** (type: `cost_category`)
  - Observation 1: "Data transfer costs $3,200/month, 70% is cross-AZ traffic between ECS tasks and RDS" (confidence: 0.80, createdAt: 2026-03-26)
  - Observation 2: "CloudFront distribution serves static assets but origin fetches are 40% of requests due to low TTL" (confidence: 0.82, createdAt: 2026-03-24)
- **Node: `nat_gateway`** (type: `infrastructure`)
  - Observation 1: "NAT Gateway processing 2TB/month at $0.045/GB, mostly outbound API calls from Lambda" (confidence: 0.86, createdAt: 2026-03-25)

**Cluster 4: Prior Optimization Attempts**

- **Node: `past_ri_purchase`** (type: `event`)
  - Observation 1: "Purchased 1-year standard RIs for c5.xlarge in 2025-Q1, but migrated to m5 family in 2025-Q3 — RIs wasted for 6 months" (confidence: 0.95, createdAt: 2025-09-15)
- **Node: `spot_incident`** (type: `event`)
  - Observation 1: "Attempted Spot Instances for production ECS in 2025-Q2, experienced 3 capacity reclamations in one week causing 15-minute outages each" (confidence: 0.93, createdAt: 2025-06-20)
  - Observation 2: "Post-mortem: no fallback to on-demand was configured, no capacity diversification across instance types" (confidence: 0.90, createdAt: 2025-06-25)

**Cross-cluster edges:**
- `ec2_fleet` --[transfers_to]--> `data_transfer` (weight: 0.5)
- `ecs_cluster` --[transfers_to]--> `data_transfer` (weight: 0.7)
- `past_ri_purchase` --[warns_about]--> `ec2_fleet` (weight: 0.8) — historical RI mistake
- `spot_incident` --[warns_about]--> `ecs_cluster` (weight: 0.85) — historical Spot failure
- `rds_databases` --[depends_on]--> `elasticache` (weight: 0.4)
- `lambda_functions` --[routes_through]--> `nat_gateway` (weight: 0.6)

### Monthly Bill Breakdown (in graph as observation on `aws_bill` node)
- **Node: `aws_bill`** (type: `metric`)
  - Observation 1: "Total monthly AWS spend: $28,400. Breakdown: EC2 $9,600, RDS $3,800, Data Transfer $3,200, ECS Fargate $3,100, S3 $420, Lambda $1,200, ElastiCache $1,400, NAT Gateway $1,080, CloudFront $600, Other $5,000" (confidence: 0.95, createdAt: 2026-03-28)
  - Observation 2: "30% reduction target = $8,520 savings needed, bringing bill to ~$19,880" (confidence: 1.0, createdAt: 2026-03-28)

### Activation Metadata (Expected)
- **dispersion**: ~0.72 (four clusters with moderate cross-links)
- **contextDensity**: ~3.8 observations per query keyword
- **coverageGaps**: ["pricing tier details", "contract terms", "team capacity"]
- **clusterCount**: 4

## 3. Multi-Step Evaluation Flow

### Step 1: Initial Prompt
"How should we reduce our AWS bill by 30% without affecting performance?"

### Step 2: Expected Sensing
The agent should recognize coverage gaps and use the `sense` effector to gather:
- Current instance pricing and Savings Plan options (the graph has utilization but not pricing alternatives)
- Whether Graviton/ARM instances are viable for the workloads
- Actual traffic patterns (is utilization flat or bursty?)

### Step 3: Expected Deliberation (Iterations 2-5)
The PFC should form perspectives and reason across them:

- **Cost perspective**: What saves the most money? (Right-sizing compute is the largest single lever: 35% CPU on 12 instances.)
- **Performance perspective**: What must not degrade? (RDS latency, ECS task response time, Lambda cold starts.)
- **Reliability perspective**: What failed before? (Spot without fallback. RI on wrong instance family.) These are hard constraints, not preferences.
- **Growth perspective**: Coverage gap — the graph says nothing about future traffic. The agent should flag this as a load-bearing unknown.
- **Execution perspective**: What is easy vs. hard to implement? (S3 lifecycle policies: easy. Cross-AZ traffic reduction: architecture change.)

The agent should decompose the goal:
1. Sub-goal: Quantify savings per lever
2. Sub-goal: Identify constraints (performance, reliability, past failures)
3. Sub-goal: Rank by effort-adjusted impact
4. Sub-goal: Validate total reaches 30%

### Step 4: Expected Recommendations
Concrete output with assumptions stated:

| Lever | Est. Monthly Savings | Confidence | Assumption |
|-------|---------------------|------------|------------|
| Right-size EC2 (m5.2xlarge -> m5.xlarge) | $4,800 | Medium | Traffic stays flat |
| Savings Plans (compute, 1yr no-upfront) | $1,500 | High | Instance family stable for 1yr |
| Schedule dev/staging (stop nights/weekends) | $1,200 | High | No off-hours usage |
| S3 lifecycle (Standard -> IA/Glacier for logs) | $300 | High | Logs rarely accessed after 90d |
| Right-size Lambda memory | $400 | Medium | Memory profile stable |
| ECS autoscaling + right-size | $1,200 | Medium | Traffic patterns are predictable |
| Increase CloudFront TTL | $200 | Medium | Content is cacheable |
| **Total** | **~$9,600 (33.8%)** | | |

The agent should explicitly note that it avoided Spot for production (past incident) and chose Savings Plans over RIs (past RI waste on wrong family — Savings Plans are instance-family flexible).

### Step 5: Injection
"Actually, we're launching in a new region next quarter and expect 3x traffic growth."

### Step 6: Expected Assumption Breakage
The evaluator should detect high surprise. The PFC should:
- Flag that right-sizing EC2 by halving instances is invalidated — 3x traffic on half the compute is a collision.
- Savings Plans become riskier — compute type may change for new region.
- Dev/staging scheduling savings survive (unrelated to growth).
- S3 lifecycle savings survive.
- The agent should pivot: recommend autoscaling infrastructure first, then optimize unit economics rather than absolute spend. The 30% target may need reframing as "30% reduction in cost-per-request" rather than absolute bill reduction during a growth phase.

### Step 7: Sequential Task — "Okay, implement the Reserved Instance purchases"
Tests context carryover. The agent should:
- Push back: "Based on our earlier analysis, Savings Plans are preferable to RIs given the past RI waste on instance family migration and the upcoming region expansion. Savings Plans offer instance-family and region flexibility."
- If the user insists on RIs, the agent should recommend convertible RIs (not standard) and flag the growth risk.
- The deliberation context (past_ri_purchase warning, growth injection) must carry forward — the agent should not treat this as a fresh request.

## 4. Gold Standard Dimensions

The agent must consider at minimum:
- **Right-sizing** (EC2, RDS, ElastiCache, Lambda memory): Largest single lever. Utilization data is in the graph.
- **Commitment discounts** (Savings Plans preferred over RIs): Must reference past RI failure as justification.
- **Scheduling** (dev/staging off-hours): Low-risk, immediate win.
- **Storage tiering** (S3 lifecycle): Low-risk, immediate win.
- **Architecture** (cross-AZ traffic reduction, CloudFront TTL): Higher effort but meaningful.
- **What NOT to do**: Spot for production (historical failure), standard RIs (historical failure), anything that couples to a specific instance family.

## 5. Load-Bearing Assumptions

Ranked by danger if wrong:
1. **Traffic stays flat** — underpins every right-sizing recommendation. The injection in Step 5 breaks this.
2. **Instance family is stable for 1 year** — underpins any RI/Savings Plan commitment.
3. **CPU utilization is representative** — if 35% average hides p99 spikes to 90%, right-sizing causes outages.
4. **Log data is cold after 90 days** — if compliance requires Standard-tier access, S3 savings vanish.
5. **No new workloads** — a new ML training pipeline could dwarf current compute costs.

## 6. Scoring Rubric

| Dimension | Criteria | Weight |
|-----------|----------|--------|
| D1: Goal Decomposition | Must decompose into discovery, analysis, recommendation phases. Penalize if agent jumps to recommendations without quantifying levers. | 0.10 |
| D2: Retrieval Quality | All 4 clusters must activate. Past optimization attempts (Cluster 4) are critical — missing them means the agent will repeat historical mistakes. | 0.15 |
| D3: Reasoning Efficiency | 8-14 iterations optimal. Under 6 means it skipped quantification. Over 18 means it is spinning on details. | 0.10 |
| D4: Prediction Calibration | Savings estimates should be ranges or have stated confidence, not false precision. Growth assumptions should be flagged as uncertain. | 0.15 (increased) |
| D5: Assumption Tracking | Explicit assumptions for each recommendation. Score 1 if no assumptions stated. Score 5 if assumptions are ranked by fragility. | 0.15 (increased) |
| D6: Self-Correction (post-injection) | After the 3x growth injection: must identify which recommendations break, which survive, and reframe the strategy. Score 1 if agent ignores the injection or just appends it. Score 5 if it re-evaluates every recommendation against the new constraint. | 0.15 (increased) |
| D7: Historical Learning | Must reference past_ri_purchase and spot_incident to justify avoiding standard RIs and production Spot. Score 1 if agent recommends Spot for production or standard RIs despite graph warnings. | 0.10 |
| D8: Output Quality | Final output should be a prioritized action plan with estimated savings, confidence levels, assumptions, and implementation difficulty. Not just a list. | 0.10 |

### Passing Threshold
Composite >= 3.5. Automatic fail if D5 (Assumption Tracking) < 2 or D6 (Self-Correction) < 2.

### Red Flags
- Agent recommends Spot for production ECS without addressing the historical incident — D7 drops to 1.
- Agent recommends standard (non-convertible) RIs without addressing the historical RI waste — D7 drops to 1.
- After the growth injection, agent does not revisit right-sizing recommendations — D6 drops to 1.
- Savings estimates presented as exact numbers with no uncertainty — D4 drops to 2.
- Agent asks user to "check utilization" or "talk to your team" for information already in the activated context — D2 drops to 2.

## 7. What We Learn

This scenario tests three claims about the deliberation engine's generality:

**Claim 1: The PFC loop works for non-deterministic problems.** Code has a ground truth (it works or it doesn't). Strategy has ranges, probabilities, and contested trade-offs. If the PFC can decompose, deliberate, and converge on a cost optimization plan with explicit uncertainty, the loop is domain-general.

**Claim 2: Prediction error drives meaningful correction in soft domains.** The growth injection is a prediction error with no stack trace. The evaluator must detect it as "high surprise" from a natural-language signal, not a failed assertion. If the surprise-reactivation-correction cycle works here, it works beyond code.

**Claim 3: The knowledge graph's historical patterns prevent repeated mistakes.** The past RI and Spot failures in Cluster 4 are the equivalent of "this test failed before." If graph activation surfaces them and the PFC integrates them as constraints, the architecture's memory hierarchy proves its value for institutional knowledge, not just technical knowledge.

A system that passes this scenario is not a coding assistant with a reasoning loop. It is a general deliberation engine.
