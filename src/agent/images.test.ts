import { DEFAULT_IMAGE_LIMITS } from "@earendil-works/pi-durable/tools";
import { describe, expect, it } from "vitest";
import { PNG } from "../../test/fakes/github.ts";
import { guardedImages, unsafeImage } from "./images.ts";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

const fixtures = [
  ["image/png", png],
  ["image/jpeg", Buffer.from("/9j/4AAQSkZJRgABAgAAAQABAAD/wAARCAACAAIDAREAAhEBAxEB", "base64")],
  ["image/gif", Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64")],
  [
    "image/webp",
    Buffer.from(
      "UklGRm4AAABXRUJQVlA4TGIAAAAvAUAAEM1VICICHogEAAAAAIABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAQAAER4IAEAAAAAAOcfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAJAPAA==",
      "base64",
    ),
  ],
] as const;

const le = (value: number, length: number) => {
  const bytes = Buffer.alloc(length);
  bytes.writeUIntLE(value, 0, length);
  return bytes;
};
const be16 = (value: number) => Buffer.from([value >> 8, value & 0xff]);
const gif = (screen: number, frame: number) =>
  Buffer.concat([
    Buffer.from("GIF89a"),
    le(screen, 2),
    le(screen, 2),
    Buffer.from([0, 0, 0, 0x2c, 0, 0, 0, 0]),
    le(frame, 2),
    le(frame, 2),
    Buffer.from([0, 2, 0, 0x3b]),
  ]);
const chunk = (type: string, body: Buffer) =>
  Buffer.concat([Buffer.from(type), le(body.length, 4), body, Buffer.alloc(body.length % 2)]);
const vp8x = (size: number) => chunk("VP8X", Buffer.concat([Buffer.alloc(4), le(size - 1, 3), le(size - 1, 3)]));
const vp8l = (size: number) => chunk("VP8L", Buffer.concat([Buffer.from([0x2f]), le((size - 1) * (1 + 2 ** 14), 4)]));
const anmf = (size: number, frame: Buffer) =>
  chunk("ANMF", Buffer.concat([Buffer.alloc(6), le(size - 1, 3), le(size - 1, 3), Buffer.alloc(4), frame]));
const webp = (...chunks: Buffer[]) => {
  const body = Buffer.concat([Buffer.from("WEBP"), ...chunks]);
  return Buffer.concat([Buffer.from("RIFF"), le(body.length, 4), body]);
};
const jpeg = (size: number, prefix: number[]) =>
  Buffer.concat([Buffer.from([0xff, 0xd8, ...prefix, 0xff, 0xc0, 0, 17, 8]), be16(size), be16(size), Buffer.alloc(10)]);
const huge = 16_000;
// FF 00 has no length: a parser reading FF C0 as one jumps to the decoy frame the decoder never reaches.
const jpegHead = jpeg(huge, [0xff, 0x00]);
const jpegDecoy = Buffer.concat([
  jpegHead,
  Buffer.from([0xff, 0xef]),
  be16(0xffc4 - jpegHead.length - 2),
  Buffer.alloc(0xffc4 - jpegHead.length - 4),
  jpeg(16, []).subarray(2),
]);
const pngBomb = Buffer.from(png);
pngBomb.writeUInt32BE(huge, 16);
pngBomb.writeUInt32BE(huge, 20);

describe("images safe to decode", () => {
  it.each(fixtures)("takes a %s", (_, bytes) => {
    expect(unsafeImage(bytes)).toBeUndefined();
  });

  it.each([
    ["PNG", pngBomb],
    ["GIF screen", gif(huge, 1)],
    ["GIF frame larger than its screen", gif(1, huge)],
    ["WebP canvas", webp(vp8x(huge))],
    ["WebP bitstream larger than its canvas", webp(vp8x(16), vp8l(huge))],
    ["animated WebP frame larger than its canvas", webp(vp8x(16), anmf(16, vp8l(huge)))],
    ["JPEG", jpeg(huge, [0xff, 0xe0, 0, 4, 0, 0])],
  ])("refuses a %s declaring too many pixels", (_, bytes) => {
    expect(unsafeImage(bytes)).toBe("image exceeds the 50 megapixel limit");
  });

  it.each([
    ["SVG", Buffer.from("<svg/>")],
    ["JPEG whose length-less marker hides its real frame behind a decoy", jpegDecoy],
    ["truncated WebP", webp(vp8x(16)).subarray(0, 25)],
  ])("refuses a %s as unsupported", (_, bytes) => {
    expect(unsafeImage(bytes)).toBe("not a PNG, JPEG, GIF or WebP image");
  });

  it("prepares a safe image for the model and refuses an unsafe one before decoding it", async () => {
    expect(await guardedImages.prepare(PNG, "image/png", DEFAULT_IMAGE_LIMITS)).toMatchObject({
      mimeType: "image/png",
    });
    expect(await guardedImages.prepare(pngBomb, "image/png", DEFAULT_IMAGE_LIMITS)).toBeUndefined();
  });
});
