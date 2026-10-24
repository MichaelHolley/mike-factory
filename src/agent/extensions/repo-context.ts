import { defineExtension, section } from "@earendil-works/pi-durable";
import { findRepo, type AppConfig } from "../../config.ts";
import { IssueState } from "../docs.ts";

const MAX_DOC_CHARS = 20_000;
const CONTEXT_FILES = ["AGENTS.md", "README.md"];

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
        if (!state || !input.env) return undefined;
        for (const name of CONTEXT_FILES) {
          const file = await input.env.readTextFile(`${state.worktreePath}/${name}`, context);
          if (file.ok) return `${name}\n${file.value.slice(0, MAX_DOC_CHARS)}`;
        }
        return undefined;
      }),
    ],
  });
}
