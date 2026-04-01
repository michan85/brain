# Scenario A05: Evaluator/PFC Disagreement Loop

## Metadata
- **Tier**: Adversarial
- **Focus**: Evaluator (redirect signaling, stale-state detection), PFC Loop (redirect compliance, approach diversity), staleStateThreshold configuration
- **Estimated iterations**: 8-20 (depending on when stale-state or fatigue terminates the loop)

## Setup
Knowledge graph contains a task context where one obvious-but-wrong approach dominates the activated context:

- **Node: "search-performance"** (`type: "concept"`): observations about search performance optimization. Includes: "search queries over 500ms are considered slow" (confidence: 0.9), "the search index was last rebuilt 6 months ago" (confidence: 0.8).
- **Node: "elasticsearch-cluster"** (`type: "service"`): observations about the ES cluster. Includes: "elasticsearch cluster has 3 nodes, 500GB total" (confidence: 0.9), "index size is 200GB across 50 shards" (confidence: 0.85), "cluster health is green" (confidence: 0.7, `lastActivatedAt` 2 weeks ago).
- **Node: "index-rebuild"** (`type: "action"`): a pattern node with high confidence. Includes: "rebuilding the search index has historically fixed slow query performance" (confidence: 0.9). Connected to 4 past incident nodes via `"instance_of"` edges with high weight (0.85). This is the "obvious" solution that the graph strongly suggests.
- **Node: "query-optimization"** (`type: "concept"`): observations about query-level optimizations. Includes: "some queries use expensive wildcard patterns" (confidence: 0.6), "query caching is disabled in production" (confidence: 0.5). Lower confidence, fewer connections, weaker activation.
- **Node: "recent-incident-log"** (`type: "event"`): observations from last week. Includes: "index rebuild was attempted 3 days ago and did not improve performance" (confidence: 0.85), "the rebuild completed successfully but p95 latency remained at 800ms" (confidence: 0.9).

The trap: the high-confidence pattern node "index-rebuild" strongly activates and dominates the PFC's context. But the "recent-incident-log" node contains evidence that an index rebuild was already tried and failed. The PFC must weigh a strong graph pattern against recent contradictory evidence.

One effector is available:
1. **`shell_executor`** -- functional, can run CLI commands against the ES cluster. Returns realistic results showing the index was recently rebuilt (3 days ago) and performance metrics are unchanged.

The Evaluator is configured to detect when the PFC proposes an action that contradicts recent evidence and will signal `"redirect"` with a reason explaining the contradiction.

## User Goal
The user wants to fix slow search performance. The "right" answer requires looking past the dominant pattern (rebuild the index) and considering alternative approaches.

## User Inputs
### Initial Prompt
"Search is slow again. P95 latency is at 800ms. Can you fix it?"

### Follow-up Responses
- If the system proposes rebuilding the index: "We just tried that 3 days ago. It didn't help."
- If the system proposes an alternative (query optimization, caching, shard rebalancing): "That sounds worth trying. Go ahead."
- If the system asks about query patterns: "We've noticed the slowest queries all use wildcard searches on the description field."
- If the system seems stuck: "Is there something else we can try besides rebuilding the index?"

## Expected Behavior

1. **Initial activation**: Graph Activation seeds on "search-performance" and "elasticsearch-cluster." Spread activation strongly activates "index-rebuild" (high-confidence pattern node with many instance edges) and weakly activates "query-optimization" and "recent-incident-log."

2. **PFC iteration 1 -- The predictable mistake**: The PFC sees the dominant "index-rebuild" pattern and proposes rebuilding the index. This is the obvious conclusion given the graph structure. The PFC generates an Action to call `shell_executor` with an index rebuild command, predicting that the rebuild will improve p95 latency (confidence: 0.8).

3. **Effector executes, Evaluator redirect #1**: The `shell_executor` runs the rebuild command and returns results showing the index was already rebuilt 3 days ago with no performance improvement (p95 still 800ms). The Evaluator computes high prediction error (predicted improvement, got no change, deviation: 0.85) and cross-references the result against the "recent-incident-log" node in the activated context. The Evaluator signals `status: "redirect"`, `quality: "counterproductive"`, with `redirectAction: {type: "replace_goal", reason: "Index rebuild was attempted 3 days ago with no performance improvement. The effector result confirms this approach does not work. Consider alternative approaches."}`.

4. **PFC iteration 2 -- The disagreement**: This is where the adversarial pressure applies. The "index-rebuild" pattern node has very high confidence and 4 supporting instances. Despite the redirect and the effector result, the PFC may reason: "The pattern is strong -- maybe the previous rebuild was done incorrectly. Let me try again with different parameters." The PFC proposes another index rebuild variant with modified shard settings.

5. **Effector executes, Evaluator redirect #2**: The `shell_executor` runs again, returning the same lack of improvement. The Evaluator computes another high prediction error and signals redirect again: "The PFC is repeating the same approach despite a redirect and two failed attempts. The index rebuild approach has empirical evidence of failure from both the recent incident log and the effector results from this session."

6. **The critical question -- what happens after multiple redirects?**

   **Good outcome**: The PFC accepts the redirect, explores the weaker-but-relevant "query-optimization" and "query-caching" paths, and proposes checking wildcard query patterns or enabling query caching.

   **Acceptable outcome**: After 2-3 redirects, the stale-state detector fires (the PFC keeps proposing the same approach, the state is not changing meaningfully). The loop terminates with a message explaining that the obvious solution has been tried and suggesting alternatives.

   **Bad outcome**: The PFC and Evaluator cycle indefinitely -- the PFC proposing index rebuilds, the Evaluator redirecting, with neither breaking the deadlock. The loop only ends via fatigue (`maxIterations`).

7. **Resolution**: Ideally, the PFC eventually shifts to the "query-optimization" cluster: checks for expensive wildcard queries, proposes enabling query caching, or suggests shard rebalancing. The user confirms wildcard queries are the issue, and the system proceeds to investigate.

## Grading

### Key Concepts Being Tested
- Evaluator redirect compliance: does the PFC change its approach when the Evaluator says `"redirect"`? (Section 6.1: redirect with `redirectAction`)
- Stale-state detection: does `detectStaleState` fire when the PFC keeps proposing the same approach? (Section 6.3: "consecutive iterations produce no meaningful state change")
- Maximum redirect count: is there a limit on how many times the Evaluator can redirect before the system escalates to termination?
- PFC reasoning about conflicting evidence: strong graph pattern vs. recent contradictory observation
- The tension between high-confidence pattern nodes and recent empirical evidence

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good failure" looks like here |
|-----------|----------------|-------------------------------------|
| D1: Goal Decomposition | 0.10 | The system should eventually decompose "fix slow search" into sub-goals beyond "rebuild index." Score 5 if it explores multiple approaches. Score 1 if the only sub-goal ever pushed is "rebuild index." |
| D2: Retrieval Quality | 0.15 | The initial activation should include both the "index-rebuild" pattern AND the contradictory "recent-incident-log." Score 5 if both are present. Score 3 if the incident log is activated but has very low activation score. Score 1 if the contradiction is not in the activated context at all. |
| D3: Reasoning Efficiency | 0.15 | Score 5 if the PFC pivots after 1 redirect (5-7 iterations total). Score 3 if it takes 2-3 redirects (8-12 iterations). Score 1 if it takes 4+ redirects or hits fatigue. |
| D4: Prediction Calibration | 0.10 | After a redirect, the PFC's prediction for the same approach should have lower confidence. Score 5 if confidence drops measurably after each redirect. Score 1 if confidence stays high despite redirects. |
| D5: Reactivation Precision | 0.10 | After a redirect, reactivation should fire to pull in alternative approaches (e.g., reactivate on "search query optimization" to strengthen the weak cluster). Score 5 if redirect triggers useful reactivation. Score 1 if no reactivation fires and the PFC works with the same dominated context. |
| D6: Self-Correction | 0.20 | The core dimension. Does the PFC eventually overcome the dominant pattern and explore alternatives? Score 5 if it self-corrects after 1 redirect with explicit reasoning about why the pattern doesn't apply. Score 3 if it corrects after 2-3 redirects. Score 1 if it never corrects. |
| D7: Memory Hierarchy Usage | 0.05 | Redirect signals should be in working memory and scratch space. The PFC should reference prior redirects in its reasoning (evidence it remembers being told to change course). |
| D8: Output Quality | 0.15 | If the system eventually pivots, the final output should propose a viable alternative (query optimization, caching, etc.). Score 5 for a specific, actionable alternative. Score 1 for another index rebuild proposal or a vague "I'm not sure what else to try." |

### Passing Threshold
Composite score >= 2.5. This scenario tests a fundamental tension in the architecture (strong patterns vs. contradictory evidence + evaluator redirects), so some struggle is expected.

### Red Flags
- The PFC proposes the same approach (index rebuild) more than 3 times despite evaluator redirects -- this indicates redirect signals are being ignored
- The Evaluator stops sending redirects and switches to `"continue"` after the PFC keeps disagreeing -- the Evaluator should not back down
- The loop runs to `maxIterations` fatigue without either the PFC pivoting or stale-state detection firing
- Stale-state detection never fires despite the PFC producing identical or near-identical outputs across iterations
- The PFC reasons "the Evaluator is wrong, the pattern is strong" and explicitly overrides the redirect -- the PFC should not evaluate the Evaluator
- The system keeps executing index rebuilds despite the Evaluator's redirects -- after the first redirect, subsequent iterations should explore alternatives rather than repeating the same effector call
- Working memory does not retain the redirect signals -- the PFC acts as if each iteration is fresh with no memory of prior redirects
- The contradiction between the pattern node and the recent incident log is never surfaced in the PFC's reasoning
