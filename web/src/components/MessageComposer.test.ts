import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import type { IssuePhase } from "../../../src/runStatus.ts";
import MessageComposer from "./MessageComposer.vue";

const phases: { phase: IssuePhase; hue: string; icon: string }[] = [
  { phase: "queued", hue: "text-setup", icon: "hourglass" },
  { phase: "prepare", hue: "text-setup", icon: "folder-git-2" },
  { phase: "implement", hue: "text-run", icon: "code" },
  { phase: "verify", hue: "text-check", icon: "flask-conical" },
  { phase: "fix", hue: "text-run", icon: "wrench" },
  { phase: "revise", hue: "text-you", icon: "message-square-reply" },
  { phase: "publish", hue: "text-ship", icon: "git-pull-request-arrow" },
  { phase: "report", hue: "text-ship", icon: "message-square-text" },
  { phase: "done", hue: "text-ok", icon: "check" },
  { phase: "failed", hue: "text-bad", icon: "x" },
  { phase: "aborted", hue: "text-halt", icon: "ban" },
];

describe("MessageComposer", () => {
  it.each(phases)("shows $phase with its phase icon and color in a live status", async ({ phase, hue, icon }) => {
    const html = await renderToString(
      createSSRApp(() => h(MessageComposer, { repo: "owner/repo", issue: "70", phase })),
    );
    const status = html.match(/<div role="status" aria-atomic="true">([\s\S]*?)<\/div>/)?.[1];

    expect(status).toBeDefined();
    expect(status).toContain("Current pipeline phase:");
    expect(status).toContain(` ${phase}</span>`);
    expect(status).toContain(hue);
    expect(status).toContain(`lucide-${icon}`);
    expect(status).toContain('aria-hidden="true"');
  });
});
