import type { IssueImageDownload } from "../contracts.ts";

// GitHub's upload limit for images; the pipeline scales them down to the model's limits.
export const MAX_ISSUE_IMAGE_BYTES = 10 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
// Decoding takes 4 bytes per pixel, so a small file declaring huge dimensions would take gigabytes of memory.
const MAX_IMAGE_PIXELS = 50_000_000;

type Size = { width: number; height: number };

const larger = (a: Size, b: Size): Size => ({
  width: Math.max(a.width, b.width),
  height: Math.max(a.height, b.height),
});

const colorTableBytes = (flags: number) => (flags & 0x80 ? 3 << ((flags & 7) + 1) : 0);

/** The screen and every frame of a GIF: the decoder sizes its buffer by the first frame, which may exceed the screen. */
function gifSize(bytes: Buffer): Size | undefined {
  let size = { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  let offset = 13 + colorTableBytes(bytes[10]!);

  const skipSubBlocks = () => {
    while (offset < bytes.length && bytes[offset] !== 0) offset += bytes[offset]! + 1;
    offset++;
  };

  while (offset < bytes.length && bytes[offset] !== 0x3b) {
    if (bytes[offset] === 0x21) {
      offset += 2;
      skipSubBlocks();
    } else if (bytes[offset] === 0x2c) {
      size = larger(size, { width: bytes.readUInt16LE(offset + 5), height: bytes.readUInt16LE(offset + 7) });
      // The descriptor, its local color table and the LZW code size byte precede the image data.
      offset += 10 + colorTableBytes(bytes[offset + 9]!) + 1;
      skipSubBlocks();
    } else return undefined;
  }
  return size;
}

/** The canvas and every bitstream in WebP chunks: the decoder trusts each bitstream's size over the VP8X canvas. */
function webpSize(bytes: Buffer, start: number, end: number): Size | undefined {
  let size: Size | undefined;
  for (let offset = start; offset < end;) {
    const type = bytes.toString("latin1", offset, offset + 4);
    const body = offset + 8;
    const next = body + bytes.readUInt32LE(offset + 4);
    if (next > end) return undefined;

    let found: Size | undefined;
    if (type === "VP8X" || type === "ANMF") {
      const at = type === "VP8X" ? body + 4 : body + 6;
      found = { width: bytes.readUIntLE(at, 3) + 1, height: bytes.readUIntLE(at + 3, 3) + 1 };
      if (type === "ANMF") {
        const frame = webpSize(bytes, body + 16, next);
        if (!frame) return undefined;
        found = larger(found, frame);
      }
    } else if (type === "VP8 ") {
      found = { width: bytes.readUInt16LE(body + 6) & 0x3fff, height: bytes.readUInt16LE(body + 8) & 0x3fff };
    } else if (type === "VP8L") {
      const bits = bytes.readUInt32LE(body + 1);
      found = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (found) size = size ? larger(size, found) : found;

    offset = next + (next % 2);
  }
  return size;
}

/** The first JPEG frame's size, unless markers the decoder would read differently come before it. */
function jpegSize(bytes: Buffer): Size | undefined {
  for (let offset = 2; offset + 9 <= bytes.length;) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) offset++;
    // Markers without a length field; the decoder skips them where this would read a length.
    else if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) return undefined;
    // SOF0 to SOF15, except DHT (C4), JPG (C8) and DAC (CC), which share the range.
    else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    else offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  return undefined;
}

/**
 * The format and largest size an image declares, read without decoding it; the bytes decide, not Content-Type.
 * `undefined` for other formats and for structures the decoder could read differently.
 */
function imageHeader(bytes: Buffer): (Size & { mimeType: string }) | undefined {
  const ascii = (offset: number, text: string) => bytes.toString("latin1", offset, offset + text.length) === text;
  const as = (mimeType: string, size: Size | undefined) => size && { mimeType, ...size };
  try {
    if (ascii(0, "\x89PNG\r\n\x1a\n") && ascii(12, "IHDR"))
      return as("image/png", { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
    if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) return as("image/gif", gifSize(bytes));
    if (ascii(0, "RIFF") && ascii(8, "WEBP")) return as("image/webp", webpSize(bytes, 12, bytes.length));
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return as("image/jpeg", jpegSize(bytes));
    return undefined;
  } catch {
    // A field past the end of a truncated file.
    return undefined;
  }
}

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
    ((url.hostname === "github.com" && url.pathname.startsWith("/user-attachments/assets/")) ||
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

        const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
        if (!IMAGE_MIME_TYPES.has(contentType)) return { ok: false, reason: "unsupported image MIME type" };
        if (Number(response.headers.get("content-length")) > MAX_ISSUE_IMAGE_BYTES)
          return { ok: false, reason: "image exceeds the 10 MiB size limit" };
        if (!response.body) return { ok: false, reason: "empty image" };

        const chunks: Uint8Array[] = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > MAX_ISSUE_IMAGE_BYTES) return { ok: false, reason: "image exceeds the 10 MiB size limit" };
          chunks.push(chunk);
        }

        const bytes = Buffer.concat(chunks, size);
        const header = imageHeader(bytes);
        if (!header) return { ok: false, reason: "not a PNG, JPEG, GIF or WebP image" };
        if (header.width * header.height > MAX_IMAGE_PIXELS)
          return { ok: false, reason: "image exceeds the 50 megapixel limit" };

        return { ok: true, image: { mimeType: header.mimeType, data: bytes.toString("base64") } };
      } finally {
        if (!response.body?.locked) await response.body?.cancel();
      }
    }
  } catch {
    // Authentication and fetch errors can contain credentials or signed URLs. Never put them in a prompt or log.
    return { ok: false, reason: signal.aborted ? "image download timed out" : "image download failed" };
  }
}
