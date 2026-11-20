import { defineExtension, section } from "@earendil-works/pi-durable";
import { IssueState } from "../docs.ts";

export const MAX_DOC_CHARS = 20_000;
const CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md", "README.md"];
const NESTED_HINT = "Subdirectories may have their own AGENTS.md; read it before changing files there.";

export function createRepoContext(owner: string) {
  return defineExtension({
    name: "repo-context",
    sections: [
      section("repository", async (input, context) => {
        const state = await input.read.snapshot(IssueState, input.conversationId, context);
        const settings = state?.settings;
        if (!state || !settings) return undefined;
        return [
          `Repository: ${owner}/${state.repo} (default branch ${settings.defaultBranch}), working on issue #${state.issue} on branch ${state.branch}.`,
          `Install: ${settings.setup ?? "none"}`,
          `Checks: ${settings.checks.join(" && ") || "none"}`,
          "The pipeline runs the checks itself after you finish and sends you any failure output.",
        ].join("\n");
      }),
      section("project-instructions", async (input, context) => {
        const state = await input.read.snapshot(IssueState, input.conversationId, context);
        const env = input.env;
        if (!state || !env) return undefined;
        return projectInstructions(async (name) => {
          const file = await env.readTextFile(`${state.worktreePath}/${name}`, context);
          return file.ok ? file.value : undefined;
        });
      }),
    ],
  });
}

export async function projectInstructions(read: (name: string) => Promise<string | undefined>) {
  for (const name of CONTEXT_FILES) {
    const content = await read(name);
    if (content === undefined) continue;
    if (content.length <= MAX_DOC_CHARS) {
      return `${NESTED_HINT}\n\n${name} (already included in full; don't read it again, even on follow-up rounds):\n${content}`;
    }
    return `${NESTED_HINT}\n\n${name} (already included up to the truncation point; don't read that part again, even on follow-up rounds):\n${content.slice(0, MAX_DOC_CHARS)}\n[Truncated at ${MAX_DOC_CHARS} characters; read ${name} for the rest.]`;
  }
  return NESTED_HINT;
}
