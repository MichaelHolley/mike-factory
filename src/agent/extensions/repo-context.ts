import { defineExtension, section } from "@earendil-works/pi-durable";
import { findRepo, type AppConfig } from "../../config.ts";
import { IssueState } from "../docs.ts";

export const MAX_DOC_CHARS = 20_000;
const CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md", "README.md"];
const NESTED_HINT = "Subdirectories may have their own AGENTS.md; read it before changing files there.";

export function createRepoContext(config: AppConfig) {
  return defineExtension({
    name: "repo-context",
    sections: [
      section("repository", async (input, context) => {
        const state = await input.read.snapshot(IssueState, input.conversationId, context);
        const repo = state && findRepo(config, state.repo);
        if (!state || !repo) return undefined;
        return [
          `Repository: ${config.owner}/${repo.name} (default branch ${repo.defaultBranch}), working on issue #${state.issue} on branch ${state.branch}.`,
          `Install: ${repo.setup ?? "none"}`,
          `Checks: ${repo.checks?.join(" && ") || "none"}`,
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
    const truncated =
      content.length > MAX_DOC_CHARS ? `\n[Truncated at ${MAX_DOC_CHARS} characters; read ${name} for the rest.]` : "";
    return `${NESTED_HINT}\n\n${name}\n${content.slice(0, MAX_DOC_CHARS)}${truncated}`;
  }
  return NESTED_HINT;
}
