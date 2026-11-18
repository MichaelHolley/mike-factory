import type { ImageContent } from "@earendil-works/pi-ai";
import type { GitHubClient } from "../../contracts.ts";

export const MAX_ISSUE_IMAGES = 5;

/** GitHub's pasted attachment URLs, whether in Markdown, HTML or plain text. */
export const issueImageUrls = (text: string): string[] =>
  text.match(/https:\/\/(?:github\.com\/user-attachments\/|user-images\.githubusercontent\.com\/)[^\s)"'<>]+/gi) ?? [];

/** Downloads are read-only and may repeat after a crash; submission deduplication keeps the message exactly once. */
export async function loadIssueImages(github: GitHubClient, repo: string, bodies: string[]) {
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
    if (result.ok) {
      images.push({ type: "image", ...result.image });
      notes.push(`${url}: attached as image ${images.length}.`);
    } else notes.push(`${url}: skipped (${result.reason}).`);
  }
  return { images, notes };
}
