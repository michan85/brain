# Eval Harness Design

## Overview

The eval harness uses Claude Code as the driver. No custom simulator, no subprocess orchestration. Claude Code reads a scenario, drives the brain agent through it, and a separate Claude Code invocation grades the trajectory.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Run Script (orchestrator)                           │
│                                                     │
│  1. Setup: create run dir, seed graph, stage files  │
│  2. Drive: claude -p "run this scenario"            │
│  3. Grade: claude -p "grade this trajectory"        │
│  4. Output: report.md in run dir                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Directory Structure

Each eval run is fully isolated — its own directory, its own database copy, its own context files. No state bleeds between runs.

```
evals/
  runs/
    {session_id}/
      scenario.md        — copy of the scenario being run
      instructions.md    — prompt for Claude Code (generated from scenario)
      brain.db           — isolated database copy for this run
      setup/
        graph.json       — nodes, edges, observations to preload
        context/         — staged files the agent should discover
      logs/
        iteration_001.json
        iteration_002.json
        ...
        trajectory.json  — full trajectory (all iterations)
      report.md          — grading output
```

The run script creates this directory, copies a fresh empty database, seeds it from `graph.json`, and sets `BRAIN_DB_PATH` so the agent uses the run-local database.

## Step 1: Setup

### Graph Seeding

Each scenario needs a structured `graph.json` block (not prose) describing the initial knowledge graph state. A CLI command consumes this:

```bash
bun run brain seed --file evals/runs/{session_id}/setup/graph.json
```

This calls the existing graph CRUD (`upsertNode`, `addObservation`, `addEdge`) to populate the database.

**Schema for graph.json:**

```json
{
  "nodes": [
    {
      "name": "auth-service",
      "type": "service",
      "observations": [
        { "content": "Handles OAuth2 and session management", "confidence": 0.9 },
        { "content": "Currently running v3.2.1 in production", "confidence": 0.85 }
      ]
    }
  ],
  "edges": [
    { "source": "auth-service", "target": "user-db", "relation": "reads_from", "weight": 0.8 }
  ]
}
```

### Context Staging

Scenarios that require the agent to investigate files (repos, configs, logs) get a staged directory at `setup/context/`. The setup step copies or generates these files. This is where the agent's `sense`, `readFile`, and `bash` effectors operate.

Example: a scenario about CI status would stage a directory with `.github/workflows/`, a `package.json`, and maybe some log output — the agent uses its real tools to investigate.

### Scenarios Must Be Updated

Current scenarios reference fictional effectors (`github_ci`, `linearb_api`, `grafana_api`, `project_tracker`). These need to be rewritten to use the brain agent's actual effectors (`sense`, `readFile`, `bash`, `respond`) against staged context directories.

## Step 2: Drive

### Brain Agent Interface

The brain agent currently runs as a CLI REPL (`src/index.ts`). For the harness, we need a programmatic interface. This is phased:

**Phase 1: CLI entry point**
- `bun run brain run --prompt "..." --session {id} --db {path}`
- Single-turn: sends one prompt, runs the PFC loop, returns the response
- Sufficient for simple scenarios where no clarification is needed
- Claude Code invokes this via `bash` and reads the response

**Phase 2: HTTP server**
- Wrap `runPFCLoop` in a simple HTTP server (`Bun.serve`)
- `POST /chat` — send a message, receive the response, session persists
- Required for multi-turn scenarios where the agent asks clarification questions
- Claude Code talks to it via `curl`

### Mock Server for Surprise-Driven Scenarios

Some scenarios (I02, C02, A02) depend on the agent receiving unexpected data from external sources. Staged files alone can't create "surprise" because there's no prediction against expected behavior — the agent is just reading a file.

For these scenarios, the setup step starts a lightweight mock HTTP server (e.g., a simple Bun.serve endpoint) that returns scenario-specific responses. The agent hits it via `bash` (`curl`) or `sense`. The mock server is part of the run directory and is torn down after the eval completes.

This is simpler than Docker Compose / WireMock and sufficient for Phase 1. The mock server just returns canned JSON from a config file:

```typescript
// evals/mock-server.ts — trivial, <30 lines
// Reads responses from setup/mock-responses.json
// Returns the next response for each endpoint hit
```

### Claude Code as Driver

```bash
claude -p "$(cat evals/runs/{session_id}/instructions.md)"
```

The `instructions.md` tells Claude Code:
- How to talk to the brain agent (CLI command or HTTP endpoint depending on phase)
- The initial prompt to send
- How to respond to clarification questions (from the scenario's follow-up responses)
- When to stop (goal achieved or max turns)
- Where logs are being written
- Wall-clock timeout for the entire run

### Instructions Template

```markdown
# Eval Run: {scenario_id}

## Brain Agent Access
Run the brain agent with:
\`\`\`bash
bun run brain run --prompt "<your message>" --session {session_id} --db evals/runs/{session_id}/brain.db
\`\`\`

## Task
You are simulating a user interacting with a brain agent. Your goal:
{user_goal from scenario}

## Initial Prompt
Send this as your first message to the brain agent:
"{initial_prompt from scenario}"

## Follow-Up Responses
If the brain agent asks for clarification, respond according to these rules:
{follow_up_responses from scenario}

## Completion
Stop when:
- The brain agent has addressed the user goal, OR
- You have exchanged {max_turns} messages, OR
- {timeout} minutes have elapsed

## Logging
The brain agent writes iteration logs to evals/runs/{session_id}/logs/.
Do not modify these files.
```

### Longitudinal Scenarios

For multi-session scenarios (L01-L05), the run script loops:

```
for each session in scenario:
  1. seed any new graph state (if needed)
  2. stage context files for this session
  3. invoke claude -p with this session's instructions
  4. trigger Dreamer consolidation
  5. snapshot the graph state
```

## Step 3: Log

### Instrumentation

`runPFCLoop` needs a logging layer that writes one JSON file per iteration to the run's `logs/` directory:

```typescript
interface IterationRecord {
  iteration: number;
  timestamp: number;

  // State snapshot
  goals: Goal[];
  activatedNodeCount: number;
  activatedNodeIds: string[];
  seedNodeIds: string[];
  workingMemorySize: number;

  // Output
  output: PFCOutput;  // thought or action

  // Effector (if action)
  effectorId?: string;
  effectorPayload?: unknown;
  effectorResult?: EffectorResult;

  // Evaluation
  evaluation?: EvaluationResult;

  // Future: prediction + prediction error
  prediction?: Prediction;
  predictionError?: PredictionError;

  // Reactivation
  reactivationTriggered: boolean;
  reactivationSource?: "surprise" | "drift" | "explicit";

  // Scratch writes this iteration
  scratchWrites: string[];

  // Timing
  llmDurationMs: number;
  effectorDurationMs?: number;
  totalDurationMs: number;
}
```

After the loop terminates, a `trajectory.json` is written containing all iteration records plus summary metadata (total iterations, termination reason, total duration).

### What Gets Logged Today vs What's Missing

| Field | Available Today | Notes |
|-------|----------------|-------|
| goals | Partial | Single hardcoded goal, no stack |
| activatedNodes | Yes | From spreadActivation |
| output (thought/action) | Yes | PFC loop produces these |
| effectorResult | Yes | executeEffector returns these |
| evaluation | Partial | continue/done only, no redirect |
| prediction | No | Not implemented |
| predictionError | No | Not implemented |
| reactivation | No | Not implemented |
| scratchWrites | Yes | writeScratch exists |
| timing | Partial | LLM call duration available |

Logging should capture what exists now and leave null/empty for unimplemented fields. As components are built, the logs get richer — and the grader can score those dimensions.

### Safety: Timeouts and Limits

Each eval run has hard limits to prevent runaway scenarios (especially adversarial ones):

- **Wall-clock timeout**: Configurable per scenario, default 5 minutes. The run script kills the brain agent process if exceeded.
- **Max iterations**: Already exists in `PFCLoopConfig.maxIterations`. Adversarial scenarios should set this lower.
- **Max reactivations per run**: When reactivation is implemented, cap at a configurable limit (e.g., 5) to prevent A01-style cascades during eval.

## Step 4: Grade

### Two-Phase Grading

**Phase 1: Deterministic checks** (no LLM needed)
- Iteration count vs scenario estimate
- Termination type (deliberate/fatigue/stale — when implemented)
- Component presence (did prediction exist? did reactivation fire?)
- Timing bounds
- Dimension weight validation

**Phase 2: LLM grading** (separate Claude Code invocation)

```bash
claude -p "Read the scenario at evals/runs/{session_id}/scenario.md,
the trajectory at evals/runs/{session_id}/logs/trajectory.json,
and the rubric at evals/grading.md.
Score each dimension 1-5 with justification.
Write the report to evals/runs/{session_id}/report.md"
```

The grader should be a different model or at minimum a clean context — the system shouldn't grade itself. The brain agent uses OpenAI-compatible models (configurable); the grader uses Claude via Claude Code. This gives model-family separation by default.

### Report Format

As defined in `grading.md`:

```markdown
## Scenario: {id}
## Tier: {tier}
## Composite Score: {score}/5.0 ({rating})

### Dimension Scores
| Dimension | Score | Weight | Weighted | Justification |
|-----------|-------|--------|----------|---------------|
| D1 | ... | ... | ... | ... |

### Trajectory Highlights
- Iteration {n}: ...

### Diagnosis
...

### Recommendations
1. ...
```

## Known Architecture Violations

These are pre-existing issues in the codebase that will affect eval scores. They should be fixed as part of implementation, not worked around in the harness.

### `learnFromInteraction` bypasses the memory hierarchy

`src/index.ts` calls `learnFromInteraction()` after every interaction, writing sensor-extracted entities directly to the knowledge graph. The architecture's core rule (Section 8) is that the PFC Loop never writes directly to the KG — only the Dreamer does during consolidation.

**Impact**: D7 (Memory Hierarchy Usage) will score 1 across all scenarios until this is removed.

**Fix**: Remove `learnFromInteraction`. Sensor entities should go to scratch space. The Dreamer decides what gets promoted to the KG. Until the Dreamer exists, the graph only grows via seeding.

### Config as environment variables

LLM parameters (model, temperature, max tokens) are currently hardcoded in `src/config.ts`. For evals, these should be configurable via environment variables so different runs can test different parameter combinations:

```bash
BRAIN_MODEL=gpt-4o BRAIN_TEMPERATURE=0.3 bun run brain run --prompt "..."
```

This avoids hardcoding eval-specific settings and lets scenarios or the run script control parameters without code changes.

## Future: Docker Compose Service Environment

For complex and longitudinal scenarios that need realistic service interactions, a Docker Compose stack can provide real (or near-real) services:

### Planned Services

| Service | Purpose | Scenarios |
|---------|---------|-----------|
| **go-git server** (e.g., Gitea) | Real git repos the agent can clone, read, inspect | Any scenario involving code investigation |
| **Grafana + Prometheus** | Dashboards and metrics the agent can query | C01 (API performance), L01 (status checks) |
| **Linear/issue tracker** (or mock) | Project/ticket data | I01 (sub-goal decomposition), C04 (quarterly report) |
| **PostgreSQL / MySQL** | Real databases the agent can inspect | C03 (contradictory DB knowledge) |
| **Fake HTTP services** | Controllable endpoints that return scenario-specific responses | A02 (failure cascade), I02 (surprise data) |

### How It Works

```yaml
# docker-compose.eval.yml
services:
  gitea:
    image: gitea/gitea
    # pre-seeded with scenario repos
  grafana:
    image: grafana/grafana
    # pre-configured dashboards
  mock-api:
    image: wiremock/wiremock
    # scenario-specific response stubs
  brain:
    build: .
    # brain agent HTTP server
```

The setup step provisions the services with scenario-specific data (seed a git repo, configure Grafana dashboards, load WireMock stubs). The brain agent's `sense` and `bash` effectors interact with these services naturally — `curl`, `git clone`, API calls.

This is the path to truly ambitious scenarios where the agent is operating in a realistic environment, not just reading staged files.

### Phased Rollout

1. **Phase 1 (now):** CLI entry point for brain agent. Staged files on disk. Lightweight mock server for surprise-driven scenarios. Isolated run directories with own database. Deterministic grading checks. Enough for simple scenarios + some intermediate.
2. **Phase 2:** HTTP server for brain agent. Multi-turn scenarios via Claude Code driving conversations. LLM-based grading via Claude Code. Run history tracking.
3. **Phase 3:** Docker Compose with real services (Gitea, Grafana, WireMock). Complex + adversarial scenarios with realistic integrations.
4. **Phase 4:** Longitudinal runner with Dreamer integration. Multi-session scenarios with graph snapshots between sessions.

## Implementation Checklist

### Must Have (Phase 1)
- [ ] Add structured `graph.json` blocks to scenarios (replace prose setups)
- [ ] Build `bun run brain seed --file graph.json --db {path}` CLI command
- [ ] Build `bun run brain run --prompt "..." --session {id} --db {path}` CLI entry point
- [ ] Add logging instrumentation to `runPFCLoop` (write `IterationRecord` per iteration)
- [ ] Write `trajectory.json` on loop completion
- [ ] Create run script that orchestrates: create dir → copy db → seed → drive → grade
- [ ] Deterministic grading checks (iteration count, component presence, timing)
- [ ] Rewrite S01-S05 scenarios to use real effectors (`sense`, `readFile`, `bash`)
- [ ] Create staged context directories for S01-S05
- [ ] Make config (model, temperature, etc.) overridable via environment variables
- [ ] Add wall-clock timeout to run script
- [ ] Build lightweight mock server (`evals/mock-server.ts`) for surprise-driven scenarios

### Should Have (Phase 2)
- [ ] HTTP server wrapper around brain agent (`POST /chat`) for multi-turn scenarios
- [ ] Instructions template generator (scenario → `instructions.md`)
- [ ] LLM grading prompt template for Claude Code
- [ ] Run history tracking (compare scores across runs)
- [ ] Rewrite I01-I05 scenarios to use real effectors
- [ ] Staged context directories for I01-I05

### Nice to Have (Phase 3+)
- [ ] Docker Compose eval environment
- [ ] go-git (Gitea) integration
- [ ] Grafana + mock metrics
- [ ] WireMock for controllable API responses
- [ ] Longitudinal runner with Dreamer + graph snapshots
- [ ] CI integration (run evals on PR)
