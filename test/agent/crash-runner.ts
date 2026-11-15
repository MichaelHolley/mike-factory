import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { openAgentHarness } from "../../src/agent/harness.ts";
import {
  autopilot,
  createWorld,
  ctx,
  issueStateOf,
  OTHER_REPO,
  pipelineResult,
  REPO,
  replyToReview,
  reviewFeedback,
  startAction,
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
  for (const { repo, issue } of runs)
    world.github.addIssue(repo, { number: issue, title: "Add hello", body: "Please add hello.txt." });
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
  await service.message({ repo: REPO, issue: 1, id: "7d2f8c1e-5b3a-4c6d-9e8f-0a1b2c3d4e5f", text: "Keep it short." });
}
const outcomes = await Promise.all(runs.map(({ repo, issue }) => pipelineResult(harness, issue, repo)));
console.log(JSON.stringify({ outcomes: outcomes.map((outcome) => outcome.status) }));
await harness.close(ctx);
process.exit(0);
