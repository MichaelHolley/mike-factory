import type { ImageContent } from "@earendil-works/pi-ai";
import type { GitHubClient } from "../../contracts.ts";
import { isIssueImageUrl } from "../../github/images.ts";

export const MAX_ISSUE_IMAGES = 5;

const decodeEntities = (value: string) =>
  value.replace(/&(?:amp|quot|apos|lt|gt|#(\d+)|#x([\da-f]+));/gi, (entity, decimal, hex) => {
    if (decimal || hex) {
      const code = Number.parseInt(decimal ?? hex, decimal ? 10 : 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return (
      ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" } as Record<string, string>)[
        entity.toLowerCase()
      ] ?? entity
    );
  });

/** Inline Markdown image destinations and HTML img src attributes, in document order. */
export function issueImageUrls(text: string): string[] {
  const urls: string[] = [];
  const images =
    /!\[(?:\\.|[^\]\\])*\]\(\s*(?:<([^>\r\n]+)>|((?:\\.|[^\s)\\])+))[^\r\n)]*\)|<img\b(?:[^'"<>]|"[^"]*"|'[^']*')*>/gi;
  for (const match of text.matchAll(images)) {
    if (match[0].startsWith("!")) {
      urls.push(decodeEntities((match[1] ?? match[2]!).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, "$1")));
    } else {
      // Parse attributes so data-src, alt text and other quoted values cannot masquerade as src.
      const attributes = /([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      for (const attribute of match[0].slice(4, -1).matchAll(attributes)) {
        if (attribute[1]?.toLowerCase() !== "src") continue;
        const src = attribute[2] ?? attribute[3] ?? attribute[4];
        if (src) urls.push(decodeEntities(src));
        break;
      }
    }
  }
  return urls;
}

/** Downloads are read-only and may repeat after a crash; submission deduplication keeps the message exactly once. */
export async function loadIssueImages(github: GitHubClient, repo: string, bodies: string[]) {
  const images: ImageContent[] = [];
  const notes: string[] = [];
  let attempted = 0;
  for (const url of new Set(bodies.flatMap(issueImageUrls))) {
    if (!isIssueImageUrl(url)) {
      notes.push(`${url}: skipped (not an allowed GitHub attachment URL).`);
      continue;
    }
    if (attempted >= MAX_ISSUE_IMAGES) {
      notes.push(`${url}: skipped (limit of ${MAX_ISSUE_IMAGES} image downloads).`);
      continue;
    }
    attempted++;
    try {
      const result = await github.downloadIssueImage(repo, url);
      if (result.ok) {
        images.push({ type: "image", ...result.image });
        notes.push(`${url}: attached as image ${images.length}.`);
      } else notes.push(`${url}: skipped (${result.reason}).`);
    } catch {
      notes.push(`${url}: skipped (image download failed).`);
    }
  }
  return { images, notes };
}
