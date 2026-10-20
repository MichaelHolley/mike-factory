import { App } from "@octokit/app";
import { AGENT_LABELS, type AgentLabel, type GitHubClient, type GitIdentity, type IssueComment, type IssueData } from "../contracts.ts";

const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
const PER_PAGE = 100;

const isNotFound = (error: unknown) => (error as { status?: number } | null)?.status === 404;
const labelName = (label: string | { name?: string }) => (typeof label === "string" ? label : (label.name ?? ""));
const markerComment = (marker: string) => `<!-- ${marker} -->`;

export function createGitHubClient(opts: { appId: string; privateKey: string; owner: string }): GitHubClient {
  const app = new App({ appId: opts.appId, privateKey: opts.privateKey });
  const { owner } = opts;

  const installationIds = new Map<string, Promise<number>>();
  const tokens = new Map<string, { token: string; expiresAt: number }>();
  let identity: Promise<GitIdentity> | undefined;

  const installationId = (repo: string) => {
    let id = installationIds.get(repo);
    if (!id) {
      id = app.octokit
        .request("GET /repos/{owner}/{repo}/installation", { owner, repo })
        .then((res) => res.data.id);
      id.catch(() => installationIds.delete(repo));
      installationIds.set(repo, id);
    }
    return id;
  };

  const octokitFor = async (repo: string) => app.getInstallationOctokit(await installationId(repo));

  const listAll = async <T>(fetchPage: (page: number) => Promise<T[]>): Promise<T[]> => {
    const all: T[] = [];
    for (let page = 1; ; page++) {
      const items = await fetchPage(page);
      all.push(...items);
      if (items.length < PER_PAGE) return all;
    }
  };

  const currentAgentLabels = async (repo: string, issue: number) => {
    const octokit = await octokitFor(repo);
    const labels = await listAll((page) =>
      octokit
        .request("GET /repos/{owner}/{repo}/issues/{issue_number}/labels", { owner, repo, issue_number: issue, per_page: PER_PAGE, page })
        .then((res) => res.data),
    );
    return labels.map((label) => label.name).filter((name): name is AgentLabel => AGENT_LABELS.includes(name as AgentLabel));
  };

  const rawComments = async (repo: string, issue: number) => {
    const octokit = await octokitFor(repo);
    return listAll((page) =>
      octokit
        .request("GET /repos/{owner}/{repo}/issues/{issue_number}/comments", { owner, repo, issue_number: issue, per_page: PER_PAGE, page })
        .then((res) => res.data),
    );
  };

  const removeLabels = async (repo: string, issue: number, names: string[]) => {
    const octokit = await octokitFor(repo);
    for (const name of names) {
      try {
        await octokit.request("DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}", { owner, repo, issue_number: issue, name });
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
  };

  return {
    async getIssue(repo, issue): Promise<IssueData> {
      const octokit = await octokitFor(repo);
      const { data } = await octokit.request("GET /repos/{owner}/{repo}/issues/{issue_number}", { owner, repo, issue_number: issue });
      return {
        number: data.number,
        title: data.title,
        body: data.body ?? "",
        labels: data.labels.map(labelName),
        state: data.state === "closed" ? "closed" : "open",
      };
    },

    async listIssueComments(repo, issue): Promise<IssueComment[]> {
      const comments = await rawComments(repo, issue);
      return comments.map((comment) => ({ author: comment.user?.login ?? "", body: comment.body ?? "", createdAt: comment.created_at }));
    },

    async setAgentLabel(repo, issue, label) {
      const others = (await currentAgentLabels(repo, issue)).filter((name) => name !== label);
      await removeLabels(repo, issue, others);
      const octokit = await octokitFor(repo);
      await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/labels", { owner, repo, issue_number: issue, labels: [label] });
    },

    async clearAgentLabels(repo, issue) {
      await removeLabels(repo, issue, await currentAgentLabels(repo, issue));
    },

    async upsertComment(repo, issue, marker, body) {
      const octokit = await octokitFor(repo);
      const tag = markerComment(marker);
      const existing = (await rawComments(repo, issue)).find((comment) => comment.body?.includes(tag));
      const fullBody = `${tag}\n${body}`;
      if (existing) {
        await octokit.request("PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}", { owner, repo, comment_id: existing.id, body: fullBody });
      } else {
        await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", { owner, repo, issue_number: issue, body: fullBody });
      }
    },

    async findOpenPr(repo, head) {
      const octokit = await octokitFor(repo);
      const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls", { owner, repo, head: `${owner}:${head}`, state: "open", per_page: 1 });
      const pr = data[0];
      return pr && { number: pr.number, url: pr.html_url };
    },

    async createPr(repo, pr) {
      const octokit = await octokitFor(repo);
      const { data } = await octokit.request("POST /repos/{owner}/{repo}/pulls", { owner, repo, ...pr });
      return { number: data.number, url: data.html_url };
    },

    async gitToken(repo) {
      const cached = tokens.get(repo);
      if (cached && cached.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) return cached.token;
      const { data } = await app.octokit.request("POST /app/installations/{installation_id}/access_tokens", {
        installation_id: await installationId(repo),
      });
      tokens.set(repo, { token: data.token, expiresAt: Date.parse(data.expires_at) });
      return data.token;
    },

    botIdentity() {
      identity ??= (async () => {
        const { data: appData } = await app.octokit.request("GET /app");
        const slug = appData?.slug;
        if (!slug) throw new Error("GET /app returned no slug");
        const botLogin = `${slug}[bot]`;
        const { data: user } = await app.octokit.request("GET /users/{username}", { username: botLogin });
        return { name: botLogin, email: `${user.id}+${botLogin}@users.noreply.github.com` };
      })();
      identity.catch(() => (identity = undefined));
      return identity;
    },
  };
}
