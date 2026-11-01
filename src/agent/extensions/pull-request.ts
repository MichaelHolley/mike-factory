import { Type } from "@earendil-works/pi-ai";
import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import { IssueState } from "../docs.ts";

export const CONVENTIONAL_TITLE = /^[a-z]+(\([^)]+\))?!?: \S.*$/;
const MAX_PR_BODY_CHARS = 3_000;

export const closingRef = (issue: number) => `Closes #${issue}`;

/** Room left for the body once the closing reference and its blank line are appended. */
export const prBodyLimit = (issue: number) => MAX_PR_BODY_CHARS - closingRef(issue).length - 2;

const text = (value: string) => [{ type: "text" as const, text: value }];

export function createPullRequestTools() {
  return defineExtension({
    name: "pull-request",
    tools: [
      defineTool({
        name: "draft_pull_request",
        description:
          "Set the title and body the pipeline uses when it opens this issue's pull request. Does not open it. Call again to replace them.",
        parameters: Type.Object({
          title: Type.String({ description: "Conventional commit subject, e.g. `feat(api): add pagination`." }),
          body: Type.String({ description: "Markdown PR description; the pipeline appends the closing issue reference." }),
        }),
        replay: "safe",
        execute: async (args, api, context) => {
          const state = await api.snapshot(IssueState, api.conversationId, context);
          if (!state || state.issue === 0) throw new Error("This conversation is not bound to a GitHub issue.");
          const title = args.title.trim();
          const body = args.body.trim();
          if (!CONVENTIONAL_TITLE.test(title)) {
            return { output: text("Rejected: the title must be a conventional commit subject such as `feat(api): add pagination` (`type(scope)!: summary`)."), isError: true };
          }
          const limit = prBodyLimit(state.issue);
          if (body.length > limit) {
            return { output: text(`Rejected: the body has ${body.length} characters; keep it under ${limit}.`), isError: true };
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
