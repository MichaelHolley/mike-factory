import { describe, expect, it, vi } from "vitest";
import { FakeGitHub } from "../../../test/fakes/github.ts";
import { issueImageUrls, loadIssueImages, MAX_ISSUE_IMAGES } from "./issueImages.ts";

const attachment = "https://github.com/user-attachments/assets/screenshot";

describe("issue image sources", () => {
  it("extracts inline Markdown and HTML sources in order", () => {
    expect(
      issueImageUrls(
        [
          `![Screenshot](${attachment})`,
          `![with title](<${attachment}?a=1&amp;b=2> "Screenshot")`,
          `<img width="400" alt="src='not-the-source'" data-src="ignored" SRC='${attachment}?a=1&#38;b=2'>`,
          `<img src=${attachment}>`,
          `![escaped alt \\]](${attachment}\\(1\\).png)`,
          `[not an image](${attachment})`,
          `<img data-src="not-a-source">`,
        ].join("\n"),
      ),
    ).toEqual([attachment, `${attachment}?a=1&b=2`, `${attachment}?a=1&b=2`, attachment, `${attachment}(1).png`]);
  });

  it("deduplicates sources across the issue and comments and numbers attached images", async () => {
    const github = new FakeGitHub();
    const image = { data: "aW1hZ2U=", mimeType: "image/png" };
    github.addIssueImage(attachment, { ok: true, image });
    const result = await loadIssueImages(github, "demo", [`![](${attachment})`, `<img src="${attachment}">`]);
    expect(result).toEqual({ images: [{ type: "image", ...image }], notes: [`${attachment}: attached as image 1.`] });
    expect(github.callCount("downloadIssueImage")).toBe(1);
  });

  it("notes external images without asking GitHub to fetch them", async () => {
    const github = new FakeGitHub();
    const result = await loadIssueImages(github, "demo", ["![outside](https://example.com/screenshot.png)"]);
    expect(result.images).toEqual([]);
    expect(result.notes).toEqual([
      "https://example.com/screenshot.png: skipped (not an allowed GitHub attachment URL).",
    ]);
    expect(github.callCount("downloadIssueImage")).toBe(0);
  });

  it("notes unsuccessful downloads and keeps later images", async () => {
    const github = new FakeGitHub();
    github.addIssueImage(attachment, { ok: false, reason: "unsupported image MIME type" });
    github.addIssueImage(`${attachment}/good`, { ok: true, image: { data: "Z29vZA==", mimeType: "image/jpeg" } });
    const download = github.downloadIssueImage.bind(github);
    vi.spyOn(github, "downloadIssueImage").mockImplementation(async (repo, url) => {
      if (url.endsWith("/error")) throw new Error("secret");
      return download(repo, url);
    });
    const result = await loadIssueImages(github, "demo", [
      [attachment, `${attachment}/error`, `${attachment}/good`].map((url) => `![](${url})`).join("\n"),
    ]);
    expect(result.images).toEqual([{ type: "image", data: "Z29vZA==", mimeType: "image/jpeg" }]);
    expect(result.notes).toEqual([
      `${attachment}: skipped (unsupported image MIME type).`,
      `${attachment}/error: skipped (image download failed).`,
      `${attachment}/good: attached as image 1.`,
    ]);
  });

  it("bounds download attempts, including failures, and notes images over the limit", async () => {
    const github = new FakeGitHub();
    const urls = Array.from({ length: MAX_ISSUE_IMAGES + 2 }, (_, i) => `${attachment}/${i}`);
    const result = await loadIssueImages(github, "demo", [urls.map((url) => `![](${url})`).join("\n")]);
    expect(github.callCount("downloadIssueImage")).toBe(MAX_ISSUE_IMAGES);
    expect(result.images).toEqual([]);
    expect(result.notes.slice(MAX_ISSUE_IMAGES)).toEqual(
      urls.slice(MAX_ISSUE_IMAGES).map((url) => `${url}: skipped (limit of ${MAX_ISSUE_IMAGES} image downloads).`),
    );
  });
});
