import { describe, expect, it } from "vitest";
import { loadFactoryConfig, parseRepoSettings } from "./config.ts";

const base = { OWNER: "acme", ALLOWED_SENDER_IDS: "1, 2" };

describe("loadFactoryConfig", () => {
  it("fills in the built-in defaults", () => {
    expect(loadFactoryConfig(base)).toEqual({
      owner: "acme",
      allowedSenderIds: [1, 2],
      model: { provider: "openrouter", modelId: "openai/gpt-6.1-sol" },
      thinkingLevel: "high",
      maxTurns: 60,
      maxCostUsd: 3,
      maxFixAttempts: 2,
    });
  });

  it("takes overrides from the env", () => {
    const config = loadFactoryConfig({
      ...base,
      MODEL: "anthropic/claude-opus-5-5",
      THINKING_LEVEL: "low",
      MAX_TURNS: "10",
      MAX_COST_USD: "0.5",
      MAX_FIX_ATTEMPTS: "0",
    });

    expect(config).toMatchObject({
      model: { provider: "openrouter", modelId: "anthropic/claude-opus-5-5" },
      thinkingLevel: "low",
      maxTurns: 10,
      maxCostUsd: 0.5,
      maxFixAttempts: 0,
    });
  });

  it.each([
    [{ ALLOWED_SENDER_IDS: "1" }, /OWNER is required/],
    [{ OWNER: "acme" }, /ALLOWED_SENDER_IDS is required/],
    [{ ...base, ALLOWED_SENDER_IDS: "1,octocat" }, /ALLOWED_SENDER_IDS/],
    [{ ...base, THINKING_LEVEL: "extreme" }, /THINKING_LEVEL/],
    [{ ...base, MAX_TURNS: "1.5" }, /MAX_TURNS/],
    [{ ...base, MAX_COST_USD: "0" }, /MAX_COST_USD/],
    [{ ...base, MAX_FIX_ATTEMPTS: "-1" }, /MAX_FIX_ATTEMPTS/],
  ])("rejects %j", (env, error) => {
    expect(() => loadFactoryConfig(env)).toThrow(error);
  });
});

describe("parseRepoSettings", () => {
  it("reads setup and checks", () => {
    expect(parseRepoSettings("setup: pnpm install\nchecks:\n  - pnpm lint\n  - pnpm test\n")).toEqual({
      setup: "pnpm install",
      checks: ["pnpm lint", "pnpm test"],
    });
  });

  it("treats an empty file as no setup and no checks", () => {
    expect(parseRepoSettings("")).toEqual({ setup: null, checks: [] });
  });

  it.each([
    ["model: x\n", /unknown key model/],
    ["setup: [a]\n", /setup must be a string/],
    ["checks: pnpm test\n", /checks must be a list of strings/],
    ["checks: [1]\n", /checks must be a list of strings/],
    ["- a\n", /must be a mapping/],
    ["setup: [\n", /not valid YAML/],
  ])("rejects %j", (source, error) => {
    expect(() => parseRepoSettings(source)).toThrow(error);
  });
});
