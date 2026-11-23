import { DEFAULT_IMAGE_LIMITS, type ImageProcessor } from "@earendil-works/pi-durable/tools";
import { describe, expect, it, vi } from "vitest";
import { PNG_BYTES } from "../../test/fakes/github.ts";
import { checkedImages } from "./images.ts";

const png = PNG_BYTES;

describe("checkedImages", () => {
  const passThrough = () => {
    const prepare = vi.fn<ImageProcessor["prepare"]>(async (_bytes, mimeType) => ({ data: "", mimeType }));
    return { images: checkedImages(async () => ({ prepare })), prepare };
  };

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
    Buffer.concat([
      Buffer.from([0xff, 0xd8, ...prefix, 0xff, 0xc0, 0, 17, 8]),
      be16(size),
      be16(size),
      Buffer.alloc(10),
    ]);
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
  const bmp = (size: number) => {
    const header = Buffer.alloc(54);
    header.write("BM");
    header.writeUInt32LE(54, 10);
    header.writeUInt32LE(40, 14);
    header.writeInt32LE(size, 18);
    header.writeInt32LE(-size, 22);
    return header;
  };
  const pngBomb = Buffer.from(png);
  pngBomb.writeUInt32BE(huge, 16);
  pngBomb.writeUInt32BE(huge, 20);

  it.each(fixtures)("decodes a %s", async (mimeType, bytes) => {
    const { images, prepare } = passThrough();
    expect(await images.prepare(bytes, mimeType, DEFAULT_IMAGE_LIMITS)).toEqual({ data: "", mimeType });
    expect(prepare).toHaveBeenCalledOnce();
  });

  it.each([
    ["PNG declaring too many pixels", "image/png", pngBomb],
    ["GIF screen declaring too many pixels", "image/gif", gif(huge, 1)],
    ["GIF frame larger than its screen", "image/gif", gif(1, huge)],
    ["WebP canvas declaring too many pixels", "image/webp", webp(vp8x(huge))],
    ["WebP bitstream larger than its canvas", "image/webp", webp(vp8x(16), vp8l(huge))],
    ["animated WebP frame larger than its canvas", "image/webp", webp(vp8x(16), anmf(16, vp8l(huge)))],
    ["JPEG declaring too many pixels", "image/jpeg", jpeg(huge, [0xff, 0xe0, 0, 4, 0, 0])],
    ["BMP declaring too many pixels", "image/bmp", bmp(huge)],
    ["JPEG whose length-less marker hides its real frame behind a decoy", "image/jpeg", jpegDecoy],
    ["truncated WebP", "image/webp", webp(vp8x(16)).subarray(0, 25)],
    ["PNG read as a JPEG", "image/jpeg", png],
  ])("refuses a %s before decoding it", async (_, mimeType, bytes) => {
    const { images, prepare } = passThrough();
    expect(await images.prepare(bytes, mimeType, DEFAULT_IMAGE_LIMITS)).toBeUndefined();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("scales a large image down to the model's limits", async () => {
    const image = await checkedImages().prepare(png, "image/png", {
      ...DEFAULT_IMAGE_LIMITS,
      maxWidth: 1,
      maxHeight: 1,
    });
    const header = Buffer.from(image!.data, "base64");
    expect([header.readUInt32BE(16), header.readUInt32BE(20)]).toEqual([1, 1]);
  });
});
