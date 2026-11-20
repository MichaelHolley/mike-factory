import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGitHubClient } from "./app.ts";
import { MAX_ISSUE_IMAGE_BYTES, MAX_ISSUE_TEXT_BYTES } from "./attachments.ts";

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const attachment = "https://github.com/user-attachments/assets/screenshot";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
const imageResponse = () => new Response(png, { headers: { "content-type": "image/png; charset=binary" } });
const imageFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const requests = vi.fn<typeof fetch>();
let client: ReturnType<typeof createGitHubClient>;

beforeEach(() => {
  imageFetch.mockReset().mockImplementation(async () => imageResponse());
  requests.mockReset().mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "https://api.github.com/repos/owner/demo/installation") return Response.json({ id: 1 });
    if (url === "https://api.github.com/app/installations/1/access_tokens")
      return Response.json({
        token: "installation-token",
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: {},
      });
    return imageFetch(url, init);
  });
  vi.stubGlobal("fetch", requests);
  client = createGitHubClient({ appId: "1", privateKey, owner: "owner" });
});
afterEach(() => vi.unstubAllGlobals());

describe("GitHub issue image downloads", () => {
  it.each([attachment, "https://user-images.githubusercontent.com/123/screenshot.png"])(
    "authenticates and downloads %s on the server",
    async (url) => {
      expect(await client.downloadIssueImage("demo", url)).toEqual({
        ok: true,
        image: { mimeType: "image/png", data: png.toString("base64") },
      });
      expect(imageFetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          redirect: "manual",
          signal: expect.any(AbortSignal),
          headers: expect.objectContaining({ authorization: "Bearer installation-token" }),
        }),
      );
      const auth = requests.mock.calls.find(([input]) => String(input).endsWith("/access_tokens"));
      expect(JSON.parse(auth![1]!.body as string)).toEqual({
        repositories: ["demo"],
        permissions: { contents: "read", issues: "read" },
      });
    },
  );

  it.each([
    "https://example.com/image.png",
    "http://github.com/user-attachments/assets/x",
    "https://github.com/owner/repo/image.png",
    "https://github.com/user-attachments-evil/x",
    "https://github.com.evil.test/user-attachments/assets/x",
    "https://user-images.githubusercontent.com.evil.test/x",
    "https://github.com@evil.test/user-attachments/assets/x",
    "https://evil:secret@github.com/user-attachments/assets/x",
    "https://github.com:8443/user-attachments/assets/x",
    "https://private-user-images.githubusercontent.com/x",
    "file:///etc/passwd",
    "not a url",
  ])("rejects %s before authentication or fetching", async (url) => {
    expect(await client.downloadIssueImage("demo", url)).toMatchObject({ ok: false });
    expect(await client.downloadIssueText("demo", url)).toMatchObject({ ok: false });
    expect(requests).not.toHaveBeenCalled();
  });

  it.each([
    ["image", "https://github.com/user-attachments/files/1/build.log"],
    ["text", attachment],
    ["text", "https://user-images.githubusercontent.com/123/screenshot.png"],
  ] as const)("rejects a %s download of %s, which is the other kind", async (kind, url) => {
    const download = kind === "image" ? client.downloadIssueImage : client.downloadIssueText;
    expect(await download("demo", url)).toMatchObject({ ok: false });
    expect(requests).not.toHaveBeenCalled();
  });

  it("follows a signed GitHub image redirect without forwarding credentials", async () => {
    const signed = "https://private-user-images.githubusercontent.com/123/screenshot.png?jwt=signed";
    imageFetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: signed } }));
    expect(await client.downloadIssueImage("demo", attachment)).toMatchObject({ ok: true });
    expect(imageFetch).toHaveBeenCalledTimes(2);
    expect(imageFetch.mock.calls[1]![0]).toBe(signed);
    expect(imageFetch.mock.calls[1]![1]!.headers).not.toHaveProperty("authorization");
  });

  it.each([
    "https://evil.test/x",
    "http://user-images.githubusercontent.com/x",
    "http://127.0.0.1/x",
    "https://objects.githubusercontent.com/x",
  ])("does not follow a redirect to %s", async (location) => {
    imageFetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location } }));
    expect(await client.downloadIssueImage("demo", attachment)).toEqual({
      ok: false,
      reason: "redirect is not an allowed GitHub image URL",
    });
    expect(imageFetch).toHaveBeenCalledTimes(1);
  });

  it("bounds redirect chains", async () => {
    imageFetch.mockImplementation(async () => new Response(null, { status: 302, headers: { location: attachment } }));
    expect(await client.downloadIssueImage("demo", attachment)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("redirects"),
    });
    expect(imageFetch).toHaveBeenCalledTimes(4);
  });

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
  it.each(fixtures.map(([mimeType, bytes], i) => [mimeType, bytes, fixtures[(i + 1) % fixtures.length]![0]]))(
    "reads a %s from its bytes, whatever the Content-Type",
    async (mimeType, bytes, contentType) => {
      imageFetch.mockResolvedValueOnce(new Response(bytes, { headers: { "content-type": contentType } }));
      expect(await client.downloadIssueImage("demo", attachment)).toMatchObject({ ok: true, image: { mimeType } });
    },
  );

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
  const pngBomb = Buffer.from(png);
  pngBomb.writeUInt32BE(huge, 16);
  pngBomb.writeUInt32BE(huge, 20);

  it.each([
    ["PNG", pngBomb],
    ["GIF screen", gif(huge, 1)],
    ["GIF frame larger than its screen", gif(1, huge)],
    ["WebP canvas", webp(vp8x(huge))],
    ["WebP bitstream larger than its canvas", webp(vp8x(16), vp8l(huge))],
    ["animated WebP frame larger than its canvas", webp(vp8x(16), anmf(16, vp8l(huge)))],
    ["JPEG", jpeg(huge, [0xff, 0xe0, 0, 4, 0, 0])],
  ])("skips a %s declaring too many pixels, before decoding it", async (_, bytes) => {
    imageFetch.mockResolvedValueOnce(new Response(bytes, { headers: { "content-type": "image/png" } }));
    expect(await client.downloadIssueImage("demo", attachment)).toEqual({
      ok: false,
      reason: "image exceeds the 50 megapixel limit",
    });
  });

  it.each([
    ["SVG", Buffer.from("<svg/>")],
    ["JPEG whose length-less marker hides its real frame behind a decoy", jpegDecoy],
    ["truncated WebP", webp(vp8x(16)).subarray(0, 25)],
  ])("skips a %s as unsupported", async (_, bytes) => {
    imageFetch.mockResolvedValueOnce(new Response(bytes, { headers: { "content-type": "image/png" } }));
    expect(await client.downloadIssueImage("demo", attachment)).toEqual({
      ok: false,
      reason: "not a PNG, JPEG, GIF or WebP image",
    });
  });

  it.each(["image/svg+xml", "text/html", "application/octet-stream", ""])(
    "skips unsupported MIME type %s",
    async (mimeType) => {
      imageFetch.mockResolvedValueOnce(new Response(png, { headers: { "content-type": mimeType } }));
      expect(await client.downloadIssueImage("demo", attachment)).toEqual({
        ok: false,
        reason: "unsupported image MIME type",
      });
    },
  );

  it("rejects an oversized Content-Length without reading the body", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    imageFetch.mockResolvedValueOnce(
      new Response(body, {
        headers: { "content-type": "image/png", "content-length": String(MAX_ISSUE_IMAGE_BYTES + 1) },
      }),
    );
    expect(await client.downloadIssueImage("demo", attachment)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("size limit"),
    });
    expect(cancel).toHaveBeenCalled();
  });

  it("bounds streamed bytes even when Content-Length is missing or wrong", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_ISSUE_IMAGE_BYTES));
        controller.enqueue(new Uint8Array(1));
      },
      cancel,
    });
    imageFetch.mockResolvedValueOnce(
      new Response(body, { headers: { "content-type": "image/png", "content-length": "1" } }),
    );
    expect(await client.downloadIssueImage("demo", attachment)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("size limit"),
    });
    expect(cancel).toHaveBeenCalled();
  });

  it("accepts an image of exactly the size limit", async () => {
    imageFetch.mockResolvedValueOnce(
      new Response(Buffer.concat([png], MAX_ISSUE_IMAGE_BYTES), { headers: { "content-type": "image/png" } }),
    );
    const result = await client.downloadIssueImage("demo", attachment);
    expect(result.ok && Buffer.from(result.image.data, "base64").length).toBe(MAX_ISSUE_IMAGE_BYTES);
  });

  it("skips empty images and HTTP failures", async () => {
    imageFetch.mockResolvedValueOnce(new Response(null, { headers: { "content-type": "image/png" } }));
    expect(await client.downloadIssueImage("demo", attachment)).toEqual({ ok: false, reason: "empty image" });
    imageFetch.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    expect(await client.downloadIssueImage("demo", attachment)).toEqual({
      ok: false,
      reason: "download returned HTTP 404",
    });
  });

  it("does not leak fetch errors or credentials", async () => {
    imageFetch.mockRejectedValueOnce(new Error("secret installation-token signed-url"));
    expect(await client.downloadIssueImage("demo", attachment)).toEqual({ ok: false, reason: "image download failed" });
  });

  it("times out a stalled download", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    imageFetch.mockImplementationOnce(async (_url, init) => {
      init!.signal!.throwIfAborted();
      return imageResponse();
    });
    try {
      expect(await client.downloadIssueImage("demo", attachment)).toEqual({
        ok: false,
        reason: "image download timed out",
      });
      expect(timeout).toHaveBeenCalledWith(15_000);
    } finally {
      timeout.mockRestore();
    }
  });

  it("times out a stalled token request", async () => {
    await client.gitToken("demo");
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    requests.mockImplementationOnce(
      (_input, init) =>
        new Promise((_, reject) => {
          init!.signal!.addEventListener("abort", () => reject(new Error("aborted")));
          deadline.abort();
        }),
    );
    try {
      expect(await client.downloadIssueImage("demo", attachment)).toEqual({
        ok: false,
        reason: "image download timed out",
      });
      expect(imageFetch).not.toHaveBeenCalled();
    } finally {
      timeout.mockRestore();
    }
  });
});

describe("GitHub issue text downloads", () => {
  const file = "https://github.com/user-attachments/files/1/build.log";
  const textResponse = (body: ConstructorParameters<typeof Response>[0], contentType = "text/plain") =>
    new Response(body, { headers: { "content-type": contentType } });

  it("follows the signed file redirect without forwarding credentials", async () => {
    const signed =
      "https://objects.githubusercontent.com/github-production-repository-file-5c1aeb/1/2?X-Amz-Signature=s";
    imageFetch
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: signed } }))
      .mockResolvedValueOnce(textResponse("build failed\n"));
    expect(await client.downloadIssueText("demo", file)).toEqual({
      ok: true,
      text: "build failed\n",
      truncated: false,
    });
    expect(imageFetch.mock.calls[0]![1]!.headers).toMatchObject({ authorization: "Bearer installation-token" });
    expect(imageFetch.mock.calls[1]![0]).toBe(signed);
    expect(imageFetch.mock.calls[1]![1]!.headers).not.toHaveProperty("authorization");
  });

  it.each([
    "https://private-user-images.githubusercontent.com/x",
    "https://github.com/user-attachments/files/2/other.log",
    "https://objects.githubusercontent.com.evil.test/x",
  ])("does not follow a file redirect to %s", async (location) => {
    imageFetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location } }));
    expect(await client.downloadIssueText("demo", file)).toEqual({
      ok: false,
      reason: "redirect is not an allowed GitHub file URL",
    });
  });

  it("reads text from its bytes, whatever the Content-Type", async () => {
    imageFetch.mockResolvedValueOnce(textResponse('{"ü": 1}', "application/octet-stream"));
    expect(await client.downloadIssueText("demo", file)).toMatchObject({ ok: true, text: '{"ü": 1}' });
  });

  it.each([
    ["NUL bytes", Buffer.from("text\0more")],
    ["invalid UTF-8", Buffer.from([0x61, 0xff, 0x62])],
    ["a PNG", png],
  ])("skips a file with %s, even as text/plain", async (_, bytes) => {
    imageFetch.mockResolvedValueOnce(textResponse(bytes));
    expect(await client.downloadIssueText("demo", file)).toEqual({ ok: false, reason: "not a UTF-8 text file" });
  });

  it("skips an empty file", async () => {
    imageFetch.mockResolvedValueOnce(textResponse(""));
    expect(await client.downloadIssueText("demo", file)).toEqual({ ok: false, reason: "empty file" });
  });

  it("keeps a file of exactly the size limit whole", async () => {
    imageFetch.mockResolvedValueOnce(textResponse("a".repeat(MAX_ISSUE_TEXT_BYTES)));
    expect(await client.downloadIssueText("demo", file)).toMatchObject({ ok: true, truncated: false });
  });

  it("stops reading at the size limit and cuts at a character boundary", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start: (controller) => controller.enqueue(Buffer.from(`${"a".repeat(MAX_ISSUE_TEXT_BYTES - 1)}é`)),
      pull: (controller) => controller.enqueue(Buffer.from("é".repeat(1024))),
      cancel,
    });
    imageFetch.mockResolvedValueOnce(textResponse(body));
    expect(await client.downloadIssueText("demo", file)).toEqual({
      ok: true,
      text: "a".repeat(MAX_ISSUE_TEXT_BYTES - 1),
      truncated: true,
    });
    expect(cancel).toHaveBeenCalled();
  });
});
