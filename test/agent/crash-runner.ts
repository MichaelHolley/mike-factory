import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { openAgentHarness } from "../../src/agent/harness.ts";
import { PNG } from "../fakes/github.ts";
import {
  autopilot,
  conversationIdOf,
  createWorld,
  ctx,
  issueStateOf,
  OTHER_REPO,
  pipelineResult,
  REPO,
  replyToReview,
  reviewFeedback,
  startAction,
  textOf,
} from "./support.ts";

const dir = process.env.STATE_DIR!;
const githubFile = join(dir, "github.json");
// The slow check leaves time to send a note while issue 1 verifies, which sends it through `revise`.
const world = createWorld({
  dir,
  githubFile,
  extraRepos: [OTHER_REPO],
  maxConcurrent: 3,
  repo: { checks: ["sleep 1"] },
});
const mode = process.env.MODE;
const review = mode?.startsWith("review-");
const runs = review
  ? [{ repo: REPO, issue: 1 }]
  : [...[1, 2, 3].map((issue) => ({ repo: REPO, issue })), { repo: OTHER_REPO, issue: 1 }];

if (mode === "first" || mode === "review-first") {
  const textUrl = "https://github.com/user-attachments/files/1/notes.txt";
  const imageUrl = "https://github.com/user-attachments/assets/reference";
  world.github.addAttachment(imageUrl, PNG);
  world.github.addAttachment(textUrl, "Attached notes: greet briefly.");
  for (const { repo, issue } of runs)
    world.github.addIssue(repo, {
      number: issue,
      title: "Add hello",
      body: `Please add hello.txt. ![Reference](${imageUrl}) [notes.txt](${textUrl})`,
    });
  writeFileSync(githubFile, JSON.stringify(world.github.toJSON()));
}
autopilot(world.faux, (messages) => replyToReview(messages, "Done as asked."));

const storage = await openNodeSqliteStorage(join(dir, "agent.sqlite"));
const { harness, service } = await openAgentHarness(
  { storage, models: world.models, deps: world.deps, crashAt: process.env.CRASH_AT },
  ctx,
);
// The review mode's second process only resumes: a repeated start would begin a new run after the review's.
if (mode !== "review-second")
  await Promise.all(
    runs.map(({ repo, issue }) => service.start(startAction(issue, `comment-${repo}-${issue}`, "", repo))),
  );
if (mode === "review-first") {
  await pipelineResult(harness, 1);
  const pr = world.github.prs[0]!.number;
  const { reviewId } = world.github.addReview(REPO, pr, {
    reviewer: "owner",
    state: "changes_requested",
    body: "",
    comments: [{ path: "hello.txt", line: 1, body: "Is this right?" }],
  });
  writeFileSync(githubFile, JSON.stringify(world.github.toJSON()));
  await service.feedback(reviewFeedback(pr, reviewId));
}
if (mode === "first") {
  while ((await issueStateOf(harness, 1))?.phase !== "verify") await new Promise((resolve) => setTimeout(resolve, 20));
  await service.message({
    repo: REPO,
    issue: 1,
    id: "7d2f8c1e-5b3a-4c6d-9e8f-0a1b2c3d4e5f",
    text: "Keep it short.",
    attachments: [await world.deps.uploads.save(REPO, 1, new File([PNG], "shot.png"))],
  });
}
const outcomes = await Promise.all(runs.map(({ repo, issue }) => pipelineResult(harness, issue, repo)));
const userTexts = await Promise.all(
  runs.map(async ({ repo, issue }) => {
    const conversation = (await harness.conversation((await conversationIdOf(harness, issue, repo))!, ctx))!;
    return (await conversation.context(ctx)).messages.flatMap((message) =>
      message.role === "user" ? [textOf(message)] : [],
    );
  }),
);
const count = (tag: string) => userTexts.map((texts) => texts.filter((text) => text.includes(tag)).length);
const issueFiles = runs.map(({ repo, issue }) => {
  const folder = join(world.deps.worktrees.worktreePath(repo, issue), ".mike/attachments/issue");
  return existsSync(folder) ? readdirSync(folder).sort() : [];
});
const ownerAttachments = ((await service.transcript(REPO, 1)) ?? []).flatMap((item) =>
  item.kind === "human" ? (item.attachments ?? []).map(({ name }) => name) : [],
);
console.log(
  JSON.stringify({
    outcomes: outcomes.map((outcome) => outcome.status),
    issueFileMessages: count("<issue-files>"),
    ownerFileMessages: count("<owner-files>"),
    issueFiles,
    ownerAttachments,
  }),
);
await harness.close(ctx);
process.exit(0);
