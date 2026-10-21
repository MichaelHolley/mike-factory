import { mkdtemp, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolResultEntry, MemoryStorage, type Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAgentHarness } from "../../src/agent/harness.ts";
import { STATUS_MARKER } from "../../src/agent/tasks/issuePipeline.ts";
import type { GitHubClient } from "../../src/contracts.ts";
import { autopilot, conversationIdOf, createWorld, ctx, git, issueStateOf, OTHER_REPO, pipelineResult, REPO, startAction, stopAction, textOf, type World } from "./support.ts";

let dir: string;
let open: Harness[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-test-"));
  open = [];
});

afterEach(async () => {
  for (const harness of open) await harness.close(ctx);
  await rm(dir, { recursive: true, force: true });
});

async function launch(world: World, issueNumbers: number[] = [1]) {
  for (const number of issueNumbers) {
    world.github.addIssue(REPO, { number, title: "Add hello", body: "Please add hello.txt." });
  }
  const { harness, service } = await openAgentHarness({ storage: new MemoryStorage(), models: world.models, deps: world.deps }, ctx);
  open.push(harness);
  return { harness, service };
}

const status = (world: World, issue = 1) =>
  world.github.commentsOn(REPO, issue).find((comment) => comment.body.startsWith(`<!-- ${STATUS_MARKER} -->`))?.body;

describe("issue pipeline", () => {
  it("turns an issue into exactly one pull request", async () => {
    const world = createWorld({ dir });
    autopilot(world.faux);
    const { harness, service } = await launch(world);

    await service.start(startAction(1, "comment-1"));
    const outcome = await pipelineResult(harness, 1);

    expect(outcome.status).toBe("completed");
    expect(world.github.prs).toHaveLength(1);
    const pr = world.github.prs[0]!;
    expect(pr).toMatchObject({ head: "agent/issue-1", base: "main", title: "Add hello", state: "open" });
    expect(pr.body).toContain("Closes #1");
    expect(git(world.remote, "show", "agent/issue-1:hello.txt")).toBe("hello");
    expect(status(world)).toContain("Opened ");
    const comments = world.github.commentsOn(REPO, 1);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.body).toContain(pr.url);
    expect(comments[0]!.body).toMatch(/Cost: \$\d+\.\d{4}/);
    const state = await issueStateOf(harness, 1);
    expect(state).toMatchObject({ phase: "done", prUrl: pr.url, branch: "agent/issue-1" });
  });

  it("stamps startedAt on start and moves updatedAt on every phase change", async () => {
    const world = createWorld({ dir });
    autopilot(world.faux);
    const { harness, service } = await launch(world);

    await service.start(startAction(1, "comment-1"));
    const started = await issueStateOf(harness, 1);
    expect(started!.startedAt).toEqual(expect.any(String));

    await pipelineResult(harness, 1);
    const done = await issueStateOf(harness, 1);
    expect(done!.startedAt).toBe(started!.startedAt);
    expect(Date.parse(done!.updatedAt!)).toBeGreaterThan(Date.parse(started!.startedAt!));

    const transcript = (await service.transcript(REPO, 1))!;
    expect(transcript[0]).toMatchObject({ kind: "user", text: expect.stringContaining("Implement GitHub issue #1") });
    expect(transcript).toContainEqual({ kind: "assistant", text: "Done: wrote hello.txt." });
    expect(transcript.some((item) => item.kind === "tool-call" && item.name === "write")).toBe(true);
    expect(await service.transcript(REPO, 99)).toBeUndefined();

    const [run] = await service.status();
    expect(run).toEqual({
      repo: REPO,
      issue: 1,
      issueUrl: `https://github.com/${world.config.owner}/${REPO}/issues/1`,
      branch: "agent/issue-1",
      phase: "done",
      attempts: 0,
      costUsd: done!.costUsd,
      prUrl: world.github.prs[0]!.url,
      lastError: null,
      startedAt: done!.startedAt,
      updatedAt: done!.updatedAt,
    });
  });

  it("starts nothing new for a redelivered webhook", async () => {
    const world = createWorld({ dir });
    autopilot(world.faux);
    const { harness, service } = await launch(world);

    await service.start(startAction(1, "comment-1"));
    await service.start(startAction(1, "comment-1"));
    await pipelineResult(harness, 1);
    const modelCalls = world.faux.state.callCount;
    await service.start(startAction(1, "comment-1"));

    expect(world.github.prs).toHaveLength(1);
    expect(world.faux.state.callCount).toBe(modelCalls);
    expect(world.github.commentsOn(REPO, 1)).toHaveLength(1);
    expect(status(world)).toContain("Opened ");
  });

  it("ignores /mike while a PR is open and replies once with the PR link", async () => {
    const world = createWorld({ dir });
    autopilot(world.faux);
    const { harness, service } = await launch(world);
    await service.start(startAction(1, "comment-1"));
    await pipelineResult(harness, 1);
    const modelCalls = world.faux.state.callCount;

    await service.start(startAction(1, "comment-2"));
    await service.start(startAction(1, "comment-2"));

    expect(status(world)).toContain("Opened ");
    expect(world.github.prs).toHaveLength(1);
    expect(world.faux.state.callCount).toBe(modelCalls);
    const comments = world.github.commentsOn(REPO, 1);
    expect(comments).toHaveLength(2);
    expect(comments[1]!.body).toContain(`Not starting: ${world.github.prs[0]!.url}`);
  });

  it("fails with the output in the status comment when verify keeps failing", async () => {
    const world = createWorld({ dir, repo: { test: "echo 'boom: assertion failed' && exit 1", maxFixAttempts: 2 } });
    autopilot(world.faux);
    const { harness, service } = await launch(world);

    await service.start(startAction(1, "comment-1"));
    const outcome = await pipelineResult(harness, 1);

    expect(outcome.status).toBe("failed");
    expect(world.github.prs).toHaveLength(0);
    expect(status(world)).toContain("could not finish");
    const [comment] = world.github.commentsOn(REPO, 1);
    expect(comment!.body).toContain("boom: assertion failed");
    expect(comment!.body).toContain("2 fix attempt");
    const state = await issueStateOf(harness, 1);
    expect(state).toMatchObject({ phase: "failed", attempts: 2 });
    expect(state!.lastError).toContain("still fails");
  });

  it("continues the same conversation and worktree when /mike is sent again after a failure", async () => {
    const setupLog = join(dir, "setup.log");
    const world = createWorld({ dir, repo: { setup: `echo ran >> ${setupLog}`, test: "test -f fixed.txt", maxFixAttempts: 1 } });
    autopilot(world.faux, (messages) => {
      const last = messages.at(-1);
      const prompt = JSON.stringify(messages.filter((message) => message.role === "user").at(-1));
      if (last?.role !== "toolResult" && prompt.includes("second attempt")) {
        return fauxAssistantMessage(fauxToolCall("write", { path: "fixed.txt", content: "ok\n" }), { stopReason: "toolUse" });
      }
      return undefined;
    });
    const { harness, service } = await launch(world);

    await service.start(startAction(1, "comment-1"));
    expect((await pipelineResult(harness, 1)).status).toBe("failed");
    const first = await issueStateOf(harness, 1);

    await service.start(startAction(1, "comment-2", "second attempt: also add fixed.txt"));
    expect((await pipelineResult(harness, 1)).status).toBe("completed");

    const second = await issueStateOf(harness, 1);
    expect(second!.worktreePath).toBe(first!.worktreePath);
    expect(readFileSync(setupLog, "utf8")).toBe("ran\n");
    expect(second!.pipelineTaskId).not.toBe(first!.pipelineTaskId);
    expect(world.github.prs).toHaveLength(1);
    expect(status(world)).toContain("Opened ");
  });

  it("fails with 'no changes' when the agent changes nothing", async () => {
    const world = createWorld({ dir });
    autopilot(world.faux, () => fauxAssistantMessage("Nothing to do."));
    const { harness, service } = await launch(world);

    await service.start(startAction(1, "comment-1"));
    expect((await pipelineResult(harness, 1)).status).toBe("failed");

    expect(world.github.commentsOn(REPO, 1)[0]!.body).toContain("no changes");
    expect(status(world)).toContain("could not finish");
  });

  it("aborts on stop, keeps the worktree and says so in the status comment", async () => {
    const world = createWorld({ dir });
    autopilot(world.faux, () => fauxAssistantMessage(fauxToolCall("bash", { command: "sleep 60" }), { stopReason: "toolUse" }));
    const { harness, service } = await launch(world);

    await service.start(startAction(1, "comment-1"));
    await waitFor(() => world.faux.state.callCount >= 1);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await service.stop(stopAction(1, "comment-2"));
    const outcome = await pipelineResult(harness, 1);

    expect(outcome.status).toBe("aborted");
    expect(status(world)).toContain("Stopped");
    expect(existsSync(join(dir, "data", "worktrees", REPO, "issue-1"))).toBe(true);
    expect(world.github.prs).toHaveLength(0);
    expect(await issueStateOf(harness, 1)).toMatchObject({ phase: "aborted" });
  });

  describe("run link in status comments", () => {
    const PUBLIC_URL = "https://factory.example.com";
    const statusBodies = (world: World) => {
      const upsert = vi.spyOn(world.github, "upsertComment");
      return () => upsert.mock.calls.filter(([, , marker]) => marker === STATUS_MARKER).map(([, , , body]) => body);
    };

    it("ends every status comment with the run page when PUBLIC_URL is set", async () => {
      const done = createWorld({ dir, repo: { test: "exit 1", maxFixAttempts: 0 } });
      done.deps.publicUrl = PUBLIC_URL;
      const failedBodies = statusBodies(done);
      autopilot(done.faux);
      const failed = await launch(done);
      await failed.service.start(startAction(1, "comment-1"));
      await pipelineResult(failed.harness, 1);

      const stopped = createWorld({ dir: join(dir, "stop") });
      stopped.deps.publicUrl = PUBLIC_URL;
      const stoppedBodies = statusBodies(stopped);
      autopilot(stopped.faux, () => fauxAssistantMessage(fauxToolCall("bash", { command: "sleep 60" }), { stopReason: "toolUse" }));
      const stoppedRun = await launch(stopped);
      await stoppedRun.service.start(startAction(1, "comment-1"));
      await waitFor(() => stopped.faux.state.callCount >= 1);
      await stoppedRun.service.stop(stopAction(1, "comment-2"));
      await pipelineResult(stoppedRun.harness, 1);

      const link = `${PUBLIC_URL}/runs/${REPO}/1`;
      const bodies = [...failedBodies(), ...stoppedBodies()];
      expect(bodies).toHaveLength(4);
      for (const body of bodies) expect(body.endsWith(`\n\n${link}`)).toBe(true);
    });

    it("links the opened PR comment and adds no link without PUBLIC_URL", async () => {
      const linked = createWorld({ dir });
      linked.deps.publicUrl = PUBLIC_URL;
      autopilot(linked.faux);
      const first = await launch(linked);
      await first.service.start(startAction(1, "comment-1"));
      await pipelineResult(first.harness, 1);
      expect(status(linked)).toMatch(/^<!-- agent-status -->\nOpened .*\n\nhttps:\/\/factory\.example\.com\/runs\/demo\/1$/s);

      const plain = createWorld({ dir: join(dir, "plain") });
      const bodies = statusBodies(plain);
      autopilot(plain.faux);
      const second = await launch(plain);
      await second.service.start(startAction(1, "comment-1"));
      await pipelineResult(second.harness, 1);
      expect(bodies()).toHaveLength(2);
      for (const body of bodies()) expect(body).not.toContain("/runs/");
    });
  });

  it("blocks a bash git push", async () => {
    const world = createWorld({ dir });
    const mainBefore = git(world.remote, "rev-parse", "main");
    autopilot(world.faux, (messages) =>
      messages.at(-1)?.role === "toolResult"
        ? fauxAssistantMessage("The push was blocked.")
        : fauxAssistantMessage(fauxToolCall("bash", { command: "git push origin main" }), { stopReason: "toolUse" }),
    );
    const { harness, service } = await launch(world);

    await service.start(startAction(1, "comment-1"));
    await pipelineResult(harness, 1);

    const conversation = (await harness.conversation((await conversationIdOf(harness, 1))!, ctx))!;
    const page = await conversation.entries({}, 50, undefined, ctx);
    const results = page.items.filter((entry) => ToolResultEntry.is(entry)).map((entry) => JSON.stringify(entry.model));
    expect(results.some((result) => result.includes("Blocked: git push"))).toBe(true);
    expect(git(world.remote, "rev-parse", "main")).toBe(mainBefore);
  });

  it("fails the pipeline when the turn budget is exhausted", async () => {
    const world = createWorld({ dir, repo: { maxTurns: 3 } });
    autopilot(world.faux, () => fauxAssistantMessage(fauxToolCall("bash", { command: "echo working" }), { stopReason: "toolUse" }));
    const { harness, service } = await launch(world);

    await service.start(startAction(1, "comment-1"));
    const outcome = await pipelineResult(harness, 1);

    expect(outcome.status).toBe("failed");
    expect(world.github.commentsOn(REPO, 1)[0]!.body).toContain("turn budget exhausted");
    expect(world.faux.state.callCount).toBeLessThanOrEqual(4);
    expect(status(world)).toContain("could not finish");
  });

  it("fails the pipeline when the cost budget is exhausted", async () => {
    const world = createWorld({ dir, repo: { maxCostUsd: 0 } });
    autopilot(world.faux);
    const { harness, service } = await launch(world);

    await service.start(startAction(1, "comment-1"));
    const outcome = await pipelineResult(harness, 1);

    expect(outcome.status).toBe("failed");
    expect(world.github.commentsOn(REPO, 1)[0]!.body).toContain("cost budget exhausted");
  });

  it("fails with the output when setup fails", async () => {
    const world = createWorld({ dir, repo: { setup: "echo 'install exploded' && exit 3" } });
    autopilot(world.faux);
    const { harness, service } = await launch(world);
    await service.start(startAction(1, "comment-1"));
    expect((await pipelineResult(harness, 1)).status).toBe("failed");
    expect(world.github.commentsOn(REPO, 1)[0]!.body).toContain("install exploded");
    expect(world.faux.state.callCount).toBe(0);
  });

  it("runs issues of two repos in parallel up to the limit, each PR holding only its own change", async () => {
    const world = createWorld({ dir, extraRepos: [OTHER_REPO], maxConcurrent: 3, repo: { setup: "sleep 0.2" } });
    autopilot(world.faux, (messages) => {
      const task = /^Implement GitHub issue #(\d+) of [^/]+\/(\S+) /.exec(textOf(messages.at(-1)));
      if (!task) return undefined;
      return fauxAssistantMessage(fauxToolCall("write", { path: `${task[2]}-${task[1]}.txt`, content: "x\n" }), { stopReason: "toolUse" });
    });
    const { harness, service } = await launch(world, [1, 2, 3]);
    world.github.addIssue(OTHER_REPO, { number: 1, title: "Add other", body: "Please." });
    const runs = [...[1, 2, 3].map((issue) => ({ repo: REPO, issue })), { repo: OTHER_REPO, issue: 1 }];

    await Promise.all(runs.map(({ repo, issue }) => service.start(startAction(issue, `comment-${repo}-${issue}`, "", repo))));
    for (const { repo, issue } of runs) expect((await pipelineResult(harness, issue, repo)).status).toBe("completed");

    expect(maxSlotsHeld(world)).toBe(3);
    expect(world.github.prs).toHaveLength(4);
    for (const { repo, issue } of runs) {
      expect(git(world.remotes[repo]!, "diff", "--name-only", "main", `agent/issue-${issue}`)).toBe(`${repo}-${issue}.txt`);
    }
    const states = await service.status();
    expect(states.map(({ repo, issue, phase }) => `${repo}#${issue}:${phase}`).sort()).toEqual(["demo#1:done", "demo#2:done", "demo#3:done", "other#1:done"]);
  });

  it("removes the worktree and local branch when the PR closes", async () => {
    const world = createWorld({ dir });
    autopilot(world.faux);
    const { harness, service } = await launch(world);
    await service.start(startAction(1, "comment-1"));
    await pipelineResult(harness, 1);

    await service.cleanup({ kind: "cleanup", repo: REPO, issue: 1 });

    expect(existsSync(world.deps.worktrees.worktreePath(REPO, 1))).toBe(false);
    expect(await world.deps.worktrees.issues(REPO)).toEqual([]);
  });

  it("sweeps only the worktrees of closed issues", async () => {
    const world = createWorld({ dir });
    autopilot(world.faux);
    const { harness, service } = await launch(world, [1, 2]);
    await Promise.all([service.start(startAction(1, "comment-1")), service.start(startAction(2, "comment-2"))]);
    await pipelineResult(harness, 1);
    await pipelineResult(harness, 2);

    world.github.closeIssue(REPO, 1);
    await service.sweep();

    expect(await world.deps.worktrees.issues(REPO)).toEqual([2]);
  });
});

/** Highest number of pipelines that held a slot at the same time, from the slot logs. */
function maxSlotsHeld(world: World) {
  const held = new Set<unknown>();
  let max = 0;
  for (const { msg, data } of world.logs) {
    const taskId = (data as { taskId?: unknown } | undefined)?.taskId;
    if (msg === "pipeline slot acquired") held.add(taskId);
    if (msg === "pipeline slot released") held.delete(taskId);
    max = Math.max(max, held.size);
  }
  return max;
}

async function waitFor(predicate: () => boolean, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
