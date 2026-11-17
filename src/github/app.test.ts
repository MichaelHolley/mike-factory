import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGitHubClient } from "./app.ts";
import { MAX_ISSUE_IMAGE_BYTES } from "./images.ts";

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
      expect(JSON.parse(auth![1]!.body as string)).toMatchObject({ repositories: ["demo"] });
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

  it.each(["https://evil.test/x", "http://user-images.githubusercontent.com/x", "http://127.0.0.1/x"])(
    "does not follow a redirect to %s",
    async (location) => {
      imageFetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location } }));
      expect(await client.downloadIssueImage("demo", attachment)).toEqual({
        ok: false,
        reason: "redirect is not an allowed GitHub image URL",
      });
      expect(imageFetch).toHaveBeenCalledTimes(1);
    },
  );

  it("bounds redirect chains", async () => {
    imageFetch.mockImplementation(async () => new Response(null, { status: 302, headers: { location: attachment } }));
    expect(await client.downloadIssueImage("demo", attachment)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("redirects"),
    });
    expect(imageFetch).toHaveBeenCalledTimes(4);
  });

  it.each(["image/png", "image/jpeg", "image/gif", "image/webp"])("allows %s", async (mimeType) => {
    imageFetch.mockResolvedValueOnce(new Response(png, { headers: { "content-type": mimeType } }));
    expect(await client.downloadIssueImage("demo", attachment)).toMatchObject({ ok: true, image: { mimeType } });
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

  it("accepts an image exactly at the size limit", async () => {
    imageFetch.mockResolvedValueOnce(
      new Response(new Uint8Array(MAX_ISSUE_IMAGE_BYTES), { headers: { "content-type": "image/png" } }),
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
});
