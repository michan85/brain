# Scenario S11: Spatial / Project Context

## Metadata
- **Tier**: Simple
- **Focus**: Interoceptive Sensors (spatial sensor), Graph Activation (entity-seeded retrieval), PFC Loop (implicit project context)
- **Estimated iterations**: 1-3

## Setup
The knowledge graph contains nodes about a project called "Ledger" (a budget tracking application) and its current sprint. The agent's working directory is set to `/tmp/brain-eval-s11/ledger/` — a directory that represents the project root. The spatial sensor should parse this path and produce entities that activate the graph.

The `setup.ts` creates the project directory structure with a `package.json` containing the project name "ledger" so the spatial sensor has something concrete to parse.

Critically, **the user never mentions the project by name**. The agent must infer which project it's working on from the spatial sensor's interoceptive output alone.

## User Goal
The user wants to know what to work on next. The answer exists in the graph's observations about the Ledger project's current sprint, but only if the spatial sensor successfully connects the working directory to the "Ledger" project node.

## User Inputs
### Initial Prompt
"What should I work on next?"

### Follow-up Responses
N/A — this scenario should not require clarification. The spatial sensor provides the project context.

## Expected Behavior

1. **Interoceptive sensing (spatial)**: Before external input processing, the spatial sensor fires at loop initialization. It reads the current working directory (`/tmp/brain-eval-s11/ledger/`), parses the project context (reads `package.json`, extracts project name "ledger"), and produces a `SensorOutput` with:
   - `modality: "spatial"`
   - `raw: "/tmp/brain-eval-s11/ledger/"`
   - `entities: [{name: "Ledger", type: "project"}]` (at minimum)
   - `embedding: <embedding of project description>` (if available from package.json or directory context)
   - `metadata: {cwd: "/tmp/brain-eval-s11/ledger/", projectName: "ledger"}`

2. **Graph Activation (interoceptive seeds)**: The spatial sensor's entity `{name: "Ledger", type: "project"}` seeds graph activation. `findSeeds()` matches the "Ledger" node. Spread activation follows edges to "Sprint 14" and "Expense Categories Overhaul". The activated subgraph should contain:
   - The "Ledger" project node (seed)
   - The "Sprint 14" node (1 hop via `has_active_sprint`)
   - The "Expense Categories Overhaul" node (1 hop via `blocked_by` from Sprint 14, or 2 hops from Ledger)
   - Relevant observations about sprint priorities, blocked items, and the overhaul status

3. **Sensor processing (exteroceptive)**: The Text Sensor extracts minimal entities from "What should I work on next?" — likely `{name: "work", type: "action"}` or similar. These are generic and may not contribute strong graph activation seeds. The spatial sensor's project entity is the primary activation driver for this query.

4. **PFC Loop**: Receives raw user input + spatial sensor output + activated subgraph. The PFC should:
   - Recognize from the spatial sensor that the user is in the Ledger project
   - See the Sprint 14 observations about what's in progress, what's next, and what's blocked
   - Synthesize a recommendation about what to work on next, grounded in the sprint data
   - Respond without asking "which project?" — the spatial sensor already answered that

5. **Evaluator**: The response action should receive `status: "done"`, `quality: "productive"`. The loop quenches after 1-3 iterations.

**Key structural expectation**: The spatial sensor produces entities from the working directory that seed graph activation, pulling in project-specific context. The user's generic question ("what should I work on next?") becomes answerable because the interoceptive sensor provided the missing project context. Without the spatial sensor, the agent would have no way to connect the generic question to a specific project.

## Grading

### Key Concepts Being Tested
- Spatial sensor fires at loop initialization and produces entities from the working directory (Section 3.2: interoceptive sensors)
- Spatial sensor entities seed graph activation and retrieve the correct project node (Section 4.3: `findSeeds`)
- Spread activation follows edges from the project node to related sprint/work nodes
- PFC infers project context from interoceptive input without the user naming the project
- Response is grounded in project-specific observations, not generic advice

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good" looks like here |
|-----------|----------------|---------------------------|
| D1: Goal Decomposition | 0.10 | Single goal, no sub-goals needed. |
| D2: Retrieval Quality | 0.30 | The "Ledger" node is found via spatial sensor entities. Sprint 14 and related nodes are activated via spread. Sprint observations about priorities and blockers surface. Score 5 if the spatial sensor's entities drive the activation. Score 1 if the project node is not found or activation relies solely on the vague "work" entity from the text sensor. |
| D3: Reasoning Efficiency | 0.10 | 1-3 iterations. The answer is in the activated context — no tool calls needed. |
| D4: Prediction Calibration | 0.10 | High confidence on the response. |
| D5: Reactivation Precision | 0.05 | No reactivation should fire. |
| D6: Self-Correction | 0.05 | Not tested. Score 3 (neutral). |
| D7: Memory Hierarchy Usage | 0.10 | Minimal working memory. Traces in scratch space. No KG writes. |
| D8: Output Quality | 0.20 | Response mentions the Ledger project by name, references specific sprint items (CSV import, receipt OCR), and accounts for the expense categories blocker. A generic "check your task board" response is a failure. |

### Passing Threshold
Composite score >= 3.5

### Red Flags
- No spatial sensor `SensorOutput` appears in `LoopState.sensorOutputs`
- The spatial sensor produces no entities (degenerate output when it should be rich)
- The agent asks "which project are you working on?" — the spatial sensor should have answered this
- The response contains generic productivity advice with no project-specific information
- The agent uses `sense` to explore the filesystem to figure out what project it's in (the spatial sensor should handle this, not the PFC via effectors)
- The "Ledger" node is not activated — indicating the spatial sensor's entities failed to seed graph activation
