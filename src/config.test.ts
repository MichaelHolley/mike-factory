import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.ts";

const base = "owner: o\nallowedSenderId: 1\n";

describe("parseConfig thinkingLevel", () => {
  it("defaults to high on gpt-6.1-sol", () => {
    const [repo] = parseConfig(`${base}repos:\n  - name: a\n`).repos;
    expect(repo).toMatchObject({ model: { provider: "openai", modelId: "gpt-6.1-sol" }, thinkingLevel: "high" });
  });

  it("lets a repo override the default", () => {
    const { repos } = parseConfig(
      `${base}defaults:\n  thinkingLevel: medium\nrepos:\n  - name: a\n  - name: b\n    thinkingLevel: low\n`,
    );
    expect(repos.map((repo) => repo.thinkingLevel)).toEqual(["medium", "low"]);
  });
});
