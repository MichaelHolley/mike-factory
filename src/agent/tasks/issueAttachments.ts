import { posix } from "node:path";
import type { Context } from "@earendil-works/chord/context";
import { type ExecutionEnv, getOrThrow } from "@earendil-works/pi-durable/env";
import type { AttachmentDownload, GitHubClient } from "../../contracts.ts";
import { isAttachmentUrl } from "../../github/attachments.ts";
import { ATTACHMENT_LIMITS, type Attachment } from "../../runStatus.ts";
import { cleanName, servedType, type Uploads } from "../../uploads.ts";

/** Where a run's attached files go, relative to its worktree. */
export const ATTACHMENTS_DIR = ".mike/attachments";

/** A file for the agent: `label` names it in the prompt, `name` is its file name unless the bytes need an extension. */
export type AttachmentSource = { label: string; name: string; load: () => Promise<AttachmentDownload> };

/** GitHub's attachment URLs, whether in Markdown, HTML or plain text. */
export const attachmentUrls = (text: string): string[] =>
  (text.match(/https:\/\/[^\s)\]"'<>]+/gi) ?? []).map((url) => url.replace(/[.,;:!?]+$/, "")).filter(isAttachmentUrl);

const urlName = (url: string) => {
  try {
    return cleanName(decodeURIComponent(new URL(url).pathname.split("/").at(-1)!));
  } catch {
    return "file";
  }
};

/** The GitHub attachments `bodies` link to, each once. */
export const linkedFiles = (github: GitHubClient, repo: string, bodies: string[]): AttachmentSource[] =>
  [...new Set(bodies.flatMap(attachmentUrls))].map((url) => ({
    label: url,
    name: urlName(url),
    load: () => github.downloadAttachment(repo, url),
  }));

/** The owner's uploaded `attachments`. */
export const uploadedFiles = (
  uploads: Uploads,
  repo: string,
  issue: number,
  attachments: readonly Attachment[],
): AttachmentSource[] =>
  attachments.map(({ id, name }) => ({
    label: name,
    name,
    load: async () => {
      const bytes = await uploads.read(repo, issue, id);
      return bytes ? { ok: true, bytes } : { ok: false, reason: "the uploaded file is missing" };
    },
  }));

// GitHub's image links carry no extension, and `read` goes by the bytes, but a name the agent recognizes helps.
const withExtension = (name: string, bytes: Uint8Array) => {
  const type = servedType(bytes);
  return type.startsWith("image/") && !/\.\w+$/.test(name) ? `${name}.${type.slice("image/".length)}` : name;
};

const unique = (name: string, taken: Set<string>) => {
  const dot = name.lastIndexOf(".");
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];

  let candidate = name;
  for (let n = 2; taken.has(candidate); n++) candidate = `${stem}-${n}${extension}`;
  taken.add(candidate);
  return candidate;
};

/**
 * Writes the files into the worktree's `ATTACHMENTS_DIR/<folder>/` through the runner, within the attachment limits,
 * and returns one line per file for the prompt: its path, or why it was skipped. Loads are read-only, and a rerun after
 * a crash writes the same files again.
 */
export async function placeAttachments(
  env: ExecutionEnv,
  worktree: string,
  folder: string,
  sources: readonly AttachmentSource[],
  context: Context,
): Promise<string[]> {
  if (sources.length === 0) return [];

  const root = posix.join(worktree, ATTACHMENTS_DIR);
  const dir = posix.join(root, cleanName(folder));
  getOrThrow(await env.createDir(dir, { recursive: true }, context));
  // Ignored by git, so the files are never committed and never count as uncommitted changes.
  getOrThrow(await env.writeFile(posix.join(root, ".gitignore"), "*\n", context));

  const lines: string[] = [];
  const taken = new Set<string>();
  let attempted = 0;
  let total = 0;

  for (const { label, name, load } of sources) {
    if (attempted >= ATTACHMENT_LIMITS.count) {
      lines.push(`- ${label}: skipped (limit of ${ATTACHMENT_LIMITS.count} files per message)`);
      continue;
    }
    attempted++;

    const result = await load();
    if (!result.ok) {
      lines.push(`- ${label}: skipped (${result.reason})`);
      continue;
    }
    if (total + result.bytes.length > ATTACHMENT_LIMITS.totalBytes) {
      lines.push(`- ${label}: skipped (over ${ATTACHMENT_LIMITS.totalBytes / 1_000_000} MB per message)`);
      continue;
    }
    total += result.bytes.length;

    const path = posix.join(dir, unique(withExtension(name, result.bytes), taken));
    getOrThrow(await env.writeFile(path, result.bytes, context));

    const shown = posix.relative(worktree, path);
    lines.push(label === name ? `- ${shown}` : `- ${shown} (from ${label})`);
  }
  return lines;
}
