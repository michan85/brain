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

```
evals/
  runs/
    {session_id}/
      scenario.md        — copy of the scenario being run
      instructions.md    — prompt for Claude Code (generated from scenario)
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

The brain agent currently runs as a CLI REPL (`src/index.ts`). For the harness, we need a programmatic or HTTP interface:

**Option A: HTTP server** (recommended)
- Wrap `runPFCLoop` in a simple HTTP server (Bun.serve)
- `POST /chat` — send a message, receive the response + session continues
- Session state persists across requests within the same process
- Claude Code talks to it via `curl` or a simple client

**Option B: Programmatic entry point**
- `bun run brain run --prompt "..." --session {id}`
- Each invocation is stateless — session continuity comes from the graph + scratch space
- Simpler but loses in-memory state between calls

Option A is better for multi-turn scenarios where the agent asks clarification questions.

### Claude Code as Driver

```bash
claude -p "$(cat evals/runs/{session_id}/instructions.md)"
```

The `instructions.md` tells Claude Code:
- How to talk to the brain agent (HTTP endpoint or CLI command)
- The initial prompt to send
- How to respond to clarification questions (from the scenario's follow-up responses)
- When to stop (goal achieved or max turns)
- Where logs are being written

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

The grader should be a different model or at minimum a clean context — the system shouldn't grade itself.

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

1. **Phase 1 (now):** Staged files on disk. `sense`/`readFile`/`bash` against local directories. Enough for simple + intermediate scenarios.
2. **Phase 2:** HTTP server for brain agent. Multi-turn scenarios via Claude Code driving conversations.
3. **Phase 3:** Docker Compose with real services. Complex + adversarial scenarios with realistic integrations.
4. **Phase 4:** Longitudinal runner with Dreamer integration. Multi-session scenarios with graph snapshots between sessions.

## Implementation Checklist

### Must Have (Phase 1)
- [ ] Add structured `graph.json` blocks to scenarios (replace prose setups)
- [ ] Build `bun run brain seed --file graph.json` CLI command
- [ ] Add logging instrumentation to `runPFCLoop` (write `IterationRecord` per iteration)
- [ ] Write `trajectory.json` on loop completion
- [ ] Add HTTP server wrapper around brain agent (`POST /chat`)
- [ ] Create run script that orchestrates setup → drive → grade
- [ ] Rewrite scenarios to use real effectors (`sense`, `readFile`, `bash`) instead of fictional ones (`github_ci`, `linearb_api`)
- [ ] Create staged context directories for at least S01-S05

### Should Have (Phase 2)
- [ ] Deterministic grading checks (iteration count, termination type, component presence)
- [ ] Grading prompt template for Claude Code
- [ ] Run history tracking (compare scores across runs)
- [ ] Staged context directories for I01-I05

### Nice to Have (Phase 3+)
- [ ] Docker Compose eval environment
- [ ] go-git (Gitea) integration
- [ ] Grafana + mock metrics
- [ ] WireMock for controllable API responses
- [ ] Longitudinal runner with Dreamer + graph snapshots
- [ ] CI integration (run evals on PR)
