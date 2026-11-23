import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Attachment } from "./runStatus.ts";

const REPO_NAME = /^(?!\.{1,2}$)[\w.-]+$/;
const FILE_ID = /^[0-9a-f]{64}$/;
const MAX_NAME_CHARS = 200;

// Raster formats only: an SVG can carry script, so it is served as a download like any other file.
const IMAGE_SIGNATURES: { type: string; offset: number; bytes: number[] }[] = [
  { type: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { type: "image/gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { type: "image/webp", offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  { type: "image/avif", offset: 4, bytes: [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66] },
];

export const isRepoName = (repo: string) => REPO_NAME.test(repo);

/** The image type `bytes` start with, or `application/octet-stream` for anything a browser shouldn't render inline. */
export const servedType = (bytes: Uint8Array) =>
  IMAGE_SIGNATURES.find(({ offset, bytes: signature }) => signature.every((byte, i) => bytes[offset + i] === byte))
    ?.type ?? "application/octet-stream";

/** A file name safe to show and to use as one path segment: no folders, control characters or dot-only names. */
export const cleanName = (name: string) => {
  const clean = name
    .split(/[/\\]/)
    .at(-1)!
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim()
    .slice(0, MAX_NAME_CHARS);
  return /^\.*$/.test(clean) ? "file" : clean;
};

export type Uploads = {
  /** Stores `file` under the issue, named by its content's SHA-256, so storing it again changes nothing. */
  save(repo: string, issue: number, file: File): Promise<Attachment>;
  /** The stored file's bytes, or undefined when there is none. */
  read(repo: string, issue: number, id: string): Promise<Buffer | undefined>;
};

/** Owner uploads, kept in `dir` by repo and issue, outside anything the runner can write. */
export function createUploads(dir: string): Uploads {
  const pathOf = (repo: string, issue: number, id: string) => {
    if (!isRepoName(repo) || !Number.isInteger(issue) || !FILE_ID.test(id)) return undefined;
    return join(dir, repo, String(issue), id);
  };

  return {
    async save(repo, issue, file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const id = createHash("sha256").update(bytes).digest("hex");
      const path = pathOf(repo, issue, id);
      if (!path) throw new Error(`invalid upload location ${repo}#${issue}`);

      const stored = await stat(path).catch(() => undefined);
      if (!stored) {
        await mkdir(join(path, ".."), { recursive: true });

        // Renamed into place, so a crash mid-write never leaves a partial file under the final name.
        const partial = `${path}.${randomUUID()}.partial`;
        await writeFile(partial, bytes);
        await rename(partial, path);
      }

      return { id, name: cleanName(file.name), type: servedType(bytes), size: bytes.length };
    },

    async read(repo, issue, id) {
      const path = pathOf(repo, issue, id);
      if (!path) return undefined;

      try {
        return await readFile(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
  };
}
