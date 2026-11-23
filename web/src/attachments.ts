import { File, FileArchive, FileCode, FileImage, FileSpreadsheet, FileTerminal, FileText } from "@lucide/vue";
import type { Component } from "vue";

const ICONS: [RegExp, Component][] = [
  [/\.(log|out)$/i, FileTerminal],
  [/\.(txt|md|pdf|rtf|docx?)$/i, FileText],
  [/\.(csv|tsv|xlsx?|ods)$/i, FileSpreadsheet],
  [/\.(zip|tar|gz|tgz|bz2|xz|7z|rar)$/i, FileArchive],
  [/\.(png|jpe?g|gif|webp|avif|svg|heic|bmp)$/i, FileImage],
  [/\.(json|ya?ml|toml|xml|html?|css|[cm]?[jt]sx?|vue|py|rb|go|rs|java|kt|swift|sh|sql|diff|patch)$/i, FileCode],
];

export const fileIcon = (name: string): Component => ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? File;

/** Only the raster formats the server lets open in the browser. */
export const isImage = (name: string) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
