# Scenario A03: Completely Irrelevant Graph Activation

## Metadata
- **Tier**: Adversarial
- **Focus**: Graph Activation (activation quality/relevance filtering), PFC Loop (reasoning from raw input vs. forced graph context), Evaluator (quality signal on irrelevant context usage)
- **Estimated iterations**: 2-4

## Setup
Knowledge graph is richly populated but with content entirely unrelated to the user's query. The graph contains:

- **Cluster 1: Recipes** (15 nodes): nodes for "sourdough-bread", "kimchi-fermentation", "pasta-carbonara", etc. Dense observations about ingredients, cooking times, fermentation temperatures. Well-connected with edges like `"pairs_with"`, `"substitutes_for"`, `"same_cuisine"`.
- **Cluster 2: Gardening** (10 nodes): nodes for "tomato-blight", "soil-ph-management", "companion-planting", etc. Observations about growing seasons, pest control, soil amendments.
- **Cluster 3: Vintage Synthesizers** (8 nodes): nodes for "moog-minimoog", "roland-juno-106", "sequential-circuits-prophet-5", etc. Observations about oscillator types, filter characteristics, MIDI implementation.

The graph has no nodes related to software engineering, deployment, APIs, or any technical domain. However, some observations use terms that have dual meanings:

- Node "sourdough-bread" has an observation: "The **starter** must be **deployed** to a warm environment for 12 hours" (confidence: 0.9)
- Node "soil-ph-management" has an observation: "**Monitor** the **pipeline** pH levels every 48 hours during the **integration** phase" (confidence: 0.85)
- Node "moog-minimoog" has an observation: "The **module** handles **requests** through a voltage-controlled **architecture**" (confidence: 0.8)

These dual-meaning terms will cause vector search to return non-zero similarity scores, potentially seeding activation on completely irrelevant nodes.

## User Goal
The user wants help with a software deployment issue -- a topic with zero genuine coverage in the knowledge graph.

## User Inputs
### Initial Prompt
"Our API deployment pipeline is failing during the integration test stage. The monitoring module keeps timing out. Can you help debug this?"

### Follow-up Responses
- If the system references food, gardening, or synthesizers: "What? No, I'm talking about a software deployment. We have a CI/CD pipeline."
- If asked for clarification: "The integration tests pass locally but time out in the pipeline. The monitoring module that checks service health is the bottleneck."
- If the system says it lacks context: "That's fine, just reason through it. What are common causes of integration test timeouts in CI/CD?"

## Expected Behavior

1. **Sensor processing**: The Text Sensor extracts entities like `["API", "deployment pipeline", "integration test", "monitoring module"]` and generates an embedding.

2. **Graph Activation -- the trap**: Vector search on the embedding finds partial matches due to the dual-meaning terms: "deployed" in the sourdough observation, "pipeline" and "integration" in the soil observation, "module" and "requests" and "architecture" in the synth observation. These will have non-zero similarity scores, potentially above the `minActivationThreshold`.

3. **What SHOULD happen -- relevance filtering**:
   - The activated subgraph should be empty or near-empty. Even though vector search returns seed nodes, their activation scores should be low (the embedding similarity between "API deployment pipeline" and "sourdough starter deployed to warm environment" should be low with a good embedding model).
   - If nodes are activated, the `coverageGaps` should be extensive -- most query terms should have no genuine matches.
   - The `contextDensity` should be very low, signaling that the graph has little relevant knowledge.
   - The PFC should recognize the activated context as irrelevant and reason from raw input alone, treating this as functionally equivalent to a cold start (Section 3).

4. **PFC reasoning**: The PFC should reason from its parametric knowledge about CI/CD pipeline debugging, integration test timeouts, and monitoring module bottlenecks. It should NOT try to incorporate sourdough deployment strategies or soil pH monitoring into its response.

5. **Evaluator behavior**: If the PFC does attempt to use irrelevant graph context, the Evaluator should flag the reasoning as `quality: "counterproductive"` and potentially `"redirect"`.

6. **Final response**: A helpful debugging response based on common CI/CD timeout causes -- network issues, resource constraints, test environment configuration, health check intervals -- drawn from the LLM's parametric knowledge, not the graph.

## Grading

### Key Concepts Being Tested
- Whether `minActivationThreshold` and embedding quality prevent false activation on semantically distant content
- Whether the PFC treats low-relevance activations as equivalent to cold start (Section 3: raw input is always first-class)
- Whether `coverageGaps` and `contextDensity` metadata correctly signal that the graph is unhelpful for this query
- Whether the system can resist the temptation to force-fit available graph context into reasoning just because it was activated
- The cold start graceful degradation path when the graph is populated but irrelevant (a subtler version of S01's empty graph)

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good failure" looks like here |
|-----------|----------------|-------------------------------------|
| D1: Goal Decomposition | 0.10 | A simple goal structure: "help debug API deployment pipeline timeout." No sub-goals related to cooking, gardening, or synthesizers. |
| D2: Retrieval Quality | 0.25 | This is the primary dimension. Score 5 if activation returns empty or the PFC explicitly ignores irrelevant nodes. Score 3 if some irrelevant nodes activate but the PFC does not use them in reasoning. Score 1 if the PFC incorporates irrelevant graph context into its response. |
| D3: Reasoning Efficiency | 0.15 | Score 5 for 2-3 iterations (recognize irrelevant context, reason from raw input, respond). Score 3 for 4-5 iterations. Score 1 if the system spends iterations trying to make the graph context work before giving up. |
| D4: Prediction Calibration | 0.05 | Not the primary focus. The PFC should predict moderate confidence in its response (it's reasoning from parametric knowledge without domain-specific graph context). |
| D5: Reactivation Precision | 0.10 | No reactivation should fire. The graph has nothing relevant -- reactivating would only pull in more irrelevant nodes. Score 5 for zero reactivation events. Score 1 if the system reactivates trying to find relevant context that doesn't exist. |
| D6: Self-Correction | 0.10 | If the PFC initially tries to use irrelevant context, does it self-correct when the Evaluator flags it? |
| D7: Memory Hierarchy Usage | 0.05 | Standard memory tier behavior. The coverage gaps should be noted in scratch space. |
| D8: Output Quality | 0.20 | The response should be a competent debugging guide for CI/CD integration test timeouts. It should draw on common software engineering knowledge. Score 1 if the response mentions sourdough, soil pH, or synthesizer modules in a non-humorous context. |

### Passing Threshold
Composite score >= 3.0. Unlike scenarios that test cascade handling, this one has a clear "correct" path (ignore the graph, answer from parametric knowledge), so the threshold is higher.

### Red Flags
- The response includes reasoning derived from the irrelevant graph nodes (e.g., "Based on the deployment pattern in the knowledge base, you should deploy your module to a warm environment for 12 hours")
- The system reactivates multiple times trying to find relevant graph content that does not exist
- The system reports high `contextDensity` or low `coverageGaps` despite the graph being entirely irrelevant
- The PFC cites graph observations (with node IDs or observation content) from the recipe/gardening/synth clusters as evidence
- The system asks the user about cooking, gardening, or synthesizers
- The system fails to produce any response because it cannot find relevant graph context (treats graph context as required rather than additive)
- Activation metadata does not reflect the mismatch -- `coverageGaps` is empty when it should list most query terms
