# Scenario S06: Sense Effector Basic

## Metadata
- **Tier**: Simple
- **Focus**: Sense effector (PFC correctly delegates perception), working memory (sense findings enter working memory), three-effector routing
- **Estimated iterations**: 2-4

## Setup
Knowledge graph is empty. Scratch space is empty. The filesystem contains a known file at a predictable path (e.g., a small config file or script in the working directory).

For reproducibility, seed a test file before running:
```
/tmp/brain-eval-s06/config.json:
{
  "appName": "Kronos",
  "version": "3.2.1",
  "maxRetries": 5,
  "endpoints": {
    "api": "https://api.kronos.internal",
    "health": "https://api.kronos.internal/healthz"
  }
}
```

## User Goal
The user wants to know the contents and purpose of a specific file. This requires the system to read and summarize the file — a perception task.

## User Inputs
### Initial Prompt
"What's in /tmp/brain-eval-s06/config.json?"

### Follow-up Responses
N/A — this scenario should not require clarification.

## Expected Behavior

1. **Sensor processing**: Extracts entities related to the file path. Generates embedding. Raw input forwarded to PFC.

2. **Graph Activation**: Empty graph returns empty subgraph. No error.

3. **PFC Loop iteration 1 (Sense)**: The PFC recognizes this is a perception task — the user wants to understand file contents. It produces an Action targeting the `sense` effector:
   ```json
   {"kind": "action", "effectorId": "sense", "payload": {"task": "Read and summarize the contents of /tmp/brain-eval-s06/config.json", "source": "/tmp/brain-eval-s06/config.json"}}
   ```
   The sense effector internally uses readFile to read the file, then returns structured SenseFindings with entities (Kronos, the endpoints), observations, and a summary.

4. **Working memory**: The sense findings are formatted via `formatSenseForWorkingMemory()` and pushed into working memory. The PFC can see what sense found without re-reading the file.

5. **Scratch space**: `writeSenseToScratch()` records the observations from the sense findings.

6. **Evaluator**: Signals `status: "continue"` — sense was productive but the user hasn't received a response yet.

7. **PFC Loop iteration 2 (Respond)**: The PFC composes a response using the sense findings from working memory. It uses the `respond` effector to deliver the answer.

8. **Evaluator**: Signals `status: "done"`.

**Key structural expectation**: The PFC uses `sense` for perception, not `act`. The PFC does NOT attempt to use a raw readFile or bash — those are internal tools invisible to the PFC. Sense findings enter working memory and are used in the response.

## Grading

### Key Concepts Being Tested
- PFC routes perception tasks to the `sense` effector (not act, not raw tools)
- Sense effector internally reads the file and returns structured SenseFindings
- SenseFindings are formatted and pushed to working memory
- SenseFindings observations are written to scratch space
- The PFC trusts sense findings and responds from working memory (no re-investigation)

### Scenario-Specific Grading Criteria

| Dimension | Weight Override | What "good" looks like here |
|-----------|----------------|---------------------------|
| D1: Goal Decomposition | 0.05 | Single goal: "tell user what's in the file." Minimal decomposition. |
| D2: Retrieval Quality | 0.05 | Empty graph, nothing to retrieve. Score 5 if handled cleanly. |
| D3: Reasoning Efficiency | 0.25 | Score 5 for 2 iterations (sense, respond). Score 4 for 3 (thought, sense, respond). Score 2 for 4+. Score 1 if sense is called multiple times for the same file. |
| D4: Prediction Calibration | 0.05 | Not the focus. Predictions not yet implemented. Score 3 (neutral). |
| D5: Reactivation Precision | 0.05 | No reactivation needed. Score 5 if none fires. |
| D6: Self-Correction | 0.05 | Not meaningfully tested. Score 3 (neutral). |
| D7: Memory Hierarchy Usage | 0.25 | Sense findings appear in working memory. Observations written to scratch. PFC responds from working memory, not by re-reading the file. |
| D8: Output Quality | 0.25 | Response accurately describes the file contents: app name (Kronos), version (3.2.1), retry config, API endpoints. Should be concise and structured. |

### Passing Threshold
Composite score >= 3.5

### Red Flags
- The PFC uses `act` instead of `sense` for a read-only perception task
- The PFC attempts to call readFile or bash directly (these are not PFC-level effectors)
- The PFC calls sense, then calls sense again on the same file (doesn't trust findings)
- Sense findings are not in working memory when the PFC composes the response
- The response fabricates file contents not present in the actual file
- The system errors because the graph is empty
