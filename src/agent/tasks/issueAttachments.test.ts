import { DEFAULT_IMAGE_LIMITS } from "@earendil-works/pi-durable/tools";
import { describe, expect, it } from "vitest";
import { FakeGitHub, PNG_IMAGE } from "../../../test/fakes/github.ts";
import {
  issueImageUrls,
  loadIssueImages,
  loadIssueTexts,
  MAX_ISSUE_IMAGES,
  MAX_ISSUE_TEXT_TOTAL_BYTES,
  MAX_ISSUE_TEXTS,
} from "./issueAttachments.ts";

const attachment = "https://github.com/user-attachments/assets/screenshot";

describe("issue image sources", () => {
  it("finds only GitHub attachment URLs in Markdown, HTML and plain text", () => {
    const legacy = "https://user-images.githubusercontent.com/123/screenshot.png";
    const text = [
      `![Screenshot](${attachment})`,
      `<img width="400" src="${legacy}">`,
      "![Elsewhere](https://example.com/screenshot.png)",
      `See ${attachment}.png`,
    ].join("\n");
    expect(issueImageUrls(text)).toEqual([attachment, legacy, `${attachment}.png`]);
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

describe("issue text attachments", () => {
  const file = "https://github.com/user-attachments/files/1/build.log";

  it("deduplicates files across the issue and comments, ignores images and notes skipped files", async () => {
    const github = new FakeGitHub();
    github.addIssueText(file, { ok: true, text: "log", truncated: false });
    github.addIssueText(`${file}/big`, { ok: true, text: "head", truncated: true });
    github.addIssueText(`${file}/binary`, { ok: false, reason: "not a UTF-8 text file" });
    const result = await loadIssueTexts(github, "demo", [
      `[build.log](${file}) ![](${attachment})`,
      `${file} ${file}/big ${file}/binary`,
    ]);
    expect(result).toEqual({
      texts: [
        { url: file, text: "log", truncated: false },
        { url: `${file}/big`, text: "head", truncated: true },
      ],
      notes: [
        `${file}: attached as text below.`,
        `${file}/big: attached as text below, truncated to its first 4 bytes.`,
        `${file}/binary: skipped (not a UTF-8 text file).`,
      ],
    });
    expect(github.callCount("downloadIssueText")).toBe(3);
  });

  it("bounds download attempts, including failures", async () => {
    const github = new FakeGitHub();
    const urls = Array.from({ length: MAX_ISSUE_TEXTS + 1 }, (_, i) => `${file}/${i}`);
    const result = await loadIssueTexts(github, "demo", [urls.join("\n")]);
    expect(github.callCount("downloadIssueText")).toBe(MAX_ISSUE_TEXTS);
    expect(result.notes.at(-1)).toBe(`${urls.at(-1)}: skipped (limit of ${MAX_ISSUE_TEXTS} file downloads).`);
  });

  it("cuts texts to the total size limit at a character boundary, then skips the rest", async () => {
    const github = new FakeGitHub();
    const first = "a".repeat(MAX_ISSUE_TEXT_TOTAL_BYTES - 1);
    github.addIssueText(`${file}/0`, { ok: true, text: first, truncated: false });
    github.addIssueText(`${file}/1`, { ok: true, text: "é", truncated: false });
    github.addIssueText(`${file}/2`, { ok: true, text: "aé", truncated: false });
    const result = await loadIssueTexts(github, "demo", [`${file}/0 ${file}/1 ${file}/2 ${file}/3`]);
    expect(result.texts.map(({ text, truncated }) => [text, truncated])).toEqual([
      [first, false],
      ["a", true],
    ]);
    expect(result.notes.slice(1)).toEqual([
      `${file}/1: skipped (total text limit of 256 KiB reached).`,
      `${file}/2: attached as text below, truncated to its first 1 bytes.`,
      `${file}/3: skipped (total text limit of 256 KiB reached).`,
    ]);
  });
});
