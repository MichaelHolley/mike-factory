import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { openAgentHarness } from "../../src/agent/harness.ts";
import { autopilot, createWorld, ctx, pipelineResult, REPO, startAction } from "./support.ts";

const dir = process.env.STATE_DIR!;
const githubFile = join(dir, "github.json");
const world = createWorld({ dir, githubFile });

if (process.env.MODE === "first") {
  world.github.addIssue(REPO, { number: 1, title: "Add hello", body: "Please add hello.txt." });
  writeFileSync(githubFile, JSON.stringify(world.github.toJSON()));
}
autopilot(world.faux);

const storage = await openNodeSqliteStorage(join(dir, "agent.sqlite"));
const { harness, service } = await openAgentHarness(
  { storage, models: world.models, deps: world.deps, crashAt: process.env.CRASH_AT },
  ctx,
);
await service.start(startAction(1, "comment-1"));
const outcome = await pipelineResult(harness, 1);
console.log(JSON.stringify({ outcome: outcome.status }));
await harness.close(ctx);
process.exit(0);
