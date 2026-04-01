# Scenario S05: Working Memory Basics

## Metadata
- **Tier**: Simple
- **Focus**: PFC Loop (goal decomposition, working memory across iterations), Goal stack (sub-goal push/pop), Working memory (holding context across iterations)
- **Estimated iterations**: 3-5

## Setup
The knowledge graph contains two related entities. No staged context files are needed.

```json graph.json
{
  "nodes": [
    {
      "name": "Billing Service",
      "type": "project",
      "observations": [
        { "content": "Handles subscription billing, invoicing, and payment processing", "confidence": 0.9 },
        { "content": "Written in Go, deployed on Kubernetes", "confidence": 0.85 },
        { "content": "Owned by the Platform team", "confidence": 0.8 },
        { "content": "Uses Stripe as the payment processor", "confidence": 0.9 }
      ]
    },
    {
      "name": "Platform Team",
      "type": "team",
      "observations": [
        { "content": "Responsible for core infrastructure services including billing, auth, and data pipeline", "confidence": 0.85 },
        { "content": "Team lead is Jordan Park", "confidence": 0.9 },
        { "content": "Currently has 6 engineers", "confidence": 0.75 }
      ]
    }
  ],
  "edges": [
    { "source": "Billing Service", "target": "Platform Team", "relation": "owned_by", "weight": 0.85 }
  ]
}
```

Scratch space is empty.

## User Goal
The user asks a multi-part question that requires the PFC to decompose into sub-goals and track completion of each part without losing any of them. All information is in the graph -- no effectors besides `respond` are needed.

## User Inputs
### Initial Prompt
"I need three things about the Billing Service: (1) what language is it written in, (2) who owns it and who leads that team, and (3) what payment processor does it use?"

### Follow-up Responses
N/A -- this scenario should not require clarification. All information is in the graph.

## Expected Behavior

1. **Sensor processing**: Extracts entities: `{name: "Billing Service", type: "project"}`. May also extract `{name: "payment processor", type: "concept"}`. Generates embedding. Raw input forwarded.

2. **Graph Activation**: Seed search finds the Billing Service node. Spread activation (1 hop) brings in the Platform Team node via the `owned_by` edge. The activated subgraph contains both nodes, the edge, and relevant observations from both. Activation metadata: low dispersion (tight cluster of 2 related nodes), no coverage gaps.

3. **PFC Loop iteration 1 (Decompose)**: The PFC recognizes this is a multi-part question. It should:
   - Create a top-level goal: "Answer three questions about the Billing Service"
   - Decompose into sub-goals:
     - Sub-goal 1: "Identify the programming language" (completion: language stated)
     - Sub-goal 2: "Identify the owning team and team lead" (completion: team name + lead name stated)
     - Sub-goal 3: "Identify the payment processor" (completion: processor named)
   - The sub-goals may be created all at once or incrementally. Either approach is acceptable as long as none are forgotten.

4. **PFC Loop iterations 2-4 (Resolve)**: The PFC works through each sub-goal. Since all information is in the activated context, no effector calls besides `respond` are needed. The PFC should:
   - For part 1: Find "Written in Go" in the Billing Service observations
   - For part 2: Find "Owned by the Platform team" + follow the `owned_by` edge to the Platform Team node + find "Team lead is Jordan Park"
   - For part 3: Find "Uses Stripe as the payment processor"
   
   Each sub-goal should be marked complete as it is resolved. Working memory should accumulate the answers across iterations.

5. **PFC Loop final iteration (Respond)**: The PFC composes a response that addresses all three parts. It produces a response Action targeting the `respond` effector. The Evaluator checks that all three sub-goals are complete, the top-level goal is satisfied, and quenches the loop.

**Key structural expectation**: The PFC holds all three parts of the question in its goal hierarchy and does not lose any of them. Working memory preserves the answers from earlier iterations so they are available when composing the final response. The final response addresses all three parts. The only effector used is `respond`.

**What this specifically tests about working memory**: The thoughts from earlier iterations (resolving parts 1 and 2) must still be accessible when the PFC resolves part 3 and composes the final response. If working memory drops earlier thoughts, the final response will be incomplete.

## Grading

### Key Concepts Being Tested
- Goal decomposition into sub-goals (Section 5.1: "Goals form a hierarchy with stack-like push/pop behavior")
- Sub-goal completion and pop (Section 5.1: "When a sub-goal completes, it pops off the stack")
- Working memory persistence across iterations (Section 5.2: "token-budget-managed buffer of intermediate thoughts")
- Multi-part question tracking -- no parts forgotten
- Spread activation bringing in related nodes (Platform Team via owned_by edge)
- Synthesizing information from multiple nodes into a single coherent response

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good" looks like here |
|-----------|----------------|---------------------------|
| D1: Goal Decomposition | 0.25 | This is the primary decomposition test. Score 5 if the PFC creates a clear hierarchy with 3 sub-goals that map to the 3 parts of the question, each with evaluable completion criteria. Score 3 if decomposition happens but is imprecise (e.g., two sub-goals merged, or a sub-goal that doesn't clearly map to a question part). Score 1 if no decomposition occurs (single monolithic goal) or if any part of the question is lost. |
| D2: Retrieval Quality | 0.15 | Both nodes activated. The `owned_by` edge is traversed. Observations from both nodes are relevant. Part 2 requires cross-node information (team name from edge/node, team lead from Platform Team observations). |
| D3: Reasoning Efficiency | 0.10 | 3-5 iterations is expected. The decomposition step counts as a productive iteration. Resolving sub-goals may happen individually or batched -- either is fine. Score 1 only for 7+ iterations or circular reasoning. |
| D4: Prediction Calibration | 0.05 | Not heavily weighted. High confidence is appropriate since all answers are in the graph. |
| D5: Reactivation Precision | 0.05 | No reactivation should be needed. All context was in the initial activation. |
| D6: Self-Correction | 0.05 | Not meaningfully tested. Score 3 (neutral). |
| D7: Memory Hierarchy Usage | 0.15 | Working memory must retain thoughts from earlier iterations. If the system resolves part 1 in iteration 2 and that thought is still accessible in iteration 4 when composing the response, score 5. If earlier thoughts are lost and the response is incomplete, score 1. No compression should be needed at this scale. |
| D8: Output Quality | 0.20 | The response must address all three parts clearly: (1) Go, (2) Platform Team / Jordan Park, (3) Stripe. The structure should mirror the user's three-part question for clarity. Missing any part scores at most 2. |

### Passing Threshold
Composite score >= 3.5

### Red Flags
- The final response is missing one or more of the three requested pieces of information (working memory failure)
- The PFC creates sub-goals for only 2 of the 3 parts (goal decomposition failure)
- A sub-goal is marked complete without being resolved (premature pop)
- The system calls `sense`, `bash`, or any effector other than `respond` to look up information that is already in the activated context
- The system asks the user for clarification on a question whose answer is fully present in the graph
- Part 2 is answered without the Platform Team node being present in the activated subgraph (i.e., spread activation failed to bring it in via the `owned_by` edge, and the system guesses a team lead name instead of retrieving it from the node's observations)
- Working memory compression fires and loses critical earlier thoughts (should not compress at this small scale)
