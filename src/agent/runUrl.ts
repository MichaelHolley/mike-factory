export const runUrl = (publicUrl: string | undefined, repo: string, issue: number) =>
  publicUrl ? `${publicUrl}/runs/${repo}/${issue}` : undefined;
