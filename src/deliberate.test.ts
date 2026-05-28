import { test, expect, describe } from "bun:test";
import { formatDeliberateForWorkingMemory, applyDefaults } from "./deliberate";
import type { DeliberationResult } from "./types";

const FULL_RESULT: DeliberationResult = {
  summary: "Migrate auth service from JWT to OAuth2",
  decisions: [
    {
      id: "d-1",
      what: "Use OAuth2 authorization code flow",
      why: "Supports third-party integrations and token refresh",
      assumptions: [
        {
          claim: "All clients support redirect-based auth",
          confidence: 0.8,
          costIfWrong: "high",
          validationMethod: "Audit client list",
        },
      ],
      alternatives: [
        {
          description: "Keep JWT with refresh tokens",
          tradeoff: "Simpler but no third-party support",
        },
      ],
    },
    {
      id: "d-2",
      what: "Use Keycloak as identity provider",
      why: "Open source, battle-tested, supports OIDC",
      assumptions: [
        {
          claim: "Keycloak can handle 10k concurrent sessions",
          confidence: 0.7,
          costIfWrong: "critical",
        },
      ],
      alternatives: [],
      dependsOn: ["d-1"],
    },
  ],
  plan: [
    {
      order: 1,
      action: "Read current auth middleware",
      effector: "sense",
      rationale: "Understand existing JWT validation logic",
      dependsOnDecisions: ["d-1"],
      assertions: [
        { claim: "Auth middleware file exists at /src/auth.ts" },
      ],
      status: "pending",
    },
    {
      order: 2,
      action: "Install Keycloak adapter",
      effector: "act",
      rationale: "Required for OAuth2 integration",
      dependsOnSteps: [1],
      dependsOnDecisions: ["d-2"],
      assertions: [
        {
          claim: "keycloak-connect is in package.json dependencies",
          verificationCommand: "grep keycloak-connect package.json",
        },
      ],
      status: "pending",
    },
  ],
  risks: [
    "Session migration may cause downtime",
    "Keycloak cluster needs dedicated infra",
    "Client SDK changes require coordinated release",
  ],
  confidence: 0.75,
};

describe("formatDeliberateForWorkingMemory", () => {
  test("produces expected string format with all sections", () => {
    const output = formatDeliberateForWorkingMemory("migrate auth", FULL_RESULT);

    expect(output).toContain('[deliberate] Task: "migrate auth"');
    expect(output).toContain("Summary: Migrate auth service from JWT to OAuth2");
    expect(output).toContain("Decisions (2):");
    expect(output).toContain("d-1: Use OAuth2 authorization code flow");
    expect(output).toContain("d-2: Use Keycloak as identity provider");
    expect(output).toContain("conf: 0.8, cost: high");
    expect(output).toContain("Plan (2 steps):");
    expect(output).toContain("1. [sense] Read current auth middleware");
    expect(output).toContain("2. [act] Install Keycloak adapter");
    expect(output).toContain("Risks: Session migration may cause downtime");
    expect(output).toContain("Confidence: 0.75");
    expect(output).toContain("[deliberation complete");
  });

  test("handles empty decisions and plan gracefully", () => {
    const empty: DeliberationResult = {
      summary: "Nothing to decide",
      decisions: [],
      plan: [],
      risks: [],
      confidence: 0.5,
    };
    const output = formatDeliberateForWorkingMemory("trivial task", empty);

    expect(output).toContain('[deliberate] Task: "trivial task"');
    expect(output).toContain("Summary: Nothing to decide");
    expect(output).not.toContain("Decisions");
    expect(output).not.toContain("Plan");
    expect(output).not.toContain("Risks:");
    expect(output).toContain("Confidence: 0.5");
  });
});

describe("applyDefaults", () => {
  test("generates decision IDs when missing", () => {
    const result = applyDefaults({
      summary: "test",
      decisions: [
        { what: "first", why: "because" },
        { what: "second", why: "also" },
      ],
      plan: [],
      risks: [],
      confidence: 0.6,
    });

    expect(result.decisions[0]!.id).toBe("d-1");
    expect(result.decisions[1]!.id).toBe("d-2");
  });

  test("preserves existing decision IDs", () => {
    const result = applyDefaults({
      summary: "test",
      decisions: [{ id: "custom-id", what: "x", why: "y" }],
      plan: [],
      risks: [],
      confidence: 0.5,
    });

    expect(result.decisions[0]!.id).toBe("custom-id");
  });

  test("clamps confidence to 0-1 range", () => {
    expect(applyDefaults({ confidence: 1.5 }).confidence).toBe(1);
    expect(applyDefaults({ confidence: -0.3 }).confidence).toBe(0);
    expect(applyDefaults({ confidence: 0.7 }).confidence).toBe(0.7);
  });

  test("defaults confidence to 0.5 when missing or non-numeric", () => {
    expect(applyDefaults({}).confidence).toBe(0.5);
    expect(applyDefaults({ confidence: "high" }).confidence).toBe(0.5);
  });

  test("defaults missing arrays to empty", () => {
    const result = applyDefaults({});
    expect(result.decisions).toEqual([]);
    expect(result.plan).toEqual([]);
    expect(result.risks).toEqual([]);
    expect(result.summary).toBe("");
  });

  test("sets all plan step statuses to pending", () => {
    const result = applyDefaults({
      plan: [
        { order: 1, action: "do thing", effector: "act", status: "completed" },
        { order: 2, action: "other thing", effector: "sense" },
      ],
    });

    expect(result.plan[0]!.status).toBe("pending");
    expect(result.plan[1]!.status).toBe("pending");
  });

  test("defaults invalid effector to sense", () => {
    const result = applyDefaults({
      plan: [{ order: 1, action: "x", effector: "invalid" }],
    });
    expect(result.plan[0]!.effector).toBe("sense");
  });

  test("defaults invalid costIfWrong to medium", () => {
    const result = applyDefaults({
      decisions: [
        {
          what: "x",
          why: "y",
          assumptions: [{ claim: "test", confidence: 0.5, costIfWrong: "extreme" }],
        },
      ],
    });
    expect(result.decisions[0]!.assumptions[0]!.costIfWrong).toBe("medium");
  });

  test("clamps assumption confidence to 0-1", () => {
    const result = applyDefaults({
      decisions: [
        {
          what: "x",
          why: "y",
          assumptions: [{ claim: "test", confidence: 2.0, costIfWrong: "low" }],
        },
      ],
    });
    expect(result.decisions[0]!.assumptions[0]!.confidence).toBe(1);
  });
});
