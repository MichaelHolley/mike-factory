import { obj, str } from "@earendil-works/pi-schema";
import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import { REPO_SETTINGS_FILE } from "../../config.ts";
import { IssueState } from "../docs.ts";
import { runUrl } from "../runUrl.ts";
import { text } from "./text.ts";

export const CONVENTIONAL_TITLE = /^[a-z]+(\([^)]+\))?!?: \S.*$/;
const MAX_PR_BODY_CHARS = 3_000;

export const closingRef = (issue: number) => `Closes #${issue}`;

export const NO_CHECKS_NOTE = `No checks configured (\`${REPO_SETTINGS_FILE}\`).`;

/** Room left after reserving the closing reference, no-checks note, optional run link and blank lines. */
export const prBodyLimit = (issue: number, link?: string) =>
  MAX_PR_BODY_CHARS - closingRef(issue).length - 2 - NO_CHECKS_NOTE.length - 2 - (link ? link.length + 2 : 0);

export function createPullRequestTools(publicUrl?: string) {
  return defineExtension({
    name: "pull-request",
    tools: [
      defineTool({
        name: "draft_pull_request",
        description:
          "Set the title and body the pipeline uses when it opens this issue's pull request. Does not open it. Call again to replace them.",
        parameters: obj({
          title: str({ description: "Conventional commit subject, e.g. `feat(api): add pagination`." }),
          body: str({
            description: "Markdown PR description; the pipeline appends the closing issue reference.",
          }),
        }),
        replay: "safe",
        execute: async (args, api, context) => {
          const state = await api.snapshot(IssueState, api.conversationId, context);
          if (!state || state.issue === 0) throw new Error("This conversation is not bound to a GitHub issue.");

          const title = args.title.trim();
          const body = args.body.trim();

          if (!CONVENTIONAL_TITLE.test(title)) {
            return {
              output: text(
                "Rejected: the title must be a conventional commit subject such as `feat(api): add pagination` (`type(scope)!: summary`).",
              ),
              isError: true,
            };
          }
          const limit = prBodyLimit(state.issue, runUrl(publicUrl, state.repo, state.issue));
          if (body.length > limit) {
            return {
              output: text(`Rejected: the body has ${body.length} characters; keep it under ${limit}.`),
              isError: true,
            };
          }

          await api.commit(async (tx) => {
            Object.assign(await tx.doc(IssueState, api.conversationId), { prTitle: title, prBody: body });
          }, context);

          return { output: text("Saved.") };
        },
      }),
    ],
  });
}
