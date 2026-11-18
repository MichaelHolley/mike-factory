import { describe, expect, it } from "vitest";
import { MAX_DOC_CHARS, projectInstructions } from "./repo-context.ts";

const reader = (files: Record<string, string>) => async (name: string) => files[name];
const nestedHint = "Subdirectories may have their own AGENTS.md; read it before changing files there.";

describe("projectInstructions", () => {
  it.each([
    [{ "AGENTS.md": "agents", "CLAUDE.md": "claude", "README.md": "readme" }, "AGENTS.md", "agents"],
    [{ "CLAUDE.md": "claude", "README.md": "readme" }, "CLAUDE.md", "claude"],
    [{ "README.md": "readme" }, "README.md", "readme"],
  ])("picks the first context file present in %j", async (files, name, content) => {
    const result = await projectInstructions(reader(files));
    expect(result.startsWith(`${nestedHint}\n\n${name} (`)).toBe(true);
    expect(result.endsWith(`):\n${content}`)).toBe(true);
  });

  it("still hints at nested AGENTS.md files when the root has none", async () => {
    expect(await projectInstructions(reader({}))).toBe(nestedHint);
  });

  it("marks a file within the limit as included in full", async () => {
    const result = await projectInstructions(reader({ "AGENTS.md": "a".repeat(MAX_DOC_CHARS) }));
    expect(result).toContain("AGENTS.md (already included in full; don't read it again, even on follow-up rounds):\n");
    expect(result).not.toContain("Truncated");
  });

  it("marks a file cut off at the size limit and points to the rest", async () => {
    const result = await projectInstructions(reader({ "AGENTS.md": "a".repeat(MAX_DOC_CHARS + 1) }));
    expect(result).toContain(
      `AGENTS.md (already included up to the truncation point; don't read that part again, even on follow-up rounds):\n${"a".repeat(MAX_DOC_CHARS)}\n[Truncated at ${MAX_DOC_CHARS} characters; read AGENTS.md for the rest.]`,
    );
  });
});
