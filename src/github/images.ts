import type { IssueImageDownload } from "../contracts.ts";

export const MAX_ISSUE_IMAGE_BYTES = 5 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const secureUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : undefined;
  } catch {
    return undefined;
  }
};

/** Only GitHub issue attachments, not arbitrary GitHub pages or user-controlled hosts. */
export const isIssueImageUrl = (value: string): boolean => {
  const url = secureUrl(value);
  return (
    !!url &&
    ((url.hostname === "github.com" && url.pathname.startsWith("/user-attachments/")) ||
      url.hostname === "user-images.githubusercontent.com")
  );
};

const isImageRedirectUrl = (value: string) =>
  isIssueImageUrl(value) || secureUrl(value)?.hostname === "private-user-images.githubusercontent.com";

/** Runs on the server. Redirects are checked manually and never receive the installation token. */
export async function downloadIssueImage(
  value: string,
  authenticate: () => Promise<string>,
): Promise<IssueImageDownload> {
  if (!isIssueImageUrl(value)) return { ok: false, reason: "not an allowed GitHub attachment URL" };
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  try {
    const token = await authenticate();
    let url = value;
    for (let redirects = 0; ; redirects++) {
      const response = await fetch(url, {
        redirect: "manual",
        signal,
        headers: {
          accept: [...IMAGE_MIME_TYPES].join(", "),
          "user-agent": "mike-factory",
          ...(redirects === 0 && { authorization: `Bearer ${token}` }),
        },
      });
      try {
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location || redirects >= MAX_REDIRECTS) return { ok: false, reason: "too many or invalid redirects" };
          const next = new URL(location, url).href;
          if (!isImageRedirectUrl(next)) return { ok: false, reason: "redirect is not an allowed GitHub image URL" };
          url = next;
          continue;
        }
        if (!response.ok) return { ok: false, reason: `download returned HTTP ${response.status}` };
        const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
        if (!IMAGE_MIME_TYPES.has(mimeType)) return { ok: false, reason: "unsupported image MIME type" };
        if (Number(response.headers.get("content-length")) > MAX_ISSUE_IMAGE_BYTES)
          return { ok: false, reason: "image exceeds the 5 MiB size limit" };
        if (!response.body) return { ok: false, reason: "empty image" };
        const chunks: Uint8Array[] = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > MAX_ISSUE_IMAGE_BYTES) return { ok: false, reason: "image exceeds the 5 MiB size limit" };
          chunks.push(chunk);
        }
        if (size === 0) return { ok: false, reason: "empty image" };
        return { ok: true, image: { mimeType, data: Buffer.concat(chunks, size).toString("base64") } };
      } finally {
        if (!response.body?.locked) await response.body?.cancel();
      }
    }
  } catch {
    // Authentication and fetch errors can contain credentials or signed URLs. Never put them in a prompt or log.
    return { ok: false, reason: signal.aborted ? "image download timed out" : "image download failed" };
  }
}
