import type { Message } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
  bashViolation,
  budgetBreach,
  pathOutside,
  pathToolViolation,
  spentSince,
  totalCostUsd,
} from "../../src/agent/extensions/guards.ts";

const worktree = "/data/worktrees/demo/issue-1";
const attachments = "/data/attachments/demo/issue-1";
const dirs = { worktree, attachments };

describe("bashViolation", () => {
  it.each([
    "git push origin main",
    "git push",
    "git -C /data/worktrees/demo/issue-1 push origin HEAD",
    "git -c user.name=x push origin main",
    "echo hi && git push --force",
    "git remote add evil https://example.com/x.git",
    "gh pr create --fill",
    "FOO=1 gh issue list",
    "curl -H 'Authorization: token x' https://api.github.com/user",
    "wget -qO- https://api.github.com/repos/o/r",
    "rm -rf /",
    "rm -rf /*",
    "rm -fr ~",
    "rm -r -f $HOME",
    "cat /data/agent.sqlite",
    "cat /etc/passwd",
    "cp secrets.txt /root/x",
    "ls --color=auto /data/worktrees/demo/issue-2",
    "cat /data/attachments/demo/issue-2/issue/build.log",
  ])("blocks %s", (command) => {
    expect(bashViolation(command, dirs)).toBeDefined();
  });

  it.each([
    "git status",
    "git commit -am 'push the button'",
    "git log --oneline",
    "pnpm test",
    "rm -rf node_modules",
    "rm -rf ./build",
    "cat /data/worktrees/demo/issue-1/src/index.ts",
    "ls /data/worktrees/demo/issue-1",
    "/usr/bin/env node -v",
    "echo hi > /dev/null",
    "curl https://example.com/file.tgz",
    "echo ghost",
    "unzip -l /data/attachments/demo/issue-1/issue/logs.zip",
  ])("allows %s", (command) => {
    expect(bashViolation(command, dirs)).toBeUndefined();
  });

  it("normalizes .. segments before judging a path", () => {
    expect(pathOutside("/data/worktrees/demo/issue-1/../issue-2/x", [worktree])).toBeDefined();
  });
});

describe("pathToolViolation", () => {
  it.each([
    ["read", "src/index.ts"],
    ["write", `${worktree}/notes.md`],
    ["read", `${attachments}/issue/image-1.png`],
  ])("allows %s of %s", (tool, path) => {
    expect(pathToolViolation(tool, path, dirs)).toBeUndefined();
  });

  it.each([
    ["write", `${attachments}/issue/build.log`, "read-only"],
    ["edit", "../../../attachments/demo/issue-1/issue/build.log", "read-only"],
    ["read", "../issue-2/secret.txt", "outside"],
    ["read", "/data/attachments/demo/issue-2/issue/x.png", "outside"],
  ])("blocks %s of %s", (tool, path, reason) => {
    expect(pathToolViolation(tool, path, dirs)).toContain(reason);
  });
});

describe("budget", () => {
  const limits = { maxTurns: 3, maxCostUsd: 1 };

  it("sums model and tool spend", () => {
    const usage = (total: number) => ({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total },
    });
    expect(totalCostUsd({ models: { "a/b": usage(0.25), "a/c": usage(0.5) }, tools: { x: usage(0.125) } })).toBeCloseTo(
      0.875,
    );
    expect(totalCostUsd(undefined)).toBe(0);
  });

  it("names the budget that ran out", () => {
    expect(budgetBreach(limits, { turns: 2, costUsd: 0.99 })).toBeUndefined();
    expect(budgetBreach(limits, { turns: 3, costUsd: 0 })).toContain("turn budget exhausted");
    expect(budgetBreach(limits, { turns: 0, costUsd: 1.2 })).toContain("cost budget exhausted");
  });

  it("counts only the current run, so spend from earlier runs does not block a new one", () => {
    const turn = (timestamp: number) => ({ role: "assistant", timestamp }) as Message;
    const earlier = [turn(1), turn(2), turn(3), turn(4)];
    expect(budgetBreach(limits, spentSince([...earlier, turn(10)], 1.5, null))).toBeDefined();
    expect(spentSince([...earlier, turn(10)], 1.5, { at: 10, costUsd: 1 })).toEqual({ turns: 1, costUsd: 0.5 });
  });

  it("keeps counting the run's turns after compaction drops earlier ones from the context", () => {
    const compacted = [
      { role: "user", timestamp: 9 } as Message,
      ...[10, 11, 12].map((timestamp) => ({ role: "assistant", timestamp }) as Message),
    ];
    expect(budgetBreach(limits, spentSince(compacted, 0, { at: 10, costUsd: 0 }))).toContain("turn budget exhausted");
  });
});
