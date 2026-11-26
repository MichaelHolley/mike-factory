import type { AttachmentDownload } from "../contracts.ts";

// GitHub's upload limit for images; larger files are reported to the agent instead of stored.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

const secureUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : undefined;
  } catch {
    return undefined;
  }
};

/** Only GitHub's uploaded attachments, not arbitrary GitHub pages or user-controlled hosts. */
export const isAttachmentUrl = (value: string): boolean => {
  const url = secureUrl(value);
  if (!url) return false;

  if (url.hostname === "user-images.githubusercontent.com") return true;

  return (
    url.hostname === "github.com" &&
    (url.pathname.startsWith("/user-attachments/assets/") || url.pathname.startsWith("/user-attachments/files/"))
  );
};

// Public repos' images redirect to this S3 bucket, matched exactly because anyone can create S3 buckets.
const SIGNED_HOSTS = new Set(["github-production-user-asset-6210df.s3.amazonaws.com"]);

const isAllowedRedirect = (value: string) => {
  const host = secureUrl(value)?.hostname;
  if (!host) return false;

  return isAttachmentUrl(value) || host.endsWith(".githubusercontent.com") || SIGNED_HOSTS.has(host);
};

/**
 * Runs on the server, so the token never reaches the runner. Redirects are checked manually and never receive the
 * token. Never throws: skipped attachments and failures return `ok: false`.
 */
export async function downloadAttachment(
  value: string,
  authenticate: (signal: AbortSignal) => Promise<string>,
): Promise<AttachmentDownload> {
  if (!isAttachmentUrl(value)) return { ok: false, reason: "not an allowed GitHub attachment URL" };

  const limit = `file exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MiB size limit`;
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);

  try {
    const token = await authenticate(signal);
    let url = value;

    for (let redirects = 0; ; redirects++) {
      const response = await fetch(url, {
        redirect: "manual",
        signal,
        headers: {
          accept: "*/*",
          "user-agent": "mike-factory",
          ...(redirects === 0 && { authorization: `Bearer ${token}` }),
        },
      });

      try {
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location || redirects >= MAX_REDIRECTS) return { ok: false, reason: "too many or invalid redirects" };

          const next = new URL(location, url).href;
          if (!isAllowedRedirect(next))
            return {
              ok: false,
              reason: `redirect to ${new URL(next).origin} is not an allowed GitHub attachment host`,
            };

          url = next;
          continue;
        }

        if (!response.ok) return { ok: false, reason: `download returned HTTP ${response.status}` };

        if (Number(response.headers.get("content-length")) > MAX_ATTACHMENT_BYTES) return { ok: false, reason: limit };

        if (!response.body) return { ok: false, reason: "empty file" };

        const chunks: Uint8Array[] = [];
        let size = 0;

        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > MAX_ATTACHMENT_BYTES) return { ok: false, reason: limit };

          chunks.push(chunk);
        }

        if (size === 0) return { ok: false, reason: "empty file" };

        return { ok: true, bytes: Buffer.concat(chunks, size) };
      } finally {
        if (!response.body?.locked) await response.body?.cancel();
      }
    }
  } catch {
    // Authentication and fetch errors can contain credentials or signed URLs. Never put them in a prompt or log.
    return { ok: false, reason: signal.aborted ? "download timed out" : "download failed" };
  }
}
