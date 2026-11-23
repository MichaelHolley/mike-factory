import { posix } from "node:path";
import type { Context } from "@earendil-works/chord/context";
import { type ExecutionEnv, getOrThrow } from "@earendil-works/pi-durable/env";
import type { GitHubClient } from "../../contracts.ts";
import type { AttachedFile } from "../../runStatus.ts";
import { isAttachmentUrl } from "../../github/attachments.ts";
import { imageHeader } from "../images.ts";

export const MAX_ATTACHMENTS = 5;
const MAX_NAME_LENGTH = 100;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
};

/** GitHub's pasted attachment URLs, whether in Markdown, HTML or plain text, each once in order of appearance. */
export const attachmentUrls = (texts: readonly string[]): string[] => [
  ...new Set(
    texts
      .flatMap((text) => text.match(/https:\/\/[^\s)\]"'<>]+/gi) ?? [])
      .map((url) => url.replace(/[.,;:!?]+$/, ""))
      .filter(isAttachmentUrl),
  ),
];

/** The URL's last path segment in safe characters, or undefined when it names no file, as GitHub image URLs don't. */
export function nameFromUrl(url: string): string | undefined {
  const segment = new URL(url).pathname.split("/").at(-1) ?? "";

  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Malformed escapes stay as they are and are replaced below.
  }

  const name = decoded.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "");
  const extension = /\.[A-Za-z0-9]{1,10}$/.exec(name)?.[0];
  if (!extension) return undefined;
  if (name.length <= MAX_NAME_LENGTH) return name;
  return name.slice(0, MAX_NAME_LENGTH - extension.length) + extension;
}

/** `name`, or `name-2`, `name-3`... before its extension, whichever `taken` doesn't hold yet, ignoring case. */
function unique(name: string, taken: Set<string>) {
  const dot = name.lastIndexOf(".");
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];

  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem}-${n}${extension}`;

  taken.add(candidate.toLowerCase());
  return candidate;
}

/** One message's attached files, stored in `folder` under the issue's attachments directory. */
export type AttachmentSource = { folder: string; texts: readonly string[] };

export type PlacedAttachment = { url: string; path: string } | { url: string; skipped: string };

/** The folder of a note's files: `review-<id>` and `comment-<id>` for PR feedback, `note-<uuid>` for the run page. */
export const noteFolder = (id: string) => {
  if (id.startsWith("pr-comment-")) return id.slice("pr-".length);
  if (id.startsWith("review-")) return id;
  return `note-${id}`;
};

/**
 * Downloads each source's attachments on the server and writes them to `<root>/<folder>/` through `env`, at most
 * `MAX_ATTACHMENTS` per source and each URL once across sources. Names depend only on the URLs and their bytes, so a
 * rerun after a crash overwrites the same files.
 */
export async function placeAttachments(
  github: GitHubClient,
  env: ExecutionEnv,
  context: Context,
  repo: string,
  root: string,
  sources: readonly AttachmentSource[],
): Promise<PlacedAttachment[]> {
  const placed: PlacedAttachment[] = [];
  const seen = new Set<string>();

  for (const { folder, texts } of sources) {
    const dir = posix.join(root, folder);
    const taken = new Set<string>();
    let attempted = 0;
    let unnamed = 0;

    for (const url of attachmentUrls(texts)) {
      if (seen.has(url)) continue;
      seen.add(url);

      if (attempted >= MAX_ATTACHMENTS) {
        placed.push({ url, skipped: `limit of ${MAX_ATTACHMENTS} files per message` });
        continue;
      }
      attempted++;

      const named = nameFromUrl(url);
      if (!named) unnamed++;

      const download = await github.downloadAttachment(repo, url);
      if (!download.ok) {
        placed.push({ url, skipped: download.reason });
        continue;
      }

      const extension = EXTENSIONS[imageHeader(download.bytes)?.mimeType ?? ""];
      const generated = extension ? `image-${unnamed}.${extension}` : `file-${unnamed}`;
      const path = posix.join(dir, unique(named ?? generated, taken));

      getOrThrow(await env.createDir(dir, { recursive: true }, context));
      getOrThrow(await env.writeFile(path, download.bytes, context));
      placed.push({ url, path });
    }
  }
  return placed;
}

const ATTACHMENTS_BLOCK = /<attachments>\n([\s\S]*?)\n<\/attachments>/g;
const STORED_LINE = /^- .+\/([^/\s]+)\/([^/\s]+) \(from (https:\/\/\S+)\)$/;
const SKIPPED_LINE = /^- (https:\/\/\S+): skipped \((.*)\)$/;

/**
 * The files `attachmentsSection` listed in `prompt`, by their `<folder>/<name>` under the issue's attachments. Only the
 * last block counts, since untrusted issue text comes before it.
 */
export function attachedFiles(prompt: string): AttachedFile[] {
  const block = [...prompt.matchAll(ATTACHMENTS_BLOCK)].at(-1)?.[1] ?? "";

  return block.split("\n").flatMap((line): AttachedFile[] => {
    const stored = STORED_LINE.exec(line);
    if (stored) return [{ name: stored[2]!, source: stored[3]!, path: `${stored[1]}/${stored[2]}` }];

    const skipped = SKIPPED_LINE.exec(line);
    if (!skipped) return [];

    const source = skipped[1]!;
    const name = (URL.canParse(source) && nameFromUrl(source)) || "attachment";
    return [{ name, source, skipped: skipped[2]! }];
  });
}

/** Lists the files for the prompt, without their content, after `intro`; undefined when there are none. */
export function attachmentsSection(intro: string, placed: readonly PlacedAttachment[]) {
  if (placed.length === 0) return undefined;

  const lines = placed.map((file) =>
    "path" in file ? `- ${file.path} (from ${file.url})` : `- ${file.url}: skipped (${file.skipped})`,
  );
  return [
    `${intro} They are stored outside the working directory, so they can't be committed; read them but don't change them. Open them with \`read\` for text and images, or \`bash\` for other formats such as archives or PDFs. Copy one into the repository only when the task asks for it.`,
    `<attachments>\n${lines.join("\n")}\n</attachments>`,
  ].join("\n");
}
