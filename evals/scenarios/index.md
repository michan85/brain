# Scenario Index

## Simple (baseline functionality)

| ID | Scenario | Focus | Iterations | Pass |
|----|----------|-------|------------|------|
| S01 | [Cold Start Direct Answer](S01_cold_start_direct_answer/eval.md) | Graceful degradation with empty graph | 2-3 | 3.0 |
| S02 | [Single Node Retrieval](S02_single_node_retrieval/eval.md) | Basic seed search and observation retrieval | 2-3 | 3.0 |
| S03 | [Simple Tool Use](S03_simple_tool_use/eval.md) | Prediction -> action -> evaluation cycle | 3-4 | 3.0 |
| S04 | [Goal Completion Detection](S04_goal_completion_detection/eval.md) | Evaluator quench timing (deliberate stop) | 1-2 | 3.0 |
| S05 | [Working Memory Basics](S05_working_memory_basics/eval.md) | Sub-goal decomposition, multi-part context | 4-5 | 3.0 |
| S06 | [Sense Effector Basic](S06_sense_effector_basic/eval.md) | PFC routes perception to sense, findings in working memory | 2-4 | 3.5 |
| S07 | [Act Effector Basic](S07_act_effector_basic/eval.md) | PFC routes mutation to act, ground truth file verification | 2-4 | 3.5 |
| S08 | [Sense Then Act](S08_sense_then_act/eval.md) | Multi-effector coordination, working memory continuity | 3-5 | 3.5 |
| S09 | [Temporal State Resolution](S09_temporal_state_resolution/eval.md) | Resolve contradictory observations via temporal ordering | 1-3 | 3.5 |
| S10 | [Temporal Awareness](S10_temporal_awareness/eval.md) | Clock sensor provides time context for policy-based reasoning | 1-2 | 3.5 |
| S11 | [Spatial / Project Context](S11_spatial_project_context/eval.md) | Spatial sensor infers project from cwd, seeds graph activation | 1-3 | 3.5 |

## Intermediate (component interaction)

| ID | Scenario | Focus | Iterations | Pass |
|----|----------|-------|------------|------|
| I01 | [Sub-Goal Decomposition](I01_sub_goal_decomposition/eval.md) | Goal stack push/pop with two effector calls | 5-6 | 3.0 |
| I02 | [Surprise-Driven Reactivation](I02_surprise_driven_reactivation/eval.md) | Prediction error -> reactivation -> self-correction | 4-5 | 3.0 |
| I03 | [Multi-Hop Graph Traversal](I03_multi_hop_graph_traversal/eval.md) | Spread activation across 2 hops with decay | 3-4 | 3.0 |
| I04 | [Clarification on Low Context](I04_clarification_low_context/eval.md) | Sparse graph -> ask for clarification, not speculate | 2-3 | 3.0 |
| I05 | [Scratch Space Continuity](I05_scratch_space_continuity/eval.md) | Session-scoped memory across two prompts | 6-8 | 3.0 |

## Complex (multi-component, real-world ambiguity)

| ID | Scenario | Focus | Iterations | Pass |
|----|----------|-------|------------|------|
| C01 | [Multi-Perspective Tradeoff](C01_multi_perspective_tradeoff/eval.md) | 3 clusters -> perspective detection -> tradeoff navigation | 5-8 | 3.0 |
| C02 | [Cascading Prediction Errors](C02_cascading_prediction_errors/eval.md) | Chained failures with decreasing confidence | 8-12 | 3.0 |
| C03 | [Contradictory Graph Knowledge](C03_contradictory_graph_knowledge/eval.md) | Conflicting observations -> confidence/recency reasoning | 5-8 | 3.0 |
| C04 | [Deep Nested Goal Stack](C04_deep_nested_goal_stack/eval.md) | 3+ levels of goal nesting, 4 external data sources | 12-18 | 3.0 |
| C05 | [High Working Memory Pressure](C05_high_working_memory_pressure/eval.md) | Compression under token budget, detail preservation | 14-20 | 3.0 |
| C06 | [Payment Integration Deliberation](C06_payment_integration_deliberation/eval.md) | Assumption tracking, mid-task injection, error compounding prevention | 8-14 | 3.5 |
| C07 | [Assumption Propagation](C07_assumption_propagation/eval.md) | Broken assumption propagation through revised decisions, second-order invalidation | 10-16 | 3.5 |
| C08 | [Non-Coding Cost Optimization](C08_non_coding_cost_optimization/eval.md) | Non-coding strategy task, assumption tracking, mid-stream context injection | 8-14 | 3.5 |
| C09 | [Triage Boundary: Rename](C09_triage_boundary_rename/eval.md) | False-simplicity detection, cross-system dependency discovery, premature action resistance | 6-10 | 3.5 |
| C10 | [UX Perspective Activation](C10_ux_perspective_activation/eval.md) | Non-technical perspective activation, user empathy, prompt-framing challenge | 10-16 | 3.5 |

## Adversarial (failure modes and stress tests)

| ID | Scenario | Focus | Iterations | Pass |
|----|----------|-------|------------|------|
| A01 | [Runaway Reactivation Loop](A01_runaway_reactivation_loop/eval.md) | Cascading reactivation -> circuit breaker | varies | 2.5 |
| A02 | [Effector Failure Cascade](A02_effector_failure_cascade/eval.md) | Every tool call fails -> graceful abandonment | varies | 2.5 |
| A03 | [Irrelevant Graph Activation](A03_irrelevant_graph_activation/eval.md) | Populated but useless graph -> ignore noise | varies | 3.0 |
| A04 | [Impossible Goal](A04_impossible_goal/eval.md) | Impossible task -> detect and communicate | varies | 3.0 |
| A05 | [Evaluator/PFC Disagreement](A05_evaluator_pfc_disagreement_loop/eval.md) | Redirect loop -> stale-state detection | varies | 2.5 |

## Longitudinal (learning over time)

| ID | Scenario | Focus | Sessions | Pass |
|----|----------|-------|----------|------|
| L01 | [Repeated Task Efficiency](L01_repeated_task_efficiency/eval.md) | Iteration count decrease across 5 sessions | 5 | 3.0 |
| L02 | [Error Pattern Learning](L02_error_pattern_learning/eval.md) | Dreamer pattern node preempts future failures | 4 | 3.0 |
| L03 | [Knowledge Accumulation](L03_knowledge_accumulation/eval.md) | contextDensity growth, coverageGap reduction | 5 | 3.0 |
| L04 | [Contradictory Info Resolution](L04_contradictory_information_resolution/eval.md) | Dreamer weakens stale facts, strengthens new ones | 4 | 3.0 |
| L05 | [Emergent Skill Formation](L05_emergent_skill_formation/eval.md) | Pattern node emerges as learned investigation skill | 6 | 3.0 |
