import { DEFAULT_IMAGE_LIMITS } from "@earendil-works/pi-durable/tools";
import { describe, expect, it } from "vitest";
import { FakeGitHub, PNG_IMAGE } from "../../../test/fakes/github.ts";
import { issueImageUrls, loadIssueImages, MAX_ISSUE_IMAGES } from "./issueImages.ts";

const attachment = "https://github.com/user-attachments/assets/screenshot";

describe("issue image sources", () => {
  it("finds GitHub attachment URLs in Markdown, HTML and plain text", () => {
    const legacy = "https://user-images.githubusercontent.com/123/screenshot.png";
    expect(
      issueImageUrls(
        [`![Screenshot](${attachment})`, `<img width="400" src="${legacy}">`, `See ${attachment}.png`].join("\n"),
      ),
    ).toEqual([attachment, legacy, `${attachment}.png`]);
  });

  it("trims link syntax and sentence punctuation from attachment URLs", () => {
    expect(issueImageUrls(`[${attachment}](${attachment}) and see ${attachment}/2.`)).toEqual([
      attachment,
      attachment,
      `${attachment}/2`,
    ]);
  });

  it("deduplicates sources across the issue and comments and numbers attached images", async () => {
    const github = new FakeGitHub();
    github.addIssueImage(attachment, { ok: true, image: PNG_IMAGE });
    const result = await loadIssueImages(
      github,
      "demo",
      [`![](${attachment})`, `<img src="${attachment}">`],
      DEFAULT_IMAGE_LIMITS,
    );
    expect(result).toEqual({
      images: [{ type: "image", ...PNG_IMAGE }],
      notes: [`${attachment}: attached as image 1.`],
    });
    expect(github.callCount("downloadIssueImage")).toBe(1);
  });

  it("ignores images outside the supported GitHub attachment URLs", async () => {
    const github = new FakeGitHub();
    const urls = [
      "https://example.com/screenshot.png",
      "https://github.com/example/repo/image.png",
      "https://github.com.evil.test/user-attachments/assets/image",
      "https://user-images.githubusercontent.com.evil.test/image.png",
      "http://github.com/user-attachments/assets/image",
      "https://github.com/user-attachments/files/1/build.log",
    ];
    const result = await loadIssueImages(
      github,
      "demo",
      [urls.map((url) => `![](${url})`).join("\n")],
      DEFAULT_IMAGE_LIMITS,
    );
    expect(result).toEqual({ images: [], notes: [] });
    expect(github.callCount("downloadIssueImage")).toBe(0);
  });

  it("notes unsuccessful downloads and keeps later images", async () => {
    const github = new FakeGitHub();
    github.addIssueImage(attachment, { ok: false, reason: "unsupported image MIME type" });
    github.addIssueImage(`${attachment}/good`, { ok: true, image: PNG_IMAGE });
    const result = await loadIssueImages(
      github,
      "demo",
      [[attachment, `${attachment}/missing`, `${attachment}/good`].map((url) => `![](${url})`).join("\n")],
      DEFAULT_IMAGE_LIMITS,
    );
    expect(result.images).toEqual([{ type: "image", ...PNG_IMAGE }]);
    expect(result.notes).toEqual([
      `${attachment}: skipped (unsupported image MIME type).`,
      `${attachment}/missing: skipped (download returned HTTP 404).`,
      `${attachment}/good: attached as image 1.`,
    ]);
  });

  it("bounds download attempts, including failures, and notes images over the limit", async () => {
    const github = new FakeGitHub();
    const urls = Array.from({ length: MAX_ISSUE_IMAGES + 2 }, (_, i) => `${attachment}/${i}`);
    const result = await loadIssueImages(
      github,
      "demo",
      [urls.map((url) => `![](${url})`).join("\n")],
      DEFAULT_IMAGE_LIMITS,
    );
    expect(github.callCount("downloadIssueImage")).toBe(MAX_ISSUE_IMAGES);
    expect(result.images).toEqual([]);
    expect(result.notes.slice(MAX_ISSUE_IMAGES)).toEqual(
      urls.slice(MAX_ISSUE_IMAGES).map((url) => `${url}: skipped (limit of ${MAX_ISSUE_IMAGES} image downloads).`),
    );
  });

  it("scales images down to the model's limits", async () => {
    const github = new FakeGitHub();
    github.addIssueImage(attachment, { ok: true, image: PNG_IMAGE });
    const { images } = await loadIssueImages(github, "demo", [attachment], {
      ...DEFAULT_IMAGE_LIMITS,
      maxWidth: 1,
      maxHeight: 1,
    });
    const header = Buffer.from(images[0]!.data, "base64");
    expect([header.readUInt32BE(16), header.readUInt32BE(20)]).toEqual([1, 1]);
  });

  it("skips images that cannot be decoded", async () => {
    const github = new FakeGitHub();
    github.addIssueImage(attachment, { ok: true, image: { mimeType: "image/png", data: "bm90IGEgcG5n" } });
    expect(await loadIssueImages(github, "demo", [attachment], DEFAULT_IMAGE_LIMITS)).toEqual({
      images: [],
      notes: [`${attachment}: skipped (image cannot be decoded or scaled to fit).`],
    });
  });
});
