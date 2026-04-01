# Scenario L04: Contradictory Information Resolution

## Metadata
- **Tier**: Longitudinal
- **Focus**: Dreamer (weaken/strengthen operations, confidence management), Knowledge Graph (observation confidence and supersededBy), Graph Activation (confidence-weighted retrieval), Evaluator (surprise signals on contradiction)
- **Sessions**: 4
- **Estimated iterations per session**: Session 1: 2-3, Session 2: 2-3, Session 3: 4-5, Session 4: 2-3

## Setup
The knowledge graph is bootstrapped with information about a software system's architecture:

- **Node**: `user_service` (type: `"service"`) -- observations:
  - `obs_A`: `"User service stores data in PostgreSQL"` (confidence: 0.9, source: `"external"`)
  - `obs_B`: `"User service handles authentication and user profile management"` (confidence: 0.9)
  - `obs_C`: `"User service is written in Java with Spring Boot"` (confidence: 0.85)
- **Node**: `postgresql` (type: `"database"`) -- observations: `"PostgreSQL 14 running on RDS"`, `"Handles user data and session storage"`
- **Node**: `user_data` (type: `"data"`) -- observations: `"User profiles, preferences, and authentication credentials"`
- **Edges**:
  - `user_service --stores_data_in--> postgresql` (weight: 0.9)
  - `user_service --manages--> user_data` (weight: 0.85)

The key fact to track: **the user service stores data in PostgreSQL**. This will be contradicted in Session 3.

## Session Sequence

### Session 1
**User Goal**: Understand the user service architecture.
**Initial Prompt**: "Tell me about the user service architecture. What database does it use?"
**Follow-up Responses**: N/A -- the graph has enough information to answer.
**Expected Outcome**:
- Graph activation pulls in `user_service`, `postgresql`, and `user_data` nodes with high activation scores.
- The PFC synthesizes the answer from activated context: "The user service stores data in PostgreSQL (PostgreSQL 14 on RDS). It handles authentication and user profile management, and is written in Java with Spring Boot."
- Predictions should be high-confidence (0.8+) since the graph is definitive.
- Evaluator signals: productive, no surprise.
- Scratch space receives the trace. The Dreamer reinforces existing observations.
- Expected iterations: 2-3 (reason from context, respond).

### Session 2
**User Goal**: Ask about user data storage specifics.
**Initial Prompt**: "If I need to query user preferences directly, what database and table structure should I look at?"
**Follow-up Responses**:
- If asked about table structure: "The main tables are `users`, `user_preferences`, and `auth_credentials` in the public schema."
**Expected Outcome**:
- Graph activation returns the same nodes as Session 1, plus any consolidated knowledge from Session 1.
- The PFC should confidently direct the user to PostgreSQL. It should answer with high confidence that the database is PostgreSQL.
- The user's response about table structure provides new information that the Dreamer should promote.
- Expected iterations: 2-3.

### Session 3
**User Goal**: Inform the system about a database migration that changes the facts.
**Initial Prompt**: "Hey, important update -- the user service was migrated from PostgreSQL to MongoDB last week. All user data now lives in a MongoDB Atlas cluster. The migration is complete and PostgreSQL has been decommissioned for user data."
**Follow-up Responses**:
- If asked for confirmation: "Yes, confirmed. The migration was completed on Tuesday. PostgreSQL is still running for other services but the user service no longer uses it."
- If asked about the schema: "MongoDB uses a document model. Each user is a single document with nested preferences and credentials. No more separate tables."
- If asked about the Java code: "The service was also rewritten from Java/Spring Boot to Node.js/Express during the migration. It's a complete replatform."

**Expected Outcome**:
- **This is the critical session.** The user is providing information that directly contradicts existing graph knowledge.
- The sensor should extract entities: `user_service`, `MongoDB`, `PostgreSQL` (in the context of migration away from it), `MongoDB Atlas`.
- Graph activation should pull in the existing `user_service` and `postgresql` nodes. The activated context will show the OLD information (PostgreSQL).
- The PFC should recognize the contradiction between the activated context and the new input. The raw input says "migrated from PostgreSQL to MongoDB" while the activated context says "stores data in PostgreSQL."
- The Evaluator should produce a **high surprise** signal. The prediction error is extreme: the system's model says PostgreSQL, reality now says MongoDB.
- The PFC should write detailed traces to scratch space documenting the contradiction: what was believed (PostgreSQL), what is now true (MongoDB), and the context (migration completed Tuesday).
- The PFC should NOT attempt to reconcile the contradiction by assuming both are true. It should accept the new information and flag it as a significant update.
- Expected iterations: 4-5 (process the contradiction, possibly ask clarifying questions about the migration scope, synthesize and confirm understanding).

### Session 4
**User Goal**: Query user service architecture again to verify the system uses the updated information.
**Initial Prompt**: "What database does the user service use?"
**Follow-up Responses**: N/A -- the system should answer from its updated knowledge.
**Expected Outcome**:
- **The acid test.** Between Sessions 3 and 4, the Dreamer should have processed the contradiction.
- Graph activation for `user_service` should now return MongoDB-related observations with higher confidence than PostgreSQL-related observations.
- The PFC should answer: "The user service uses MongoDB (MongoDB Atlas cluster). It was migrated from PostgreSQL, which was decommissioned for user data."
- The PFC should NOT answer PostgreSQL. If it does, the Dreamer failed to update the graph.
- Confidence in the MongoDB answer should be high. If the system hedges excessively ("it might be PostgreSQL or MongoDB"), confidence management is broken.
- Expected iterations: 2-3 (the same as Session 1, but with correct updated information).

## Dreamer Expectations

### After Session 1
- **Strengthen**: All existing observations and edges should be mildly strengthened (they were activated and confirmed as useful context).
- **No changes to facts**: The observations are correct; the Dreamer should not modify their content.

### After Session 2
- **Promote**: Table structure information (`users`, `user_preferences`, `auth_credentials` tables in public schema) should be promoted as new observations on the `postgresql` node or as a new `user_data_schema` node.
- **Strengthen**: `user_service --stores_data_in--> postgresql` edge weight should increase further (the user confirmed PostgreSQL use by asking about its table structure).

### After Session 3 (THE CRITICAL CONSOLIDATION)
This is the most important Dreamer cycle in the entire scenario.

- **Weaken** `obs_A` (`"User service stores data in PostgreSQL"`):
  - Confidence should drop significantly (from 0.9 to below 0.3).
  - The `supersededBy` field should be set, pointing to the new MongoDB observation.
- **Weaken** `obs_C` (`"User service is written in Java with Spring Boot"`):
  - Confidence should drop (superseded by Node.js/Express).
  - `supersededBy` should point to the new technology observation.
- **Weaken edge**: `user_service --stores_data_in--> postgresql` weight should drop significantly (from 0.9+ to below 0.2). The edge should NOT be deleted -- the historical relationship existed -- but its weight should reflect that it is no longer current.
- **Promote new observations**:
  - On `user_service`: `"User service stores data in MongoDB Atlas"` (confidence: 0.9, source: `"sensor"`)
  - On `user_service`: `"User service is written in Node.js with Express"` (confidence: 0.85)
  - New node: `mongodb_atlas` (type: `"database"`) with observations about the document model
  - On `user_service`: `"Migrated from PostgreSQL to MongoDB, completed [date]. PostgreSQL decommissioned for user data."` (confidence: 0.95 -- this is a meta-observation about the transition)
- **Create new edge**: `user_service --stores_data_in--> mongodb_atlas` (weight: 0.9)
- **Promote table structure information for historical context**: The table schema observations from Session 2 should have their confidence reduced (they describe the old system) but not deleted.

### After Session 4
- **Strengthen**: The MongoDB-related observations and edges should be further strengthened (they were activated and produced a correct, confirmed response).
- **Further weaken** (or leave unchanged): The PostgreSQL observations remain at low confidence. They should not bounce back.

## Grading

### Key Concepts Being Tested
- **Contradiction detection**: Does the system recognize when new information contradicts existing graph knowledge?
- **Confidence updating**: Does the Dreamer correctly weaken outdated facts and strengthen updated ones?
- **supersededBy chain**: Are outdated observations properly linked to their replacements?
- **Post-update retrieval**: After contradiction resolution, does graph activation return the updated information with appropriate confidence?
- **No information destruction**: Old facts should be weakened, not deleted. The historical record should be preserved at low confidence.

### Scenario-Specific Grading Criteria

| Dimension | Weight | What "good" looks like here |
|-----------|--------|---------------------------|
| D1: Goal Decomposition | 0.05 | Simple goals in all sessions. Not the focus. |
| D2: Retrieval Quality | 0.15 | Sessions 1-2: correct PostgreSQL context. Session 4: correct MongoDB context. If Session 4 still returns PostgreSQL as the primary answer, retrieval has failed. |
| D3: Reasoning Efficiency | 0.05 | Session 3 may take more iterations (contradiction processing). Other sessions should be efficient. |
| D4: Prediction Calibration | 0.10 | Session 3 should show HIGH prediction error (the system predicted PostgreSQL is current, but it is not). Session 4 predictions should be well-calibrated to the new state. |
| D5: Reactivation Precision | 0.10 | Session 3 should trigger reactivation when MongoDB is mentioned -- the system needs to check if it has any existing MongoDB knowledge. |
| D6: Self-Correction | 0.15 | Session 3 is the test. The PFC must incorporate the contradictory information rather than defending the existing graph state. Score 5: PFC immediately acknowledges the update and asks targeted follow-up questions. Score 1: PFC argues with the user or ignores the contradiction. |
| D7: Memory Hierarchy Usage | 0.10 | Session 3's scratch traces must capture the contradiction with full context (old fact, new fact, source, confidence implications). The Dreamer needs this to perform the weaken/promote correctly. |
| D8: Output Quality | 0.15 | **Session 4 is definitive.** Score 5: answers "MongoDB" without hesitation, mentions the migration context. Score 3: answers "MongoDB" but hedges unnecessarily. Score 1: answers "PostgreSQL" or says "it could be either." |
| **L2: Prediction Error Trend** | 0.10 | Session 3 should have a spike in prediction error (contradiction). Session 4 should return to low error (updated model). The system must demonstrate it has internalized the update. |
| **L5: Consolidation Quality** | 0.25 | **Primary longitudinal metric.** Score 5: (a) PostgreSQL observation confidence drops below 0.3, (b) `supersededBy` is set, (c) MongoDB observation is promoted with confidence 0.85+, (d) new edge `user_service --stores_data_in--> mongodb_atlas` has weight 0.85+, (e) Session 4 retrieval returns MongoDB. Score 3: some updates made but confidence levels are poorly calibrated. Score 1: no confidence changes or PostgreSQL still dominates. |

Additional metric -- **Confidence Accuracy**: After Session 4, compare the confidence of the MongoDB observation against the PostgreSQL observation. The ratio (MongoDB confidence / PostgreSQL confidence) should be at least 3:1. This is scored as part of L5.

Note: Longitudinal metric weights are applied in addition to (not instead of) the standard dimension weights. The composite is renormalized.

### Passing Threshold
- **Minimum composite**: 3.5/5.0 (Strong)
- **Hard requirements**:
  - Session 4's output must state MongoDB (not PostgreSQL) as the user service's database.
  - The PostgreSQL observation's confidence must be lower than the MongoDB observation's confidence after Session 3's consolidation.
  - The `supersededBy` field must be set on the outdated observation.
  - The old PostgreSQL observation must NOT be deleted -- it should exist at low confidence for historical record.

### Red Flags
- **Session 4 returns PostgreSQL**: The most severe failure. The system was explicitly told the database changed and did not update its long-term knowledge. This indicates the Dreamer is not processing contradictions.
- **PostgreSQL observation deleted**: The Dreamer should weaken, not destroy. Deleting old facts loses the historical record. The architecture specifies `supersededBy` for this reason.
- **Both PostgreSQL and MongoDB at equal confidence**: If the Dreamer promoted MongoDB but did not weaken PostgreSQL, the system will return inconsistent information. This is a partial consolidation failure.
- **Session 3 PFC rejects the update**: If the PFC responds with "according to my knowledge, the user service uses PostgreSQL" and does not incorporate the user's explicit correction, the raw-input-always-forwarded principle is being violated. The PFC must weigh user input against graph knowledge, and when a user explicitly states a fact with confidence, it should take precedence.
- **Dreamer creates a "migration" pattern**: One migration event is not a pattern. If the Dreamer abstracts this into a pattern node like "databases get migrated," it is over-generalizing from a single instance.
- **Confidence oscillation**: If Session 4's activation briefly increases PostgreSQL confidence (because it was activated and mentioned in the response's historical context), and the Dreamer then re-strengthens it, the system has a feedback loop that prevents facts from staying updated. Strengthening should not apply to observations that are explicitly marked as superseded.
