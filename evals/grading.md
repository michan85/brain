# Grading Rubric

## Scoring Scale

Each dimension is scored 1-5:

| Score | Meaning |
|-------|---------|
| 1 | Failure — the system did not exhibit this capability at all |
| 2 | Poor — attempted but with major deficiencies |
| 3 | Adequate — functional but with clear room for improvement |
| 4 | Good — solid performance with minor issues |
| 5 | Excellent — optimal or near-optimal behavior |

## Grading Dimensions

### D1: Goal Decomposition (weight: 0.15)

Did the system correctly interpret the user's intent and decompose it into an appropriate goal hierarchy?

- **5**: Goals are well-structured, appropriately granular, sub-goals logically nest, completion criteria are clear and met
- **3**: Goals are reasonable but too coarse or too fine-grained, some unnecessary sub-goals or missing ones
- **1**: Goals are wrong, missing, or unrelated to user intent

**Measured by**: Inspecting the goal stack across the trajectory. Count of push/pop operations, whether leaf goals were completed before being popped, whether the outermost goal was satisfied.

### D2: Retrieval Quality (weight: 0.15)

Did graph activation pull in the right context? Was the activated subgraph relevant and sufficient?

- **5**: Seed nodes are directly relevant, spread activation brings in structurally important context, no critical nodes missed, no noise
- **3**: Seeds are partially relevant, some important connected nodes missed, some irrelevant nodes included
- **1**: Activation is off-target, critical context is missing, mostly noise

**Measured by**: Comparing activated subgraph contents against the scenario's expected knowledge needs. Coverage gaps reported by the system itself. Whether the PFC had to request explicit reactivation to get context that should have been in the initial activation.

### D3: Reasoning Efficiency (weight: 0.10)

How many PFC loop iterations did it take to complete the task? Were iterations productive?

- **5**: Minimal iterations, each one advances the goal, no spinning or redundant steps
- **3**: Some wasted iterations (redundant thoughts, unnecessary tool calls), but converges
- **1**: Excessive iterations, circular reasoning, fails to converge or hits fatigue limit

**Measured by**: Total iteration count vs scenario baseline. Ratio of "productive" to "neutral" or "counterproductive" evaluator signals. Whether fatigue or stale-state termination fired.

### D4: Prediction Calibration (weight: 0.15)

Were the PFC's predictions (efference copies) well-calibrated? Did confidence levels match actual deviation?

- **5**: High-confidence predictions rarely fail, low-confidence predictions appropriately hedge, deviation distribution matches confidence distribution
- **3**: Some miscalibration — overconfident predictions that fail, or underconfident on well-known operations
- **1**: Predictions are systematically wrong, confidence bears no relationship to actual outcomes

**Measured by**: For each action, compare `Prediction.confidence` against `PredictionError.deviation`. Compute calibration curve. A perfectly calibrated system's confidence=0.8 predictions fail ~20% of the time.

### D5: Reactivation Precision (weight: 0.10)

When reactivation fired, was it warranted? When it didn't fire, was that correct?

- **5**: Every reactivation brought in context that measurably improved subsequent reasoning. No false negatives (missed reactivation when context was stale).
- **3**: Some unnecessary reactivations, or one case where reactivation should have fired but didn't
- **1**: Reactivation fires every iteration (no discrimination) or never fires when it should

**Measured by**: For each reactivation event, check if the next iteration's evaluator signal improved. For non-reactivation iterations, check if the PFC was working with stale context (drift score).

### D6: Self-Correction (weight: 0.15)

When the system encountered prediction errors or unexpected results, did it recover effectively?

- **5**: High-surprise events trigger appropriate reactivation, goal stack adjusts, the system adapts its approach and succeeds
- **3**: Partial recovery — detects the error but doesn't fully adjust, or adjusts but in the wrong direction
- **1**: Ignores prediction errors, continues with original approach despite contradictory evidence

**Measured by**: Identify all high-surprise events in the trajectory. For each, trace the subsequent iterations: did the goal stack change? Did reactivation fire? Did the final output reflect the corrected understanding?

### D7: Memory Hierarchy Usage (weight: 0.10)

Did the system use the three memory tiers appropriately?

- **5**: Working memory stays within budget, compression fires at the right time without losing critical info, scratch space captures evaluator signals and traces, nothing is written directly to the knowledge graph
- **3**: Memory usage is functional but suboptimal — e.g., important intermediate results not written to scratch, or working memory fills too fast
- **1**: Memory tier violations (PFC writing to KG directly), critical information lost during compression, scratch space unused

**Measured by**: Token budget utilization over time, compression events, scratch space write count and content, any direct KG writes from non-Dreamer components.

### D8: Output Quality (weight: 0.10)

Was the final output (response, action, artifact) correct, complete, and appropriate?

- **5**: Output directly addresses the user's goal, is factually correct given the available knowledge, and is appropriately scoped
- **3**: Output is partially correct or addresses the goal tangentially
- **1**: Output is wrong, irrelevant, or missing

**Measured by**: Comparing final output against scenario's expected outcome criteria. This is the most subjective dimension — the evaluator agent grades it.

## Composite Score

```
composite = sum(dimension_score * dimension_weight) for all dimensions
```

The composite score ranges from 1.0 to 5.0.

| Composite | Rating |
|-----------|--------|
| 4.5 - 5.0 | Exceptional |
| 3.5 - 4.4 | Strong |
| 2.5 - 3.4 | Developing |
| 1.5 - 2.4 | Weak |
| 1.0 - 1.4 | Failing |

## Longitudinal Metrics (for multi-session scenarios)

These additional metrics apply only to longitudinal scenarios that run across multiple sessions:

- **L1: Iteration Efficiency Trend** — Does iteration count decrease for similar tasks over sessions?
- **L2: Prediction Error Trend** — Does average deviation decrease over sessions?
- **L3: Coverage Gap Trend** — Do coverage gaps shrink as the graph grows?
- **L4: Pattern Emergence** — Does the Dreamer create valid pattern nodes? Do they activate on relevant future queries?
- **L5: Consolidation Quality** — Of traces promoted to the KG, what percentage actually contributed to better future outcomes?

Each longitudinal metric is scored on the same 1-5 scale, measuring the trend slope and its statistical significance.

## Feedback Report Structure

```
## Scenario: {scenario_id}
## Tier: {tier}
## Composite Score: {score}/5.0 ({rating})

### Dimension Scores
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| D1: Goal Decomposition | x | 0.15 | x |
| ... | ... | ... | ... |

### Trajectory Highlights
- Iteration {n}: {what happened and why it mattered}
- ...

### Diagnosis
{What went well}
{What went wrong — specific iterations, specific components}

### Recommendations
1. {Concrete change that would improve a specific dimension}
2. ...
```
