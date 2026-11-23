import { File, FileArchive, FileCode, FileImage, FileSpreadsheet, FileTerminal, FileText } from "@lucide/vue";
import type { Component } from "vue";
import type { Attachment } from "../../src/runStatus.ts";

const ICONS: [RegExp, Component][] = [
  [/\.(log|out)$/i, FileTerminal],
  [/\.(txt|md|pdf|rtf|docx?)$/i, FileText],
  [/\.(csv|tsv|xlsx?|ods)$/i, FileSpreadsheet],
  [/\.(zip|tar|gz|tgz|bz2|xz|7z|rar)$/i, FileArchive],
  [/\.(png|jpe?g|gif|webp|avif|svg|heic|bmp)$/i, FileImage],
  [/\.(json|ya?ml|toml|xml|html?|css|[cm]?[jt]sx?|vue|py|rb|go|rs|java|kt|swift|sh|sql|diff|patch)$/i, FileCode],
];

export const fileIcon = (name: string): Component => ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? File;

export const isImage = (type: string) => type.startsWith("image/");

export const attachmentUrl = (repo: string, issue: string, { id, name }: Attachment) =>
  `/status/${encodeURIComponent(repo)}/${encodeURIComponent(issue)}/attachments/${id}/${encodeURIComponent(name)}`;
