import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { openAgentHarness } from "../../src/agent/harness.ts";
import { autopilot, createWorld, ctx, OTHER_REPO, pipelineResult, REPO, startAction } from "./support.ts";

const dir = process.env.STATE_DIR!;
const githubFile = join(dir, "github.json");
const world = createWorld({ dir, githubFile, extraRepos: [OTHER_REPO], maxConcurrent: 3 });
const runs = [...[1, 2, 3].map((issue) => ({ repo: REPO, issue })), { repo: OTHER_REPO, issue: 1 }];

if (process.env.MODE === "first") {
  for (const { repo, issue } of runs) world.github.addIssue(repo, { number: issue, title: "Add hello", body: "Please add hello.txt." });
  writeFileSync(githubFile, JSON.stringify(world.github.toJSON()));
}
autopilot(world.faux);

const storage = await openNodeSqliteStorage(join(dir, "agent.sqlite"));
const { harness, service } = await openAgentHarness(
  { storage, models: world.models, deps: world.deps, crashAt: process.env.CRASH_AT },
  ctx,
);
await Promise.all(runs.map(({ repo, issue }) => service.start(startAction(issue, `comment-${repo}-${issue}`, "", repo))));
const outcomes = await Promise.all(runs.map(({ repo, issue }) => pipelineResult(harness, issue, repo)));
console.log(JSON.stringify({ outcomes: outcomes.map((outcome) => outcome.status) }));
if (outcomes.some((outcome) => outcome.status !== "completed")) {
  console.error(JSON.stringify({ outcomes, logs: world.logs }));
}
await harness.close(ctx);
process.exit(0);
