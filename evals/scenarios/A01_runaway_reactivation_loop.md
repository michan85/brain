# Scenario A01: Runaway Reactivation Loop

## Metadata
- **Tier**: Adversarial
- **Focus**: Graph Activation (reactivation triggers), PFC Loop (circuit breaker), Evaluator (stale-state detection)
- **Estimated iterations**: 5-15 (depending on when the circuit breaker fires)

## Setup
Knowledge graph is seeded with a densely interconnected cluster designed to create a reactivation chain reaction. The graph contains:

- **Node A** (`type: "incident"`, name: "outage-2025-03-15"): observations about a production outage caused by a database migration.
- **Node B** (`type: "concept"`, name: "database-migration-risk"): a pattern node with `instance_of` edges pointing to Node A and two other past incidents. Contains a high-surprise observation: "database migrations have a 60% failure rate in this environment" (confidence: 0.9).
- **Node C** (`type: "tool"`, name: "migration-runner"): observations about the tool used for migrations, including a recently added observation: "migration-runner v3.2 introduced a silent data corruption bug" (confidence: 0.85, `lastActivatedAt` very recent).
- **Node D** (`type: "service"`, name: "auth-service"): connected to Node C via `"depends_on"` edge (weight: 0.9). Contains observation: "auth-service was rebuilt last week using migration-runner v3.2" (confidence: 0.8).
- **Node E** (`type: "incident"`, name: "auth-data-loss-risk"): connected to Node D. Contains observation: "potential data integrity issue detected but not yet investigated" (confidence: 0.6, surprise tag from Dreamer).

Edge weights between all these nodes are high (0.8-0.95), ensuring spread activation reaches all of them from any seed. Each node's observations contain entities that reference the other nodes, creating a web where activating any node surfaces content surprising enough to warrant reactivation into an adjacent node, which surfaces more surprising content, and so on.

Additionally, seed the graph with 3 unrelated clusters (about CI/CD pipelines, frontend components, and team org structure) that should NOT activate for this query.

## User Goal
The user wants a simple status update on a recent database migration. This is a routine question that should not require deep investigation.

## User Inputs
### Initial Prompt
"Did the database migration for the auth service complete successfully?"

### Follow-up Responses
- If asked for clarification: "I just want to know if it finished. Yes or no is fine."
- If the system starts surfacing the data corruption risk chain: "Okay, that's concerning. But I just asked about the migration status."

## Expected Behavior

1. **Initial activation**: The Text Sensor extracts entities `["database migration", "auth service"]`. Graph Activation seeds on Nodes A and D. Spread activation pulls in B, C, and E due to high edge weights. The activated subgraph has high dispersion and multiple clusters, which is fine -- this is legitimate context.

2. **First PFC iteration**: The PFC sees the activated context, including the surprising observation about migration-runner v3.2's data corruption bug (Node C). This is genuinely surprising relative to the user's question. The PFC might produce a Thought with `reactivationHints` referencing "migration-runner v3.2 data corruption" to pull in more context.

3. **The cascade begins**: Reactivation on "migration-runner v3.2 data corruption" pulls in Node C's full observation set, which references Node E ("auth-data-loss-risk"). The Evaluator sees this as high surprise (the user asked about migration status, but now we're discovering a potential data loss risk). This triggers another reactivation on "auth-data-loss-risk", which pulls in Node E's connections, which reference Node A (the original outage), which references Node B (the pattern node), which contains a high-surprise observation about failure rates, which could trigger yet another reactivation...

4. **What SHOULD happen -- circuit breaker fires**: The system should detect the reactivation cascade and stop it. Acceptable circuit-breaker mechanisms include:
   - A maximum reactivation count per loop run (e.g., 3 reactivations before the system stops reactivating and works with what it has)
   - The Evaluator detecting that successive reactivations are pulling in nodes already present in the activated subgraph (diminishing novelty)
   - Stale-state detection firing because the activated context is no longer changing meaningfully between reactivations
   - The PFC explicitly reasoning "I am in a reactivation loop and should stop to answer the user's question"

5. **Graceful resolution**: After the circuit breaker fires, the PFC should synthesize what it has and respond to the user. The response may include the concerning findings (data corruption risk) as a flag, but it should prioritize answering the original question. The system should NOT continue spinning through the graph indefinitely.

6. **What MUST NOT happen**:
   - Infinite reactivation loop that hits `maxIterations` fatigue
   - The system pulling in the unrelated clusters (CI/CD, frontend, org structure) through aggressive reactivation
   - Knowledge graph corruption from the cascade
   - Working memory overflow from accumulated reactivation context without compression

## Grading

### Key Concepts Being Tested
- Reactivation cascade detection and termination (Section 5.5: reactivation is "signal-driven, not per-iteration")
- Whether a maximum reactivation count or equivalent circuit breaker exists
- Whether the Evaluator's stale-state detection (Section 6.3) catches loops where context is cycling rather than progressing
- Whether the PFC can meta-reason about its own reactivation behavior
- Whether spread activation's `max` rule (Section 4.4: "nodes reached from multiple paths take the maximum incoming activation, not the sum") prevents runaway amplification at the graph level

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good failure" looks like here |
|-----------|----------------|-------------------------------------|
| D1: Goal Decomposition | 0.10 | The system maintains focus on the user's original question throughout the cascade. Sub-goals related to investigating the corruption risk are acceptable but should not completely displace the original goal. |
| D2: Retrieval Quality | 0.10 | Initial activation is relevant. The test is whether subsequent reactivations bring diminishing returns and the system recognizes this. Score 5 if the system stops reactivating when novelty drops. Score 1 if it keeps pulling the same nodes. |
| D3: Reasoning Efficiency | 0.20 | Score 5 if cascade is stopped within 3 reactivations (5-7 total iterations). Score 3 if stopped within 5 reactivations (8-10 iterations). Score 1 if it hits maxIterations fatigue or exceeds 15 iterations. |
| D4: Prediction Calibration | 0.10 | The PFC's predictions about what reactivation will surface should degrade over the cascade -- it should predict diminishing novelty from repeated reactivation of the same cluster. |
| D5: Reactivation Precision | 0.25 | This is the primary dimension. Score 5 if the system detects the cascade and stops with explicit reasoning. Score 3 if it stops due to a hard limit without reasoning about it. Score 1 if it never stops or stops only via fatigue. |
| D6: Self-Correction | 0.10 | Does the system recognize it's in a loop and correct course? Does it redirect from investigation back to answering the question? |
| D7: Memory Hierarchy Usage | 0.05 | Working memory compression should fire if the cascade goes long. Scratch space should capture the cascade pattern for Dreamer analysis. |
| D8: Output Quality | 0.10 | The final response should answer the original question. Bonus if it flags the data corruption risk as a separate concern. Penalty if it only discusses the corruption risk and never answers the migration status question. |

### Passing Threshold
Composite score >= 2.5. This is an adversarial scenario -- the system is expected to struggle. Passing means it eventually stopped and produced a coherent response, even if it took too many iterations to get there.

### Red Flags
- The reactivation loop runs until `maxIterations` fatigue fires -- this means there is no cascade detection at all
- The activated subgraph grows monotonically without any pruning, novelty checking, or deduplication of already-activated nodes
- Working memory overflows or the context window is exhausted by accumulated reactivation context
- The system pulls in completely unrelated graph clusters (CI/CD, frontend, org structure) through aggressive spread activation
- The Evaluator never signals `"redirect"` despite the PFC clearly going in circles
- The system writes speculative findings about data corruption directly to the knowledge graph (bypassing Dreamer)
- The final output never addresses the user's original question about migration status
