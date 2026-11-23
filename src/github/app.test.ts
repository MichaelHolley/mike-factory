import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGitHubClient } from "./app.ts";
import { MAX_ATTACHMENT_BYTES } from "./attachments.ts";

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

describe("GitHub attachment downloads", () => {
  const file = "https://github.com/user-attachments/files/1/build.log";

  it.each([attachment, file, "https://user-images.githubusercontent.com/123/screenshot.png"])(
    "authenticates and downloads %s on the server",
    async (url) => {
      expect(await client.downloadAttachment("demo", url)).toEqual({ ok: true, bytes: png });
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

  it("reuses one read-only token across downloads, apart from the git token", async () => {
    await client.downloadAttachment("demo", attachment);
    await client.downloadAttachment("demo", file);
    await client.gitToken("demo");
    const mints = requests.mock.calls.filter(([input]) => String(input).endsWith("/access_tokens"));
    expect(mints.map(([, init]) => JSON.parse(init!.body as string).permissions)).toEqual([
      { contents: "read", issues: "read" },
      { contents: "write" },
    ]);
  });

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
    "https://objects.githubusercontent.com/x",
    "file:///etc/passwd",
    "not a url",
  ])("rejects %s before authentication or fetching", async (url) => {
    expect(await client.downloadAttachment("demo", url)).toMatchObject({ ok: false });
    expect(requests).not.toHaveBeenCalled();
  });

  it.each([
    [attachment, "https://private-user-images.githubusercontent.com/123/screenshot.png?jwt=signed"],
    [file, "https://objects.githubusercontent.com/github-production-repository-file-5c1aeb/1/2?X-Amz-Signature=s"],
  ])("follows the signed redirect of %s without forwarding credentials", async (url, signed) => {
    imageFetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: signed } }));
    expect(await client.downloadAttachment("demo", url)).toMatchObject({ ok: true });
    expect(imageFetch).toHaveBeenCalledTimes(2);
    expect(imageFetch.mock.calls[1]![0]).toBe(signed);
    expect(imageFetch.mock.calls[1]![1]!.headers).not.toHaveProperty("authorization");
  });

  it.each([
    "https://evil.test/x",
    "http://user-images.githubusercontent.com/x",
    "http://127.0.0.1/x",
    "https://objects.githubusercontent.com.evil.test/x",
  ])("does not follow a redirect to %s", async (location) => {
    imageFetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location } }));
    expect(await client.downloadAttachment("demo", attachment)).toEqual({
      ok: false,
      reason: "redirect is not an allowed GitHub attachment URL",
    });
    expect(imageFetch).toHaveBeenCalledTimes(1);
  });

  it("bounds redirect chains", async () => {
    imageFetch.mockImplementation(async () => new Response(null, { status: 302, headers: { location: attachment } }));
    expect(await client.downloadAttachment("demo", attachment)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("redirects"),
    });
    expect(imageFetch).toHaveBeenCalledTimes(4);
  });

  it("downloads any type, whatever the Content-Type says", async () => {
    const zip = Buffer.from("PK\x03\x04 archive");
    imageFetch.mockResolvedValueOnce(new Response(zip, { headers: { "content-type": "application/zip" } }));
    expect(await client.downloadAttachment("demo", file)).toEqual({ ok: true, bytes: zip });
  });

  it("rejects an oversized Content-Length without reading the body", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    imageFetch.mockResolvedValueOnce(
      new Response(body, { headers: { "content-length": String(MAX_ATTACHMENT_BYTES + 1) } }),
    );
    expect(await client.downloadAttachment("demo", file)).toEqual({
      ok: false,
      reason: "file exceeds the 10 MiB size limit",
    });
    expect(cancel).toHaveBeenCalled();
  });

  it("bounds streamed bytes even when Content-Length is missing or wrong", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_ATTACHMENT_BYTES));
        controller.enqueue(new Uint8Array(1));
      },
      cancel,
    });
    imageFetch.mockResolvedValueOnce(new Response(body, { headers: { "content-length": "1" } }));
    expect(await client.downloadAttachment("demo", file)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("size limit"),
    });
    expect(cancel).toHaveBeenCalled();
  });

  it("accepts a file of exactly the size limit", async () => {
    imageFetch.mockResolvedValueOnce(new Response(new Uint8Array(MAX_ATTACHMENT_BYTES)));
    const result = await client.downloadAttachment("demo", file);
    expect(result.ok && result.bytes.length).toBe(MAX_ATTACHMENT_BYTES);
  });

  it("skips empty files and HTTP failures", async () => {
    imageFetch.mockResolvedValueOnce(new Response(null));
    expect(await client.downloadAttachment("demo", file)).toEqual({ ok: false, reason: "empty file" });
    imageFetch.mockResolvedValueOnce(new Response("", { status: 200 }));
    expect(await client.downloadAttachment("demo", file)).toEqual({ ok: false, reason: "empty file" });
    imageFetch.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    expect(await client.downloadAttachment("demo", file)).toEqual({
      ok: false,
      reason: "download returned HTTP 404",
    });
  });

  it("does not leak fetch errors or credentials", async () => {
    imageFetch.mockRejectedValueOnce(new Error("secret installation-token signed-url"));
    expect(await client.downloadAttachment("demo", attachment)).toEqual({ ok: false, reason: "download failed" });
  });

  it("times out a stalled download", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    imageFetch.mockImplementationOnce(async (_url, init) => {
      init!.signal!.throwIfAborted();
      return imageResponse();
    });
    try {
      expect(await client.downloadAttachment("demo", attachment)).toEqual({
        ok: false,
        reason: "download timed out",
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
      expect(await client.downloadAttachment("demo", attachment)).toEqual({
        ok: false,
        reason: "download timed out",
      });
      expect(imageFetch).not.toHaveBeenCalled();
    } finally {
      timeout.mockRestore();
    }
  });
});
