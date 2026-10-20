import { describe, expect, it } from "vitest";
import { FakeGitHub } from "./github.ts";

describe("FakeGitHub", () => {
  it("upsertComment edits the marked comment instead of adding another", async () => {
    const gh = new FakeGitHub();
    gh.addIssue("r", { number: 1 });
    await gh.upsertComment("r", 1, "status", "one");
    await gh.upsertComment("r", 1, "status", "two");
    await gh.upsertComment("r", 1, "other", "x");
    expect(gh.commentsOn("r", 1).map((c) => c.body)).toEqual(["<!-- status -->\ntwo", "<!-- other -->\nx"]);
  });

  it("createPr rejects a duplicate open head and findOpenPr sees the first", async () => {
    const gh = new FakeGitHub();
    const pr = { head: "agent/issue-1", base: "main", title: "t", body: "b" };
    const first = await gh.createPr("r", pr);
    await expect(gh.createPr("r", pr)).rejects.toThrow(/422/);
    expect(await gh.findOpenPr("r", pr.head)).toEqual(first);
  });

  it("survives a JSON round trip", async () => {
    const gh = new FakeGitHub();
    gh.addIssue("r", { number: 1 });
    await gh.createPr("r", { head: "h", base: "main", title: "t", body: "b" });
    await gh.upsertComment("r", 1, "m", "x");
    const copy = FakeGitHub.fromJSON(JSON.parse(JSON.stringify(gh)));
    expect(copy.prs).toEqual(gh.prs);
    expect(copy.callCount("createPr")).toBe(1);
    await expect(copy.createPr("r", { head: "h", base: "main", title: "t", body: "b" })).rejects.toThrow();
    await copy.upsertComment("r", 1, "m", "y");
    expect(copy.commentsOn("r", 1)).toHaveLength(1);
  });
});
