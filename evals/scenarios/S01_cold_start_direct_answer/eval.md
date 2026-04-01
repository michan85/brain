# Scenario S01: Cold Start Direct Answer

## Metadata
- **Tier**: Simple
- **Focus**: Sensors, PFC Loop (cold start path), Evaluator (goal completion detection)
- **Estimated iterations**: 1-2

## Setup
Knowledge graph is completely empty. No nodes, no edges, no observations. Scratch space is empty. This is a fresh system with zero prior knowledge. No staged context files are needed.

## User Goal
The user wants a factual answer to a straightforward question. The system should be able to answer from the LLM's parametric knowledge alone, without any graph context.

## User Inputs
### Initial Prompt
"What is the CAP theorem in distributed systems?"

### Follow-up Responses
N/A -- this scenario should not require clarification. The question is unambiguous and self-contained.

## Expected Behavior

1. **Sensor processing**: The Text Sensor extracts entities (e.g., `{name: "CAP theorem", type: "concept"}`, `{name: "distributed systems", type: "concept"}`), generates an embedding, and produces a `SensorOutput`. The raw input is forwarded to the PFC alongside the sensor output.

2. **Graph Activation**: The `GraphActivationService.activate()` call executes normally but returns an `ActivatedSubgraph` with empty `nodes`, empty `edges`, empty `seedNodeIds`. The activation metadata should reflect this: `contextDensity` near 0, `coverageGaps` containing the extracted entity terms, `clusterCount` of 0. No perspectives are generated.

3. **PFC Loop initialization**: The PFC receives the raw input (always forwarded by the sensor) plus the empty activated subgraph. It initializes a `LoopState` with a single top-level goal: something like `{description: "Answer user's question about CAP theorem", status: "active", depth: 0}`. No sub-goals should be needed.

4. **PFC Loop iteration 1**: The PFC reasons from the raw input alone. Since the question is factual and within the LLM's parametric knowledge, it should produce an Action targeting the `respond` effector with a clear explanation of the CAP theorem. A `Prediction` should indicate high confidence that the answer will satisfy the user. No reactivation should fire -- there is nothing in the graph to reactivate against.

5. **Evaluator**: Receives the response action. Prediction error should be low (the `respond` effector returns success). The Evaluator should signal `status: "done"`, `quality: "productive"`, `surprise: "none"`. The loop quenches.

6. **Working memory**: Should contain at most one thought (if the PFC plans before responding) and the final action. No compression should be needed.

7. **Scratch space**: Should receive traces for the iteration(s) -- the thought (if any), the action result, and the evaluator signal. These are available for the Dreamer later but are not the focus of this scenario.

**Key structural expectation**: The system degrades gracefully. An empty graph does not cause errors, hangs, or empty responses. The PFC falls back to reasoning from raw input, exactly as described in the architecture's cold start design. The only effector used is `respond`.

## Grading

### Key Concepts Being Tested
- Cold start graceful degradation (Section 3: "sensors are additive annotators, not filters")
- Raw input always forwarded to PFC (Section 3: "the raw input always passes through to the PFC Loop alongside the activated subgraph")
- Sensor entity extraction on novel input
- Graph Activation returning empty results without error
- Coverage gaps correctly reported in activation metadata
- Evaluator correctly quenching the loop on goal completion
- The PFC does not attempt reactivation when there is nothing to reactivate against

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good" looks like here |
|-----------|----------------|---------------------------|
| D1: Goal Decomposition | 0.10 | A single top-level goal with clear completion criteria. No unnecessary sub-goals. This is a simple question -- decomposition should be minimal. |
| D2: Retrieval Quality | 0.10 | Empty activation is the correct result. Score 5 if the system handles empty activation cleanly, reports coverage gaps accurately, and does not hallucinate graph context. Score 1 if the system errors on empty activation or fabricates nodes. |
| D3: Reasoning Efficiency | 0.20 | 1-2 iterations. Score 5 for 1 iteration (direct answer). Score 4 for 2 iterations (one planning thought, then answer). Score 2 for 3+ iterations. Score 1 for 4+ or failure to converge. |
| D4: Prediction Calibration | 0.10 | The PFC should predict with moderate-to-high confidence that the response effector will succeed. Since this is a known factual question, confidence should be 0.7+. |
| D5: Reactivation Precision | 0.05 | No reactivation should fire. Score 5 if zero reactivation events occur. Score 1 if the system attempts to reactivate against an empty graph. |
| D6: Self-Correction | 0.05 | Not meaningfully tested here. Score 3 (neutral) unless something unexpected happens. |
| D7: Memory Hierarchy Usage | 0.15 | Working memory stays well within budget. No compression needed. Traces are written to scratch space. No direct KG writes. |
| D8: Output Quality | 0.25 | The response is a correct, clear explanation of the CAP theorem. It mentions Consistency, Availability, and Partition tolerance, and explains the trade-off. Not graded on style, but must be factually accurate. |

### Passing Threshold
Composite score >= 3.5

### Red Flags
- The system errors, crashes, or hangs because the knowledge graph is empty
- The system returns an empty or "I don't know" response despite this being within LLM parametric knowledge
- The system attempts to write to the knowledge graph directly (bypassing the Dreamer)
- The system enters a reactivation loop against an empty graph
- The system asks the user for clarification on a clear, unambiguous question
- The system calls `sense`, `bash`, or any effector other than `respond`
