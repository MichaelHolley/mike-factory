import type { ImageContent, Models } from "@earendil-works/pi-ai";
import type { ModelRef } from "@earendil-works/pi-durable";
import { createNodePhotonImages } from "@earendil-works/pi-durable/images/node";
import { DEFAULT_IMAGE_LIMITS, type ImageLimits, type ImageProcessor } from "@earendil-works/pi-durable/tools";
import type { GitHubClient } from "../../contracts.ts";
import { isIssueFileUrl, isIssueImageUrl, truncateUtf8 } from "../../github/attachments.ts";

export const MAX_ISSUE_IMAGES = 5;
export const MAX_ISSUE_TEXTS = 5;
export const MAX_ISSUE_TEXT_TOTAL_BYTES = 256 * 1024;

/** The model's image limits, resolved as pi-durable's `read` tool resolves them. */
export const modelImageLimits = (models: Models, ref: ModelRef | undefined): ImageLimits => {
  const resize = ref && models.getModel(ref.provider, ref.modelId)?.inputLimits?.images?.resize;
  return {
    maxWidth: resize?.maxWidth ?? DEFAULT_IMAGE_LIMITS.maxWidth,
    maxHeight: resize?.maxHeight ?? DEFAULT_IMAGE_LIMITS.maxHeight,
    maxBytes: resize?.maxBytes ?? DEFAULT_IMAGE_LIMITS.maxBytes,
  };
};

let processor: Promise<ImageProcessor> | undefined;

/** Decodes the image and scales it to `limits`, so a damaged or oversized one is skipped instead of failing the model request. */
async function prepare(data: string, mimeType: string, limits: ImageLimits) {
  // A pooled Buffer's memory cannot be transferred to Photon's worker thread; a plain copy can.
  const bytes = Uint8Array.from(Buffer.from(data, "base64"));
  try {
    return await (processor ??= createNodePhotonImages()).then((images) => images.prepare(bytes, mimeType, limits));
  } catch {
    return undefined;
  }
}

/** GitHub's pasted attachment URLs, whether in Markdown, HTML or plain text. */
const attachmentUrls = (text: string, accept: (url: string) => boolean): string[] =>
  (text.match(/https:\/\/[^\s)\]"'<>]+/gi) ?? []).map((url) => url.replace(/[.,;:!?]+$/, "")).filter(accept);

export const issueImageUrls = (text: string): string[] => attachmentUrls(text, isIssueImageUrl);

/** Downloads are read-only and may repeat after a crash; submission deduplication keeps the message exactly once. */
export async function loadIssueImages(github: GitHubClient, repo: string, bodies: string[], limits: ImageLimits) {
  const images: ImageContent[] = [];
  const notes: string[] = [];
  let attempted = 0;
  for (const url of new Set(bodies.flatMap(issueImageUrls))) {
    if (attempted >= MAX_ISSUE_IMAGES) {
      notes.push(`${url}: skipped (limit of ${MAX_ISSUE_IMAGES} image downloads).`);
      continue;
    }
    attempted++;
    const result = await github.downloadIssueImage(repo, url);
    const image = result.ok ? await prepare(result.image.data, result.image.mimeType, limits) : undefined;
    if (image) {
      images.push({ type: "image", data: image.data, mimeType: image.mimeType });
      notes.push(`${url}: attached as image ${images.length}.`);
    } else notes.push(`${url}: skipped (${result.ok ? "image cannot be decoded or scaled to fit" : result.reason}).`);
  }
  return { images, notes };
}

export interface IssueText {
  url: string;
  text: string;
  truncated: boolean;
}

/** Like `loadIssueImages`, for text file attachments, within a total size budget across all of them. */
export async function loadIssueTexts(github: GitHubClient, repo: string, bodies: string[]) {
  const texts: IssueText[] = [];
  const notes: string[] = [];
  let attempted = 0;
  let budget = MAX_ISSUE_TEXT_TOTAL_BYTES;
  const overBudget = `total text limit of ${MAX_ISSUE_TEXT_TOTAL_BYTES / 1024} KiB reached`;

  for (const url of new Set(bodies.flatMap((text) => attachmentUrls(text, isIssueFileUrl)))) {
    if (attempted >= MAX_ISSUE_TEXTS) {
      notes.push(`${url}: skipped (limit of ${MAX_ISSUE_TEXTS} file downloads).`);
      continue;
    }
    if (budget === 0) {
      notes.push(`${url}: skipped (${overBudget}).`);
      continue;
    }
    attempted++;

    const result = await github.downloadIssueText(repo, url);
    if (!result.ok) {
      notes.push(`${url}: skipped (${result.reason}).`);
      continue;
    }

    const bytes = Buffer.from(result.text);
    const kept = truncateUtf8(bytes, budget);
    if (kept.length === 0) {
      notes.push(`${url}: skipped (${overBudget}).`);
      continue;
    }
    budget -= kept.length;

    const truncated = result.truncated || kept.length < bytes.length;
    texts.push({ url, text: kept.toString("utf8"), truncated });
    notes.push(`${url}: attached as text below${truncated ? `, truncated to its first ${kept.length} bytes` : ""}.`);
  }
  return { texts, notes };
}
