import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeGitHub, PNG } from "../../../test/fakes/github.ts";
import { ATTACHMENT_LIMITS } from "../../runStatus.ts";
import { createUploads } from "../../uploads.ts";
import { ATTACHMENTS_DIR, attachmentUrls, linkedFiles, placeAttachments, uploadedFiles } from "./issueAttachments.ts";

const image = "https://github.com/user-attachments/assets/screenshot";
const file = "https://github.com/user-attachments/files/1/build.log";

describe("attachment links", () => {
  it("finds only GitHub attachment URLs in Markdown, HTML and plain text", () => {
    const legacy = "https://user-images.githubusercontent.com/123/screenshot.png";
    const text = [
      `![Screenshot](${image})`,
      `<img width="400" src="${legacy}">`,
      `[build.log](${file})`,
      "![Elsewhere](https://example.com/screenshot.png)",
      `See ${image}/2.`,
    ].join("\n");
    expect(attachmentUrls(text)).toEqual([image, legacy, file, `${image}/2`]);
  });
});

describe("placing attachments", () => {
  let worktree: string;
  let uploadDir: string;
  beforeEach(() => {
    worktree = mkdtempSync(join(tmpdir(), "attachments-"));
    uploadDir = mkdtempSync(join(tmpdir(), "uploads-"));
    execFileSync("git", ["init", "-q"], { cwd: worktree });
  });
  afterEach(() => {
    rmSync(worktree, { recursive: true, force: true });
    rmSync(uploadDir, { recursive: true, force: true });
  });

  const place = (sources: Parameters<typeof placeAttachments>[3]) =>
    placeAttachments(new NodeExecutionEnv({ cwd: worktree }), worktree, "note-1", sources, BACKGROUND_CONTEXT);
  const folder = () => join(worktree, ATTACHMENTS_DIR, "note-1");

  it("writes uploaded and linked files of any type where git ignores them, and lists their paths", async () => {
    const github = new FakeGitHub();
    github.addAttachment(image, PNG);
    github.addAttachment(file, "error: boom\n");
    const uploads = createUploads(uploadDir);
    const zip = await uploads.save("demo", 1, new File([new Uint8Array([0x50, 0x4b, 3, 4])], "build.log"));

    const lines = await place([
      ...uploadedFiles(uploads, "demo", 1, [zip]),
      ...linkedFiles(github, "demo", [`![](${image}) [log](${file}) ${image}`]),
    ]);

    expect(lines).toEqual([
      `- ${ATTACHMENTS_DIR}/note-1/build.log`,
      `- ${ATTACHMENTS_DIR}/note-1/screenshot.png (from ${image})`,
      `- ${ATTACHMENTS_DIR}/note-1/build-2.log (from ${file})`,
    ]);
    expect(readFileSync(join(folder(), "screenshot.png"))).toEqual(PNG);
    expect(readFileSync(join(folder(), "build-2.log"), "utf8")).toBe("error: boom\n");
    expect(execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: worktree }).toString()).toBe(
      "",
    );
  });

  it("lists files it couldn't load or that are over a limit as skipped, and stops loading past the file count", async () => {
    const github = new FakeGitHub();
    github.addAttachment(image, { reason: "download returned HTTP 403" });
    const big = new Uint8Array(ATTACHMENT_LIMITS.fileBytes);
    const sources = Array.from({ length: ATTACHMENT_LIMITS.count + 1 }, (_, i) => ({
      label: `big-${i}.bin`,
      name: `big-${i}.bin`,
      load: async () => ({ ok: true as const, bytes: big }),
    }));

    const lines = await place([...linkedFiles(github, "demo", [image]), ...sources]);

    expect(lines).toEqual([
      `- ${image}: skipped (download returned HTTP 403)`,
      `- ${ATTACHMENTS_DIR}/note-1/big-0.bin`,
      `- ${ATTACHMENTS_DIR}/note-1/big-1.bin`,
      ...[2, 3, 4, 5, 6, 7, 8].map((i) => `- big-${i}.bin: skipped (over 25 MB per message)`),
      ...[9, 10].map((i) => `- big-${i}.bin: skipped (limit of ${ATTACHMENT_LIMITS.count} files per message)`),
    ]);
    expect(readdirSync(folder()).sort()).toEqual(["big-0.bin", "big-1.bin"]);
  });
});
