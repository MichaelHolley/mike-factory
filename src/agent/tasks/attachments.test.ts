import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeGitHub, PNG_BYTES } from "../../../test/fakes/github.ts";
import {
  attachedFiles,
  type AttachmentSource,
  attachmentUrls,
  MAX_ATTACHMENTS,
  nameFromUrl,
  noteFolder,
  placeAttachments,
  uploadedFiles,
} from "./attachments.ts";

const image = "https://github.com/user-attachments/assets/2d1f6a3c-9b7e-4f1a-8c2d-3e4f5a6b7c8d";
const file = "https://github.com/user-attachments/files/1/build.log";

describe("attachmentUrls", () => {
  it("finds only GitHub attachment URLs in Markdown, HTML and plain text, each once", () => {
    const legacy = "https://user-images.githubusercontent.com/123/screenshot.png";
    const text = [
      `![Screenshot](${image})`,
      `<img width="400" src="${legacy}">`,
      "![Elsewhere](https://example.com/screenshot.png)",
      `[build.log](${file}) and again ${file}.`,
    ].join("\n");
    expect(attachmentUrls([text, `<img src="${image}">`])).toEqual([image, legacy, file]);
  });
});

describe("nameFromUrl", () => {
  it.each([
    [file, "build.log"],
    ["https://github.com/user-attachments/files/2/my%20report%20(final).pdf", "my-report-final-.pdf"],
    ["https://github.com/user-attachments/files/3/..%2F..%2F.bashrc.sh", "bashrc.sh"],
    ["https://github.com/user-attachments/files/4/%E2%80%AE.txt", undefined],
    [image, undefined],
    ["https://github.com/user-attachments/files/5/..", undefined],
  ])("names %s %s", (url, name) => {
    expect(nameFromUrl(url)).toBe(name);
  });

  it("shortens long names and keeps the extension", () => {
    const name = nameFromUrl(`https://github.com/user-attachments/files/6/${"a".repeat(300)}.log`)!;
    expect(name).toHaveLength(100);
    expect(name.endsWith("a.log")).toBe(true);
  });
});

describe("noteFolder", () => {
  it.each([
    ["review-12", "review-12"],
    ["pr-comment-34", "comment-34"],
    ["7d2f8c1e-5b3a-4c6d-9e8f-0a1b2c3d4e5f", "note-7d2f8c1e-5b3a-4c6d-9e8f-0a1b2c3d4e5f"],
  ])("puts %s in %s", (id, folder) => {
    expect(noteFolder(id)).toBe(folder);
  });
});

describe("uploadedFiles", () => {
  it("cleans names, names empty ones by position and keeps each unique in the folder", () => {
    expect(uploadedFiles("note-1", ["Screen Shot.png", "../.env", "screen-shot.PNG", "", "Makefile"])).toEqual([
      { name: "Screen-Shot.png", source: "upload", path: "note-1/Screen-Shot.png" },
      { name: "env", source: "upload", path: "note-1/env" },
      { name: "screen-shot-2.PNG", source: "upload", path: "note-1/screen-shot-2.PNG" },
      { name: "file-4", source: "upload", path: "note-1/file-4" },
      { name: "Makefile", source: "upload", path: "note-1/Makefile" },
    ]);
  });
});

describe("placeAttachments", () => {
  let root: string;
  let github: FakeGitHub;
  const place = (sources: AttachmentSource[]) =>
    placeAttachments(github, new NodeExecutionEnv({ cwd: root }), ctx, "demo", root, sources);

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "attachments-"));
    github = new FakeGitHub();
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it("writes each message's files to its folder and lists them, skipped ones with the reason", async () => {
    github.addAttachment(image, PNG_BYTES);
    github.addAttachment(file, "error: missing semicolon\n");
    github.addAttachment(`${image}-video`, "not an image");
    github.addAttachment("https://github.com/user-attachments/files/2/huge.zip", { reason: "too large" });

    const placed = await place([
      { folder: "issue", texts: [`![](${image}) [log](${file})`] },
      {
        folder: "issue-comment-7",
        texts: [`quoting ![](${image}) ${image}-video https://github.com/user-attachments/files/2/huge.zip`],
      },
    ]);

    expect(placed).toEqual([
      { url: image, path: join(root, "issue", "image-1.png") },
      { url: file, path: join(root, "issue", "build.log") },
      { url: `${image}-video`, path: join(root, "issue-comment-7", "file-1") },
      { url: "https://github.com/user-attachments/files/2/huge.zip", skipped: "too large" },
    ]);
    expect(await readFile(join(root, "issue", "build.log"), "utf8")).toBe("error: missing semicolon\n");
    expect(await readFile(join(root, "issue", "image-1.png"))).toEqual(PNG_BYTES);
  });

  it("gives files with the same name their own, so none overwrites another", async () => {
    const urls = [1, 2, 3].map((n) => `https://github.com/user-attachments/files/${n}/Build.log`);
    for (const [n, url] of urls.entries()) github.addAttachment(url, `log ${n}`);
    github.addAttachment(`https://github.com/user-attachments/files/4/build-2.log`, "log 3");

    await place([
      { folder: "issue", texts: [[...urls, "https://github.com/user-attachments/files/4/build-2.log"].join(" ")] },
    ]);

    expect((await readdir(join(root, "issue"))).sort()).toEqual([
      "Build-2.log",
      "Build-3.log",
      "Build.log",
      "build-2-2.log",
    ]);
  });

  it("leaves the names a source already holds to those files", async () => {
    github.addAttachment(file, "linked");

    const placed = await place([{ folder: "note-1", texts: [file], taken: ["Build.log"] }]);

    expect(placed).toEqual([{ url: file, path: join(root, "note-1", "build-2.log") }]);
  });

  it("bounds download attempts per message, including failures", async () => {
    const urls = Array.from(
      { length: MAX_ATTACHMENTS + 1 },
      (_, n) => `https://github.com/user-attachments/files/${n}/f.txt`,
    );

    const placed = await place([{ folder: "issue", texts: [urls.join(" ")] }]);

    expect(github.callCount("downloadAttachment")).toBe(MAX_ATTACHMENTS);
    expect(placed.at(-1)).toEqual({ url: urls.at(-1), skipped: `limit of ${MAX_ATTACHMENTS} files per message` });
  });
});

describe("attachedFiles", () => {
  it("names stored files by their folder and name under the attachments, and skipped ones by their URL", () => {
    expect(
      attachedFiles([
        { url: image, path: "/data/attachments/demo/issue-3/issue/image-1.png" },
        { url: file, skipped: "download failed" },
        { url: image, skipped: "too large" },
      ]),
    ).toEqual([
      { name: "image-1.png", source: image, path: "issue/image-1.png" },
      { name: "build.log", source: file, skipped: "download failed" },
      { name: "attachment", source: image, skipped: "too large" },
    ]);
  });
});
