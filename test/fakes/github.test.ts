import { describe, expect, it } from "vitest";
import { FakeGitHub } from "./github.ts";

describe("FakeGitHub", () => {
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
