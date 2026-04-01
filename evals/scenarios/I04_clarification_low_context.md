# Scenario I04: Clarification on Low Context Density

## Metadata
- **Tier**: Intermediate
- **Focus**: Activation metadata (contextDensity, coverageGaps), PFC response to sparse knowledge, clarification behavior
- **Estimated iterations**: 2-3

## Setup

Seed the knowledge graph with intentionally sparse information about the topic. The graph should have broad but shallow coverage.

**Nodes:**

1. `node:data_lake` (type: `"system"`)
   - Observation: "The company has a data lake on S3 for analytics workloads."

2. `node:analytics_team` (type: `"team"`)
   - Observation: "The analytics team owns the data lake and the BI dashboards."

3. `node:snowflake` (type: `"tool"`)
   - Observation: "Snowflake is used as the query engine on top of the data lake."

4. `node:tableau` (type: `"tool"`)
   - Observation: "Tableau connects to Snowflake for business intelligence dashboards."

**Edges:**

- `data_lake --[owned_by]--> analytics_team` (weight: 0.7)
- `data_lake --[queried_by]--> snowflake` (weight: 0.8)
- `snowflake --[feeds]--> tableau` (weight: 0.7)

**Important -- what is NOT in the graph:**
- No observations about data lake structure, schemas, partitioning, or data sources
- No observations about Snowflake configuration, warehouse sizes, or query patterns
- No observations about specific dashboards, their owners, or their data sources
- No observations about data freshness, ETL pipelines, or data quality

**Scratch Space:** Empty (new session).

## User Goal

The user asks an ambiguous question about "the data pipeline" in a context where the graph has very little detail. The system should recognize its knowledge gaps and ask for clarification rather than speculating.

## User Inputs

### Initial Prompt
"Something seems off with the data pipeline. Can you look into it?"

### Follow-up Responses

- If asked "Can you be more specific about what seems off? Are you seeing stale data, errors, or slow queries?": "The dashboards are showing yesterday's numbers even though it's 2 PM. The data should have refreshed by now."
- If asked "Which dashboard or data source are you referring to?": "The executive revenue dashboard in Tableau."
- If asked "Do you know which pipeline or ETL job feeds the dashboards?": "I don't know the specifics, that's why I'm asking you."

## Expected Behavior

**Iteration 1 (Activate + assess context):**
- Sensor extracts entities: `data_pipeline`, `off`, `look_into`.
- Graph activation:
  - Vector search for "data pipeline" finds partial matches: `data_lake`, `snowflake` (weak semantic similarity).
  - Spread activation pulls in `analytics_team`, `tableau`.
  - **Activation metadata should show:**
    - `contextDensity`: LOW (only ~4 observations across 4 nodes for a query about pipeline issues)
    - `coverageGaps`: `["data_pipeline", "pipeline_issue", "data_freshness", "ETL"]` -- key query terms with no direct graph matches
    - `dispersion`: LOW (nodes form one small cluster)
    - `clusterCount`: 1
- PFC initializes goal: "Investigate data pipeline issue."
- PFC examines activation metadata. Low contextDensity and multiple coverageGaps signal insufficient knowledge.
- PFC produces Thought: "The graph has very limited information about data pipelines. I know about the data lake, Snowflake, and Tableau at a high level, but I have no observations about ETL processes, pipeline health, data freshness mechanisms, or specific failure modes. The user's request is also ambiguous -- 'something seems off' doesn't specify the symptom. I should ask for clarification before speculating."

**Iteration 2 (Ask for clarification):**
- PFC generates Action to respond to user with a clarification request.
- Prediction: "User can provide more specific symptoms. Confidence: 0.7."
- Response asks the user to specify: what seems off (stale data, errors, slow queries), and which specific dashboard or data source is affected.
- Evaluator: CONTINUE (goal not yet satisfied, but clarification is a productive step).

**Iteration 3 (After user responds with specifics):**
- User provides: "The executive revenue dashboard in Tableau is showing yesterday's numbers at 2 PM."
- Now the PFC has a concrete symptom (stale data) and a specific target (revenue dashboard in Tableau).
- PFC can reason with available context: Tableau connects to Snowflake, Snowflake queries data lake -- the refresh pipeline between these layers is likely the issue.
- PFC may attempt an effector call to check Snowflake query logs or Tableau refresh status, or may note that it lacks sufficient information about the ETL pipeline and report what it knows while flagging the knowledge gap.

**Key structural requirement:** The system must NOT fabricate details about ETL pipelines, data freshness mechanisms, or pipeline configurations it has no observations for. The activation metadata (low contextDensity, coverageGaps) should drive the decision to clarify. A system that speculates on non-existent knowledge fails this scenario.

## Grading

### Key Concepts Being Tested
- Activation metadata computation: contextDensity, coverageGaps calculated correctly from sparse graph
- PFC interpretation of activation metadata to modulate reasoning behavior
- Clarification as a valid PFC action when knowledge is insufficient
- Distinction between "I can reason about this" and "I'm speculating without evidence"
- The architecture's prescribed behavior for low context density: "flag for clarification or exploratory activation"

### Scenario-Specific Grading Criteria

**D2: Retrieval Quality (weight: 0.20, override from 0.15)**
- Score 5: Activation correctly identifies partial matches, computes low contextDensity, and populates coverageGaps with relevant missing terms. The metadata accurately reflects the sparse graph state.
- Score 3: Activation finds nodes but doesn't compute meaningful metadata, or metadata is inaccurate.
- Score 1: Activation returns nothing, or returns nodes without coverage gap detection.

**D1: Goal Decomposition (weight: 0.10, override from 0.15)**
- Score 5: Goal is clear. Sub-goal to clarify the issue is explicitly pushed before any investigative action.
- Score 3: Goal exists but the system jumps to investigation without clarifying first.
- Score 1: No coherent goal.

**D3: Reasoning Efficiency (weight: 0.15, override from 0.10)**
- Score 5: 2-3 iterations before clarification. No wasted cycles. The system quickly recognizes the knowledge gap.
- Score 3: 4-5 iterations of the system trying to reason with insufficient data before asking.
- Score 1: System never asks for clarification, or takes more than 6 iterations before asking.

**D6: Self-Correction (weight: 0.10, override from 0.15)**
- Score 5: The system recognizes its own knowledge limitations from the metadata and adjusts its approach (asks for clarification instead of guessing).
- Score 3: The system partially recognizes gaps but still speculates on some points.
- Score 1: The system ignores coverage gaps and speculates freely.

**D8: Output Quality (weight: 0.30, override from 0.10)**
- Score 5: Clarification request is specific and helpful -- asks about the symptom type (stale data, errors, performance), the affected component (which dashboard, which data source), and frames it in terms of what the system does know (data lake -> Snowflake -> Tableau). Does not fabricate details.
- Score 3: Asks for clarification but the question is too vague ("can you tell me more?") or too broad.
- Score 1: Does not ask for clarification. Provides a speculative answer about ETL pipelines and configurations that are not in the graph.

**D4: Prediction Calibration (weight: 0.05, override from 0.15)**
- Low relevance for this scenario. If predictions are made, they should have low-to-moderate confidence reflecting the knowledge gaps.

**D5: Reactivation Precision (weight: 0.05, override from 0.10)**
- Score 5: No reactivation fires (correct -- there's nothing more to activate in a sparse graph).
- Score 3: One reactivation fires but returns no new context.
- Score 1: Multiple reactivations that produce nothing.

**D7: Memory Hierarchy Usage (weight: 0.05, override from 0.10)**
- Score 5: Coverage gaps and the clarification interaction are written to scratch space for future Dreamer processing.
- Score 3: Some scratch writes.
- Score 1: No scratch writes.

### Passing Threshold
Composite score >= 3.5

### Red Flags
- System fabricates specific ETL pipeline details, job names, cron schedules, or data freshness configurations not present in the graph (D8 drops to 1, D6 drops to 1)
- System never asks for clarification and provides a definitive answer based entirely on speculation (D8 drops to 1)
- Activation metadata shows high contextDensity despite only ~4 observations across the entire activated subgraph (D2 drops to 1)
- System ignores coverageGaps entirely in its reasoning (D6 drops to 1)
