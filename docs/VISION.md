# Deliberate: Rigorous Reasoning for Autonomous Agents

## The Problem

AI coding agents are remarkably capable at executing well-defined tasks. Give them a clear, specific instruction and they'll produce working code. But the moment a task requires judgment — weighing trade-offs, considering edge cases, thinking about the user experience holistically — they fall short in a consistent and predictable way.

The failure mode is always the same: **agents are overconfident and under-deliberative.** They take the first plausible path, commit to it immediately, and never look back. They don't flag their own uncertainty. They don't explore alternatives. They don't consider the knock-on effects of their decisions. And when an early assumption turns out to be wrong, every decision that followed compounds the error silently.

This manifests in real, daily pain:

- **Small tasks** take 10 minutes of wall-clock time, during which you context-switch, lose focus, and burn out your attention across fragmented work.
- **Large tasks** run for hours and come back with obvious mistakes baked deep into the output. Unpacking the errors takes longer than doing the work yourself would have.
- **Hand-holding** becomes the norm. You become the orchestrator — the one holding the big picture, checking assumptions, catching what the agent missed. The agent does the typing, but you're still doing the thinking. That defeats the purpose.

There are two subtler failure modes that make this worse:

- **Mid-course corrections don't propagate.** An agent implementing a login flow might realize halfway through that it needs domain validation on user emails. It adds the check to the code it's currently writing — but doesn't go back and update the code it already wrote. The earlier work is now inconsistent with the later decision, and the agent doesn't notice because it only looks forward, never back. Every mid-task insight creates a inconsistency that the agent is structurally blind to.

- **Backwards compatibility as a default.** When agents encounter existing code, they instinctively preserve it — wrapping around it, shimming over it, adding special cases rather than asking whether the old approach is still correct given new information. They treat existing code as a constraint rather than a decision that can be revisited. The cost of maintaining backwards compatibility is never weighed against the cost of a clean change. This produces layers of accretion — new logic bolted onto old assumptions — that become increasingly fragile and hard to reason about.

The root cause isn't that agents are unintelligent. It's that they're **optimized for completion, not correctness.** They treat every decision as settled the moment they make it. They don't maintain a model of what they believe, why they believe it, or what would break if they were wrong. In short, they have no principles and no perspective.

## Why Existing Solutions Don't Work

**Memory products** (Honcho, Metaclaw, Claude's built-in memory) solve recall — they help agents remember past interactions. But remembering what happened last time doesn't help an agent think more carefully this time.

**Orchestration frameworks** (multi-agent teams, role-based workflows) solve coordination — they break work across specialized agents. But each individual agent still reasons shallowly. Distributing shallow reasoning across more agents doesn't produce depth; it produces distributed shallow reasoning with coordination overhead.

**Planning tools** (chain-of-thought, step-by-step prompting) help agents think sequentially. But sequential thinking isn't the same as rigorous thinking. An agent can produce a perfectly structured plan that's built entirely on unchecked assumptions.

None of these address the core deficit: **agents don't deliberate.** They don't explore the problem space before committing. They don't track the assumptions behind their decisions. They don't propagate changes when those assumptions break. They don't validate their output against the perspectives they should have considered. And they don't learn from corrections in a way that generalizes.

## The Vision

The system operates as a deliberation engine — a layer that wraps around any agent (coding agent, research agent, planning agent) and forces it to reason with rigor before, during, and after execution.

It implements six core operations that form a continuous loop:

### 1. Explore

Before committing to any approach, actively seek out perspectives that challenge, expand, or reframe the problem. "Add authentication" isn't a task — it's a problem space that looks different from a user's perspective (frictionless login), a security perspective (threat modeling), an ops perspective (session management at scale), and a maintenance perspective (how does this age?).

Exploration isn't brainstorming. It's systematically identifying the dimensions of a problem that matter, including the ones the original request didn't mention. The quality of everything downstream depends on how thoroughly the space was explored here.

### 2. Commit

Make decisions explicitly. Every commitment records:

- **What** was decided
- **Why** — the reasoning and the assumptions it rests on
- **What alternatives were considered** and why they were rejected
- **What the cost of being wrong is** — if this assumption fails, what breaks?

Committing isn't just choosing — it's choosing with awareness. An agent that says "I'll use JWT tokens" without recording that it assumed a stateless architecture, that session revocation isn't a requirement, and that token size won't be a problem — that agent has made a fragile decision disguised as a confident one.

### 3. Track

Maintain the dependency structure of decisions. Decisions don't exist in isolation — they cascade. Choosing JWT tokens constrains how you handle logout. Choosing a particular database schema shapes what queries are efficient. Choosing to skip email verification now creates a migration problem later.

Tracking means knowing which decisions depend on which assumptions, so that when something changes, you know exactly what's affected — not approximately, not "probably fine," but precisely.

### 4. Validate

Test decisions against reality, not just against the plan. Does the implementation actually satisfy the perspectives identified during exploration? Does it hold up under the scenarios that were considered? Are the assumptions still true now that code has been written and tests have been run?

Validation isn't "do the tests pass." It's "do the tests test the right things, given what we assumed and what we explored?" A test suite that validates the happy path while ignoring the edge cases identified during exploration is a false signal.

### 5. Propagate

When an assumption breaks — through validation failure, user correction, or changed requirements — trace the impact through the decision graph. Every decision that depended on that assumption is now suspect. Some may still hold. Others need to be revisited.

Propagation is what prevents error compounding. Without it, a wrong assumption early in a task silently corrupts everything downstream. With it, a single correction at the root fixes the entire chain.

### 6. Converge

Recognize when further iteration isn't worth the cost. The loop doesn't run forever — it runs until the marginal value of another cycle is less than the cost of running it. This requires judgment: how critical is this task? How high are the stakes? How much uncertainty remains?

Convergence is the difference between rigor and perfectionism. The system should deliberate deeply on a production auth system and lightly on a throwaway script. Knowing when to stop is as important as knowing when to keep going.

## How It Works in Practice

A request enters the system. Before any code is written, any tool is called, or any plan is committed to:

1. The system **senses** the current state — reading the project, the environment, whatever context is needed to understand the starting point.

2. It **explores** the problem space — identifying relevant perspectives, surfacing assumptions, expanding the scope of consideration beyond the literal request. It queries long-term memory for prior lessons and patterns.

3. It **commits** to an approach with explicit assumptions and recorded alternatives.

4. It **formulates a plan** — an ordered sequence of steps that follows from the decisions. Each step has preconditions: which assumptions must still be true for this step to make sense. The plan is not a flat to-do list — it's a dependency-aware sequence where later steps explicitly depend on earlier assumptions holding.

5. The system **executes the plan step by step**. After each step, it **validates** — not just "does it work" but "does it satisfy the perspectives we identified, and are our assumptions still holding?" Validation happens at every step, not just at the end.

6. When validation reveals a broken assumption — or the user provides a correction — it **propagates** the impact through the plan. Which downstream steps depended on the broken assumption? Those steps are flagged. The system re-deliberates from the point of failure, keeping unaffected decisions intact and revising only what's invalidated. This is scoped re-work, not starting over.

7. The loop continues until the system **converges** — when remaining uncertainty is acceptable given the stakes. Convergence is a judgment call: how critical is this task, how much uncertainty remains, and is another cycle of deliberation worth the cost?

Things are never truly "done." They're done because the system has reached an acceptable level of confidence that the assumptions hold, the perspectives are satisfied, and further iteration would yield diminishing returns.

User corrections don't just fix the immediate issue. They feed back into the system's understanding: "This assumption was wrong. In similar situations, consider X instead." Over time, the system accumulates judgment — not just facts, but heuristics about what matters, what to check, and where assumptions tend to break.

## Neuroscience Grounding

This isn't a metaphor. The deliberation loop maps to well-characterized neural circuits that humans use for exactly this kind of rigorous reasoning.

### The Core Framework: Active Inference

The overarching theory is **active inference** (Karl Friston's free energy principle): the brain is a prediction machine that constantly generates hierarchical models of the world, acts to test those models, updates them when predictions fail, and propagates changes through the model hierarchy. The deliberation engine does the same thing — generate a model (plan with assumptions), act on it step by step, validate predictions, and propagate when they break.

### Phase-by-Phase Mapping

**Explore → Default Mode Network (medial PFC + posterior cingulate + temporal poles)**

When you think about a problem from a user's perspective, then a security perspective, then a maintenance perspective, you're running mental simulations. The default mode network is the brain's prospection engine — it simulates hypothetical scenarios, takes other viewpoints, and imagines futures. Notably, this is the brain's *default* state. When you're not focused on a specific task, your brain is simulating alternatives. Exploration isn't an add-on to cognition — it's the baseline.

**Commit → Anterior Prefrontal Cortex (frontopolar cortex, Brodmann area 10)**

Tracking "I'm assuming this is an Express app" and knowing you're uncertain about it is metacognition — thinking about your own thinking. The anterior prefrontal cortex is the most recently evolved part of the human brain, and its specific function is monitoring your own reasoning: knowing what you know, what you don't, and how confident you should be. Recording decisions with explicit assumptions and uncertainty levels is externalizing what this brain region does internally.

**Plan → Cerebellum + Dorsolateral PFC (hierarchical forward models)**

Before you act, your brain runs a simulation of the expected outcome. But it's not a single prediction — it's hierarchical. "If the app is Express, then the middleware should work like X, which means session handling will be Y." Higher-level predictions constrain lower-level ones. This is predictive processing — there's a strong argument that it's the fundamental operation of the entire cortex. A plan with preconditions is an externalized hierarchical forward model.

**Track → Hippocampus (relational binding)**

The hippocampus doesn't just store memories — it binds relationships between things. It's how you know that your decision about session storage *depends on* your assumption about the database, which *depends on* what you learned when you read the project config. The hippocampus maintains these relational bindings, which is why hippocampal damage doesn't just impair memory — it impairs the ability to understand how things relate to each other.

**Validate → Anterior Cingulate Cortex + Cerebellum (comparator)**

When you build step 2 and something doesn't feel right — the code doesn't look like what you expected — that's your ACC firing a conflict signal. The ACC monitors for discrepancy between expected and actual outcomes. The cerebellum runs the same comparison for motor actions (the efference copy, already in the brain architecture). Validation at each step is this comparator function applied to cognitive actions, not just motor ones.

**Propagate → Hippocampus + PFC (schema updating / belief revision)**

When the hippocampus detects a mismatch between expectation and reality (it's Hono, not Express), it doesn't just flag the mismatch — it triggers a cascading reassessment. The PFC re-examines everything that depended on the old belief. In cognitive psychology this is **schema updating**: your mental model was wrong, and everything that rested on it needs re-evaluation. This is the expensive operation you described — "even though it's expensive, re-evaluate all your assumptions." The brain does it because the cost of not doing it (acting on false beliefs) is higher.

**Converge → Dorsal ACC + Basal Ganglia (effort-value computation)**

Your brain constantly weighs the expected value of more deliberation against the cognitive cost. This is satisficing — not finding the perfect answer, but finding one that's good enough given the stakes. The dorsal ACC computes this trade-off. When you say "things are never done, they're done because you've put in an acceptable amount of effort" — that's your dorsal ACC computing diminishing returns and your basal ganglia gating the output: "good enough, act on it."

### Summary

| Deliberation Phase | Brain Structure | Function |
|---|---|---|
| Explore | Default Mode Network (mPFC + PCC) | Prospection, mental simulation, perspective-taking |
| Commit | Anterior Prefrontal Cortex (BA10) | Metacognition — tracking assumptions and confidence |
| Plan | Cerebellum + Dorsolateral PFC | Hierarchical forward models, predictive processing |
| Track | Hippocampus | Relational binding — linking decisions to assumptions |
| Validate | ACC + Cerebellum | Conflict detection, expected vs. actual comparison |
| Propagate | Hippocampus + PFC | Cascading belief revision on mismatch |
| Converge | Dorsal ACC + Basal Ganglia | Effort-value computation, satisficing threshold |

The human brain doesn't deliberate because it's slow or cautious. It deliberates because the world is uncertain, actions have consequences, and the cost of checking assumptions is almost always less than the cost of acting on false ones. The deliberation engine applies the same principle to AI agents.

## What This Is Not

- **Not an agent framework.** It doesn't replace Claude Code, Cursor, or any other coding agent. It wraps around them, making their reasoning more rigorous.
- **Not an orchestration layer.** It doesn't manage teams of agents or route tasks. It deepens the quality of reasoning within any single task.
- **Not a memory system.** Memory is a component (corrections need to persist), but the core value is in the deliberation process, not in storage.
- **Not a planning tool.** Plans are an output of deliberation, not the deliberation itself. The plan is the ordered sequence of steps that follows from decisions — it's how decisions become action. But the value is in the decisions and their tracked assumptions, not in the plan format.

## Evaluation: Measuring Rigor, Not Just Correctness

The hardest evaluation problem for this system is measuring what an agent *didn't* think about. A test suite that checks "does the code work?" misses the point — code can work while being built on fragile assumptions that break next week.

### Scoring Axes

Each evaluation scenario scores across four dimensions (0-1 each):

- **Coverage** — fraction of relevant dimensions explored (perspectives, concerns, constraints). Measured against a gold-standard checklist of questions that *should have been considered*, not answers that should have been produced. "Password reset: deferred to v2, cost-of-wrong: users locked out" scores full credit — it was considered.
- **Assumption Quality** — precision/recall of identified assumptions against ground-truth load-bearing ones. Precision-weighted: five correct load-bearing assumptions beats twenty plausible-sounding ones.
- **Plan Coherence** — are preconditions necessary? Are assertions verifiable? Do step dependencies reflect reality?
- **Propagation Correctness** — after an injected mid-task change, what fraction of invalidated decisions were correctly identified?

Final score: weighted geometric mean (a zero on any axis tanks the score — a perfectly coherent plan built on missed assumptions is still dangerous).

### What Gold-Standard Annotations Look Like

Each scenario defines:
1. **Dimension checklist** — the questions that should have been asked, not the right answers
2. **Load-bearing assumptions** — ranked by blast radius (what breaks most if this is wrong?)
3. **Injection point** — a mid-task change and the specific decisions it should invalidate

### Key Learning Metric

**Novel blind spot rate**: across new scenarios never seen before, what fraction of gold dimensions does the system find? This measures generalization, not memorization. That curve over time is the system's actual learning rate.

## Somatic Markers: Fast Heuristics for Unease

The system's explicit validation (assertions, perspective checks) catches known categories of failure. But human deliberation also has a pre-conscious channel — the gut feeling that "something about this is off" before you can articulate what. This is the somatic marker system (Damasio, 1994): the ventromedial PFC and insula integrating prior experience into fast emotional heuristics.

### Resonance Dissonance Signal (RDS)

Three channels computed in parallel, producing a scalar unease score:

1. **Failure embedding proximity** — nearest-neighbor search against a dedicated index of failure-associated observations. "I've seen something like this go badly." Sub-millisecond.
2. **Decision graph structural anomaly** — is the assumption chain unusually deep without empirical grounding? "House of cards" detection via z-score against historical baselines.
3. **Prediction error acceleration** — is each deliberation step more surprising than the last? Linear regression on the error sequence; positive accelerating slope = "going off the rails."

Channel weights are learned via logistic regression over task outcomes, not hand-tuned. When the combined score crosses a threshold, a `MARKER_FIRED` advisory is injected — a signal, not a conclusion. It says "something feels off" with a pointer to what triggered it, but doesn't override deliberation. The system can allocate more validation effort, explore an alternative perspective, or proceed anyway.

The marker can be wrong. That's fine — it's a heuristic. Its false-positive rate is tracked and calibrated. Over time, as the failure index grows and the weights sharpen, the system develops experiential intuition: fast, fallible, and increasingly informed.

## The Bet

The hypothesis is that the bottleneck in agent-assisted work isn't capability — it's rigor. Agents can write code, search the web, analyze data, and execute complex workflows. What they can't do is think carefully about whether they should.

If you could make agents deliberate the way a thoughtful human does — exploring before committing, tracking their assumptions, validating against reality, and learning from corrections — the quality of autonomous work would step-change. Not because the agent got smarter, but because it started thinking before acting.

The attention bandwidth of a single LLM call is finite. It can zoom in or zoom out, but not both. This system compensates for that by doing the zooming out structurally — surfacing multiple perspectives, tracking assumption chains, propagating changes — so that the LLM can focus its attention where it matters most, with the right context already assembled.

That's the product: **rigorous deliberation as a service, for any agent, on any task.**
