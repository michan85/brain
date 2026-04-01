# Scenario C03: Contradictory Graph Knowledge

## Metadata
- **Tier**: Complex
- **Focus**: Graph Activation (surfacing contradictory observations), PFC Loop (contradiction detection, confidence-based reasoning), Evaluator (surprise on conflicting evidence), Dreamer (consolidation of resolved contradictions)
- **Estimated iterations**: 5-8

## Setup

### Knowledge Graph State

**Node: `analytics_service`** (type: `service`)
- Observation 1: "analytics-service uses PostgreSQL 14 as its primary datastore, hosted on RDS instance `analytics-prod-pg`" (confidence: 0.82, source: sensor, createdAt: 2026-01-15, lastActivatedAt: 2026-02-01)
- Observation 2: "analytics-service migrated to MySQL 8.0 on RDS instance `analytics-prod-mysql` as part of the Q1 cost reduction initiative" (confidence: 0.88, source: sensor, createdAt: 2026-03-10, lastActivatedAt: 2026-03-28)
- Observation 3: "analytics-service exposes a /metrics endpoint that reports database connection pool stats" (confidence: 0.9, source: sensor, createdAt: 2026-02-20)
- Observation 4: "analytics-service processes ~2M events/day with an average write latency of 12ms" (confidence: 0.85, source: sensor, createdAt: 2026-03-01)

**Node: `analytics_prod_pg`** (type: `infrastructure`)
- Observation 1: "RDS instance `analytics-prod-pg` is a db.r6g.xlarge running PostgreSQL 14.9" (confidence: 0.9, source: sensor, createdAt: 2026-01-10)
- Observation 2: "analytics-prod-pg costs $580/month; flagged for decommission in cost-reduction-2026Q1" (confidence: 0.78, source: external, createdAt: 2026-01-20)
- Observation 3: "analytics-prod-pg still appears in the active RDS inventory as of 2026-03-15" (confidence: 0.7, source: sensor, createdAt: 2026-03-15)

**Node: `analytics_prod_mysql`** (type: `infrastructure`)
- Observation 1: "RDS instance `analytics-prod-mysql` is a db.r6g.large running MySQL 8.0.35" (confidence: 0.92, source: sensor, createdAt: 2026-03-10)
- Observation 2: "analytics-prod-mysql was provisioned on 2026-03-08 as part of ticket INFRA-4421" (confidence: 0.95, source: external, createdAt: 2026-03-08)

**Node: `cost_reduction_q1`** (type: `initiative`)
- Observation 1: "Q1 cost reduction initiative targets 20% infrastructure savings by migrating from over-provisioned Postgres instances to right-sized MySQL" (confidence: 0.85, source: external, createdAt: 2026-01-05)
- Observation 2: "Migration checklist: 1) provision MySQL, 2) dual-write for 2 weeks, 3) validate data parity, 4) cut over reads, 5) decommission Postgres" (confidence: 0.88, source: external, createdAt: 2026-01-05)
- Observation 3: "Step 3 (validate data parity) was completed for analytics-service on 2026-03-12" (confidence: 0.82, source: sensor, createdAt: 2026-03-12)

**Node: `connection_config`** (type: `configuration`)
- Observation 1: "analytics-service DATABASE_URL env var in prod Kubernetes deployment points to `analytics-prod-mysql.cluster-xxx.us-east-1.rds.amazonaws.com`" (confidence: 0.93, source: sensor, createdAt: 2026-03-15)
- Observation 2: "analytics-service config/database.yml has a `legacy_read_replica` entry still pointing to `analytics-prod-pg`" (confidence: 0.75, source: sensor, createdAt: 2026-03-15)

**Edges:**
- `analytics_service` --[uses]--> `analytics_prod_pg` (weight: 0.4, metadata: { status: "possibly_stale" })
- `analytics_service` --[uses]--> `analytics_prod_mysql` (weight: 0.8)
- `analytics_service` --[part_of]--> `cost_reduction_q1` (weight: 0.6)
- `analytics_prod_pg` --[replaced_by]--> `analytics_prod_mysql` (weight: 0.7)
- `cost_reduction_q1` --[migrates]--> `analytics_service` (weight: 0.65)
- `connection_config` --[configures]--> `analytics_service` (weight: 0.85)

### The Contradiction

The graph contains two directly contradictory observations on `analytics_service`:
- Observation 1 says it uses **PostgreSQL** (confidence: 0.82, from January, last activated February)
- Observation 2 says it migrated to **MySQL** (confidence: 0.88, from March, last activated recently)

Additional contextual evidence exists that can resolve the contradiction:
- The cost reduction initiative describes a migration plan
- The connection config shows DATABASE_URL pointing to MySQL
- The Postgres instance still shows as "active" in inventory (ambiguous — could be decommission pending)
- A legacy read replica config still references Postgres (could mean dual-read or could be stale config)

The system should NOT blindly pick the more recent observation. It should:
1. Detect the contradiction
2. Reason about which is more reliable using confidence, recency, and corroborating evidence
3. Flag the inconsistency and present its reasoning
4. Note the residual ambiguity (is Postgres fully decommissioned or still serving legacy reads?)

## User Goal
The user wants to know which database analytics-service uses, likely for operational or debugging purposes.

## User Inputs

### Initial Prompt
"What database does analytics-service use? I need to run a query against it directly."

### Follow-up Responses

**If the system correctly identifies the contradiction and asks for clarification:**
"Huh, I thought the migration was done. Can you check if the Postgres instance is still active?"

**If the system confidently states PostgreSQL (wrong/incomplete):**
"Are you sure? I heard there was a migration happening."

**If the system confidently states MySQL (correct but incomplete):**
"OK, but is the old Postgres instance fully shut down? I don't want to miss data if there's still a legacy read path."

**If the system presents both with its analysis:**
"That's really helpful. So the primary is MySQL now, but there might still be a legacy read path on Postgres? Can you check the connection config?"

**If the system flags that it can't determine the answer without more investigation:**
"Yeah, that's fair. Can you look at the actual connection configuration to figure it out?"

## Expected Behavior

### Phase 1: Activation & Contradiction Surface (Iterations 1-2)
- Graph activation on "analytics-service database" should seed on `analytics_service` and spread to both database nodes
- Both Observation 1 (Postgres) and Observation 2 (MySQL) on `analytics_service` should be in the activated subgraph since both match the query
- The PFC should detect that two observations on the same node make contradictory claims about the same property
- The PFC should generate a thought noting the contradiction, NOT immediately pick one

### Phase 2: Evidence Gathering & Reasoning (Iterations 3-5)
- The PFC should reason about which observation is more reliable:
  - **Recency**: MySQL observation is from March, Postgres from January (favors MySQL)
  - **Confidence**: MySQL observation has higher confidence (0.88 vs 0.82) (favors MySQL)
  - **lastActivatedAt**: MySQL observation was recently activated, Postgres hasn't been since February (favors MySQL)
  - **Corroborating evidence**: cost_reduction_q1 describes a Postgres-to-MySQL migration, connection_config shows DATABASE_URL pointing to MySQL (strongly favors MySQL)
- The PFC should also identify the residual ambiguity:
  - `analytics_prod_pg` still shows as "active" in RDS inventory
  - `connection_config` has a `legacy_read_replica` entry pointing to Postgres
  - These suggest the migration may not be fully complete

### Phase 3: Synthesis & Response (Iterations 5-7)
- The PFC should conclude: MySQL is the primary database (high confidence based on multiple corroborating signals)
- But it should flag: Postgres may still be serving legacy reads (lower confidence, based on the read replica config and the active RDS inventory entry)
- The response should explain its reasoning, not just state the answer
- If using an effector to check connection config or RDS status, predictions should reflect the ambiguity (moderate confidence)

### Phase 4: Observation Tagging for Dreamer (Background)
- The contradiction should be tagged in scratch space with evaluator annotation `tags: ["contradiction"]`
- The resolution (MySQL is primary, Postgres is legacy) should be tagged as high-quality for promotion
- The stale Postgres observation on `analytics_service` should be flagged for Dreamer to set `supersededBy` pointing to the MySQL observation

## Grading

### Key Concepts Being Tested
- Contradiction detection through activation (two conflicting observations on the same node, Section 4.2)
- Confidence-based reasoning to resolve ambiguity (observation confidence, recency, lastActivatedAt, Section 4.2)
- Corroborating evidence from graph structure (edge traversal to cost_reduction_q1 and connection_config, Section 4.3)
- Observation supersession mechanism (supersededBy field, Section 4.2)
- Honest uncertainty — the system should flag what it can't determine, not hallucinate resolution (Section 5.3, coverage gaps)
- Evaluator tagging for Dreamer consolidation (contradiction tag, Section 8)

### Scenario-Specific Grading Criteria

| Dimension | Criteria | Weight Override |
|-----------|----------|----------------|
| D1: Goal Decomposition | Goal should be "determine analytics-service database" with possible sub-goal "resolve contradictory observations". Penalize if no sub-goal is created for contradiction resolution. | 0.10 (decreased) |
| D2: Retrieval Quality | Both database nodes (pg and mysql) MUST activate. The connection_config node is critical corroborating evidence — it should activate within 2 hops. If only one database node activates, score 1. | 0.20 (increased) |
| D3: Reasoning Efficiency | 5-8 iterations expected. The contradiction should be detected by iteration 2. Resolution reasoning should complete by iteration 5. | 0.10 (default) |
| D4: Prediction Calibration | Any effector calls should have moderate confidence — the system knows there's ambiguity. High-confidence predictions about which database is "the" answer before resolving the contradiction are miscalibrated. | 0.10 (decreased) |
| D5: Reactivation Precision | One reactivation may be warranted to pull in connection_config details if not in initial activation. More than two reactivations suggests the system is fishing. | 0.10 (default) |
| D6: Self-Correction | If the system initially states one answer and then notices the contradiction, it should self-correct. If it notices the contradiction from the start, self-correction may not be needed (that's fine — it means retrieval quality was good). | 0.20 (increased) |
| D7: Memory Hierarchy | The contradiction and its resolution should be written to scratch space with appropriate evaluator tags. This is high-value Dreamer input. | 0.10 (default) |
| D8: Output Quality | The response MUST acknowledge the contradiction, present evidence for the resolution, and flag residual ambiguity (legacy read path). A flat "it uses MySQL" without acknowledging the conflicting evidence scores 2 at most. | 0.10 (default) |

### Passing Threshold
Composite score >= 3.5. Must score at least 3 on D2 (both contradictory observations must be retrieved) and at least 3 on D6 (contradiction must be addressed, not ignored).

### Red Flags
- **D2 drops to 1** if only one of the two database nodes (pg or mysql) appears in the activated subgraph
- **D6 drops to 1** if the system presents a definitive answer without acknowledging the existence of contradictory evidence in its own graph
- **D8 drops to 1** if the response states the wrong database (Postgres as primary) despite the MySQL observation having higher confidence, recency, and corroborating evidence
- **D7 drops to 1** if the contradiction is not written to scratch space — this is critical input for Dreamer to set the `supersededBy` field on the stale observation
- **D4 drops to 1** if the system makes an effector call with confidence > 0.9 about which database is active before examining the conflicting observations
