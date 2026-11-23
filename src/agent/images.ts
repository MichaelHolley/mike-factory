import { createNodePhotonImages } from "@earendil-works/pi-durable/images/node";
import type { ImageProcessor } from "@earendil-works/pi-durable/tools";

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

/** Why `bytes` aren't an image that is safe to decode, judged by the format and size they declare; undefined when they are. */
export function unsafeImage(bytes: Uint8Array): string | undefined {
  const header = imageHeader(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  if (!header) return "not a PNG, JPEG, GIF or WebP image";
  if (header.width * header.height > MAX_IMAGE_PIXELS) return "image exceeds the 50 megapixel limit";
  return undefined;
}

let photon: Promise<ImageProcessor> | undefined;

/** Photon, started on first use, refusing any image `unsafeImage` rejects before it is decoded. */
export const guardedImages: ImageProcessor = {
  async prepare(bytes, mimeType, limits) {
    if (unsafeImage(bytes)) return undefined;
    // A pooled Buffer's memory cannot be transferred to Photon's worker thread; a plain copy can.
    return (await (photon ??= createNodePhotonImages())).prepare(Uint8Array.from(bytes), mimeType, limits);
  },
};
