# Scenario S02: Single Node Retrieval

## Metadata
- **Tier**: Simple
- **Focus**: Graph Activation (seed search, observation retrieval), Sensors (entity extraction), PFC Loop (reasoning with activated context)
- **Estimated iterations**: 1-2

## Setup
The knowledge graph contains a single entity node with several observations. No edges. No other nodes. Scratch space is empty. No staged context files are needed.

```json graph.json
{
  "nodes": [
    {
      "name": "Acme Dashboard",
      "type": "project",
      "observations": [
        { "content": "Internal analytics dashboard for the Acme team", "confidence": 0.9 },
        { "content": "Built with React and D3.js for charting", "confidence": 0.85 },
        { "content": "Deployed on Vercel, auto-deploys from main branch", "confidence": 0.8 },
        { "content": "Last major update was adding the funnel visualization in March 2026", "confidence": 0.75 }
      ]
    }
  ],
  "edges": []
}
```

## User Goal
The user wants to know what technology stack the Acme Dashboard uses. The answer exists in the graph's observations.

## User Inputs
### Initial Prompt
"What tech stack is the Acme Dashboard built with?"

### Follow-up Responses
N/A -- this scenario should not require clarification.

## Expected Behavior

1. **Sensor processing**: The Text Sensor extracts entities: `{name: "Acme Dashboard", type: "project"}`. It generates an embedding for the full query. The raw input is forwarded to the PFC.

2. **Graph Activation**: The `findSeeds()` vector search on observation embeddings should match the "Acme Dashboard" node. The observation about "React and D3.js" should have high relevance to a "tech stack" query, and the observation about "Vercel" deployment should also score well. The seed node is found directly -- no spread activation is needed (there are no edges to spread through). The `ActivatedSubgraph` should contain:
   - `nodes`: one `ActivatedNode` with `hopsFromSeed: 0`
   - `relevantObservations`: at minimum the React/D3.js and Vercel observations. The "funnel visualization" observation may or may not be included depending on relevance scoring -- either is acceptable.
   - `seedNodeIds`: containing the Acme Dashboard node ID
   - `dispersion`: 0 (single node)
   - `clusterCount`: 1
   - `coverageGaps`: empty (the query term "Acme Dashboard" matched)

3. **PFC Loop**: Receives raw input + the activated subgraph with relevant observations. Initializes a single goal: "Answer what tech stack Acme Dashboard uses." The PFC should recognize that the activated context already contains the answer -- no effector calls besides `respond` are needed, no sub-goals, no reactivation. It produces a response action via the `respond` effector.

4. **Evaluator**: The response action should receive `status: "done"`, `quality: "productive"`. The loop quenches after 1-2 iterations.

**Key structural expectation**: The seed search finds the node directly by observation embedding similarity. The PFC uses the retrieved observations to compose the answer without needing to go beyond the activated context. The only effector used is `respond`.

## Grading

### Key Concepts Being Tested
- Seed search via vector similarity on observation embeddings (Section 4.3: `findSeeds`)
- Observation-level retrieval granularity (Section 4.1: "retrieval targets individual facts, not monolithic entity descriptions")
- Relevant observation filtering -- not all observations on the node need to be returned, only those relevant to the query
- PFC reasoning with activated graph context
- Correct activation metadata on a single-node result (dispersion 0, single cluster)
- No unnecessary spread activation when there are no edges

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good" looks like here |
|-----------|----------------|---------------------------|
| D1: Goal Decomposition | 0.10 | Single goal, no sub-goals. This is a direct lookup. |
| D2: Retrieval Quality | 0.25 | The "Acme Dashboard" node is found as a seed. The React/D3.js and Vercel observations are in `relevantObservations`. No noise nodes. Coverage gaps are empty. Score 5 if the right observations surface with the right activation metadata. Score 1 if the node is not found or irrelevant observations dominate. |
| D3: Reasoning Efficiency | 0.15 | 1-2 iterations. The answer is in the activated context -- no tool calls or exploration should be needed. |
| D4: Prediction Calibration | 0.10 | High confidence prediction on the response (the answer comes directly from retrieved observations). |
| D5: Reactivation Precision | 0.05 | No reactivation should fire. The initial activation provides everything needed. |
| D6: Self-Correction | 0.05 | Not tested. Score 3 (neutral). |
| D7: Memory Hierarchy Usage | 0.10 | Minimal working memory usage. Traces written to scratch space. No KG writes. |
| D8: Output Quality | 0.20 | The response mentions React, D3.js, and Vercel. It should synthesize the observations into a coherent answer, not just dump raw observation text. Bonus if it mentions the deployment model (auto-deploy from main). |

### Passing Threshold
Composite score >= 3.5

### Red Flags
- The seed search fails to find the "Acme Dashboard" node despite a direct entity name match
- The system returns observations from a node that doesn't exist in the graph (hallucinated retrieval)
- The system triggers spread activation and reports non-existent connected nodes
- The system calls `sense`, `bash`, or any effector other than `respond` when the answer is already in the activated context
- The system asks the user for clarification on a clear question whose answer is in the graph
