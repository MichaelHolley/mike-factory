import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, type App } from "vue";
import { createMemoryHistory, createRouter, RouterView, type Router } from "vue-router";
import type { RunStatus } from "../../../src/runStatus.ts";
import RunDetailView from "./RunDetailView.vue";
import RunListView from "./RunListView.vue";

class TestEventSource {
  static open = new Set<TestEventSource>();
  onmessage?: (event: { data: string }) => void;

  constructor(readonly url: string) {
    TestEventSource.open.add(this);
  }

  close() {
    TestEventSource.open.delete(this);
  }
}

function run(repo: string, issue: number, phase: RunStatus["phase"]): RunStatus {
  return {
    repo,
    issue,
    phase,
    issueUrl: `https://github.com/example/${repo}/issues/${issue}`,
    branch: `agent/issue-${issue}`,
    attempts: 1,
    costUsd: 0.42,
    model: null,
    thinkingLevel: null,
    prUrl: null,
    lastError: null,
    startedAt: "2026-11-13T07:00:00Z",
    updatedAt: "2026-11-13T07:30:00Z",
  };
}

const runs = [
  run("alpha", 1, "done"),
  run("alpha", 2, "failed"),
  run("alpha", 3, "aborted"),
  run("beta", 4, "done"),
  run("gamma", 5, "implement"),
];

let app: App;
let router: Router;
let container: HTMLDivElement;

async function sendRuns(items = runs) {
  for (const source of TestEventSource.open) {
    if (source.url === "/status/stream") {
      source.onmessage?.({ data: JSON.stringify({ from: 0, items }) });
    }
  }
  await nextTick();
}

function toggle(repo: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("th button")].find((button) =>
    button.textContent?.includes(repo),
  );
  expect(button).toBeDefined();
  return button!;
}

function finishedLinks() {
  return [...container.querySelectorAll<HTMLAnchorElement>('tbody td a[href^="/runs/"]')].map((link) =>
    link.getAttribute("href"),
  );
}

async function mountList() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: RunListView },
      { path: "/runs/:repo/:issue", component: RunDetailView },
    ],
  });
  await router.push("/");
  app = createApp(RouterView).use(router);
  app.mount(container);
  await sendRuns();
}

beforeEach(async () => {
  vi.stubGlobal("EventSource", TestEventSource);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  container = document.createElement("div");
  document.body.append(container);
  await mountList();
});

afterEach(() => {
  app.unmount();
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("finished repository groups", () => {
  it("starts collapsed and toggles each repository independently without hiding live runs", async () => {
    expect(toggle("alpha").textContent).toContain("3");
    expect(toggle("beta").textContent).toContain("1");
    expect(toggle("alpha").getAttribute("aria-expanded")).toBe("false");
    expect(toggle("beta").getAttribute("aria-expanded")).toBe("false");
    expect(finishedLinks()).toEqual([]);
    expect(container.querySelector('li a[href="/runs/gamma/5"]')).not.toBeNull();

    toggle("alpha").click();
    await nextTick();
    expect(toggle("alpha").getAttribute("aria-expanded")).toBe("true");
    expect(toggle("alpha").querySelector("svg")?.classList.contains("rotate-90")).toBe(true);
    expect(finishedLinks()).toEqual(["/runs/alpha/1", "/runs/alpha/2", "/runs/alpha/3"]);
    expect(toggle("beta").getAttribute("aria-expanded")).toBe("false");

    toggle("beta").click();
    await nextTick();
    expect(finishedLinks()).toHaveLength(4);

    toggle("alpha").click();
    await nextTick();
    expect(toggle("alpha").getAttribute("aria-expanded")).toBe("false");
    expect(toggle("alpha").querySelector("svg")?.classList.contains("rotate-90")).toBe(false);
    expect(finishedLinks()).toEqual(["/runs/beta/4"]);
    expect(container.querySelector('li a[href="/runs/gamma/5"]')).not.toBeNull();
  });

  it("keeps expansion tied to the repository through live updates and starts new groups collapsed", async () => {
    toggle("alpha").click();
    await nextTick();
    await sendRuns([
      ...runs.filter((item) => item.repo === "alpha"),
      run("alpha", 6, "done"),
      { ...run("beta", 4, "done"), updatedAt: "2026-11-13T08:00:00Z" },
      run("gamma", 5, "done"),
    ]);

    expect(container.querySelector("th button")?.textContent).toContain("beta");
    expect(toggle("alpha").getAttribute("aria-expanded")).toBe("true");
    expect(toggle("alpha").textContent).toContain("4");
    expect(toggle("beta").getAttribute("aria-expanded")).toBe("false");
    expect(toggle("gamma").getAttribute("aria-expanded")).toBe("false");
    expect(finishedLinks()).toEqual(["/runs/alpha/1", "/runs/alpha/2", "/runs/alpha/3", "/runs/alpha/6"]);
  });

  it("resets expanded groups after navigation or a fresh mount", async () => {
    toggle("alpha").click();
    await nextTick();
    await router.push("/runs/alpha/1");
    await sendRuns();
    await router.push("/");
    await sendRuns();
    expect(toggle("alpha").getAttribute("aria-expanded")).toBe("false");
    expect(finishedLinks()).toEqual([]);

    toggle("alpha").click();
    await nextTick();
    app.unmount();
    await mountList();
    expect(toggle("alpha").getAttribute("aria-expanded")).toBe("false");
    expect(finishedLinks()).toEqual([]);
  });
});
