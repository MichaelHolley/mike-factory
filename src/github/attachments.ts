import type { AttachmentDownload } from "../contracts.ts";
import { ATTACHMENT_LIMITS } from "../runStatus.ts";

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

/** Only GitHub issue attachments, not arbitrary GitHub pages or user-controlled hosts. */
const isImageUrl = (url: URL | undefined) =>
  !!url &&
  ((url.hostname === "github.com" && url.pathname.startsWith("/user-attachments/assets/")) ||
    url.hostname === "user-images.githubusercontent.com");

const isFileUrl = (url: URL | undefined) =>
  !!url && url.hostname === "github.com" && url.pathname.startsWith("/user-attachments/files/");

export const isAttachmentUrl = (value: string): boolean => {
  const url = secureUrl(value);
  return isImageUrl(url) || isFileUrl(url);
};

interface AttachmentKind {
  name: "image" | "file";
  accept: string;
  isAllowedRedirect: (url: string) => boolean;
}

const IMAGE: AttachmentKind = {
  name: "image",
  accept: "image/*",
  isAllowedRedirect: (url) =>
    isImageUrl(secureUrl(url)) || secureUrl(url)?.hostname === "private-user-images.githubusercontent.com",
};

// Checked against a live attachment: GitHub redirects file links to signed URLs on this host.
const FILE: AttachmentKind = {
  name: "file",
  accept: "*/*",
  isAllowedRedirect: (url) => secureUrl(url)?.hostname === "objects.githubusercontent.com",
};

/**
 * Runs on the server, so no credentials reach the runner. Redirects are checked manually and never receive the
 * installation token.
 */
export async function downloadAttachment(
  value: string,
  authenticate: (signal: AbortSignal) => Promise<string>,
): Promise<AttachmentDownload> {
  const url = secureUrl(value);
  let kind: AttachmentKind | undefined;
  if (isImageUrl(url)) kind = IMAGE;
  else if (isFileUrl(url)) kind = FILE;
  if (!kind) return { ok: false, reason: "not an allowed GitHub attachment URL" };

  const limit = `${kind.name} exceeds the ${ATTACHMENT_LIMITS.fileBytes / 1_000_000} MB size limit`;
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  try {
    const token = await authenticate(signal);
    let current = value;

    for (let redirects = 0; ; redirects++) {
      const response = await fetch(current, {
        redirect: "manual",
        signal,
        headers: {
          accept: kind.accept,
          "user-agent": "mike-factory",
          ...(redirects === 0 && { authorization: `Bearer ${token}` }),
        },
      });

      try {
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location || redirects >= MAX_REDIRECTS) return { ok: false, reason: "too many or invalid redirects" };

          const next = new URL(location, current).href;
          if (!kind.isAllowedRedirect(next))
            return { ok: false, reason: `redirect is not an allowed GitHub ${kind.name} URL` };

          current = next;
          continue;
        }

        if (!response.ok) return { ok: false, reason: `download returned HTTP ${response.status}` };
        if (Number(response.headers.get("content-length")) > ATTACHMENT_LIMITS.fileBytes)
          return { ok: false, reason: limit };
        if (!response.body) return { ok: false, reason: `empty ${kind.name}` };

        const chunks: Uint8Array[] = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > ATTACHMENT_LIMITS.fileBytes) return { ok: false, reason: limit };
          chunks.push(chunk);
        }

        if (size === 0) return { ok: false, reason: `empty ${kind.name}` };
        return { ok: true, bytes: Buffer.concat(chunks, size) };
      } finally {
        if (!response.body?.locked) await response.body?.cancel();
      }
    }
  } catch {
    // Authentication and fetch errors can contain credentials or signed URLs. Never put them in a prompt or log.
    return { ok: false, reason: signal.aborted ? `${kind.name} download timed out` : `${kind.name} download failed` };
  }
}
