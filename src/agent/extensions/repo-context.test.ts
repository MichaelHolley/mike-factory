import { describe, expect, it } from "vitest";
import { MAX_DOC_CHARS, projectInstructions } from "./repo-context.ts";

const reader = (files: Record<string, string>) => async (name: string) => files[name];

describe("projectInstructions", () => {
  it.each([
    [{ "AGENTS.md": "agents", "CLAUDE.md": "claude", "README.md": "readme" }, "AGENTS.md\nagents"],
    [{ "CLAUDE.md": "claude", "README.md": "readme" }, "CLAUDE.md\nclaude"],
    [{ "README.md": "readme" }, "README.md\nreadme"],
  ])("picks the first context file present in %j", async (files, expected) => {
    const result = await projectInstructions(reader(files));
    expect(result).toMatch(/AGENTS\.md; read it before changing files there\.\n\n/);
    expect(result.endsWith(expected)).toBe(true);
  });

  it("still hints at nested AGENTS.md files when the root has none", async () => {
    expect(await projectInstructions(reader({}))).toContain("Subdirectories may have their own AGENTS.md");
  });

  it("marks a file cut off at the size limit", async () => {
    const result = await projectInstructions(reader({ "AGENTS.md": "a".repeat(MAX_DOC_CHARS + 1) }));
    expect(result).toContain(`AGENTS.md\n${"a".repeat(MAX_DOC_CHARS)}\n[Truncated at ${MAX_DOC_CHARS} characters`);
  });

  it("leaves a file within the limit unmarked", async () => {
    const result = await projectInstructions(reader({ "AGENTS.md": "a".repeat(MAX_DOC_CHARS) }));
    expect(result).not.toContain("Truncated");
  });
});
