import { describe, expect, it } from "vitest";
import { branchSlug, issueOfBranch } from "./contracts.ts";

describe("branchSlug", () => {
  it.each([
    ["Add dark mode toggle", "add-dark-mode-toggle"],
    ["  feat: Größe & Übersicht!! ", "feat-gro-e-ubersicht"],
    ["", "issue"],
    ["!!!", "issue"],
    [
      "Use a lightweight model to create better branch names within the pipeline",
      "use-a-lightweight-model-to-create-better",
    ],
    ["a".repeat(60), "a".repeat(40)],
  ])("turns %j into %j", (text, slug) => {
    expect(branchSlug(text)).toBe(slug);
  });
});

describe("issueOfBranch", () => {
  it.each([
    ["mike/56-better-branch-names", 56],
    ["mike/123-x", 123],
    ["agent/issue-12", 12],
    ["mike/12", undefined],
    ["mike/12-Upper", undefined],
    ["agent/issue-12-x", undefined],
    ["feature/12-x", undefined],
  ])("reads %j as issue %j", (ref, issue) => {
    expect(issueOfBranch(ref)).toBe(issue);
  });
});
