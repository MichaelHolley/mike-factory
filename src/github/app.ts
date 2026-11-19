import { App } from "@octokit/app";
import {
  type GitHubClient,
  type GitIdentity,
  type IssueComment,
  type IssueData,
  type ReviewFeedback,
  type ReviewThread,
} from "../contracts.ts";
import type { PrState } from "../runStatus.ts";

import { downloadIssueImage } from "./images.ts";

const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
const PER_PAGE = 100;

const labelName = (label: string | { name?: string }) => (typeof label === "string" ? label : (label.name ?? ""));
const markerComment = (marker: string) => `<!-- ${marker} -->`;

function prStateOf(pr: { state: string; merged: boolean }): PrState {
  if (pr.merged) return "merged";
  return pr.state === "open" ? "open" : "closed";
}

export function createGitHubClient(opts: { appId: string; privateKey: string; owner: string }): GitHubClient {
  const app = new App({ appId: opts.appId, privateKey: opts.privateKey });
  const { owner } = opts;

  const installationIds = new Map<string, Promise<number>>();
  const tokens = new Map<string, { token: string; expiresAt: number }>();
  let identity: Promise<GitIdentity> | undefined;

  const installationId = (repo: string) => {
    let id = installationIds.get(repo);
    if (!id) {
      id = app.octokit.request("GET /repos/{owner}/{repo}/installation", { owner, repo }).then((res) => res.data.id);
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

  const rawComments = async (repo: string, issue: number) => {
    const octokit = await octokitFor(repo);
    return listAll((page) =>
      octokit
        .request("GET /repos/{owner}/{repo}/issues/{issue_number}/comments", {
          owner,
          repo,
          issue_number: issue,
          per_page: PER_PAGE,
          page,
        })
        .then((res) => res.data),
    );
  };

  const rawReviewComments = async (repo: string, pr: number) => {
    const octokit = await octokitFor(repo);
    return listAll((page) =>
      octokit
        .request("GET /repos/{owner}/{repo}/pulls/{pull_number}/comments", {
          owner,
          repo,
          pull_number: pr,
          per_page: PER_PAGE,
          page,
        })
        .then((res) =>
          res.data.map((comment) => ({
            ...comment,
            id: Number(comment.id),
            reviewId: comment.pull_request_review_id == null ? null : Number(comment.pull_request_review_id),
            rootId: Number(comment.in_reply_to_id ?? comment.id),
          })),
        ),
    );
  };

  return {
    async getIssue(repo, issue): Promise<IssueData> {
      const octokit = await octokitFor(repo);
      const { data } = await octokit.request("GET /repos/{owner}/{repo}/issues/{issue_number}", {
        owner,
        repo,
        issue_number: issue,
      });
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
      return comments.map((comment) => ({
        author: comment.user?.login ?? "",
        body: comment.body ?? "",
        createdAt: comment.created_at,
      }));
    },

    async downloadIssueImage(repo, url) {
      return downloadIssueImage(url, async () => {
        const octokit = await octokitFor(repo);
        const { token } = (await octokit.auth({ type: "installation", repositoryNames: [repo] })) as { token: string };
        return token;
      });
    },

    async upsertComment(repo, issue, marker, body) {
      const octokit = await octokitFor(repo);
      const tag = markerComment(marker);
      const { name: botLogin } = await this.botIdentity();
      const existing = (await rawComments(repo, issue)).find(
        (comment) => comment.user?.login === botLogin && comment.body?.includes(tag),
      );

      const fullBody = `${tag}\n${body}`;

      if (existing) {
        await octokit.request("PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}", {
          owner,
          repo,
          comment_id: existing.id,
          body: fullBody,
        });
      } else {
        await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
          owner,
          repo,
          issue_number: issue,
          body: fullBody,
        });
      }
    },

    async findOpenPr(repo, head) {
      const octokit = await octokitFor(repo);
      const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
        owner,
        repo,
        head: `${owner}:${head}`,
        state: "open",
        per_page: 1,
      });
      const pr = data[0];
      return pr && { number: pr.number, url: pr.html_url };
    },

    async createPr(repo, pr) {
      const octokit = await octokitFor(repo);
      const { data } = await octokit.request("POST /repos/{owner}/{repo}/pulls", { owner, repo, ...pr });
      return { number: data.number, url: data.html_url };
    },

    async updatePr(repo, number, pr) {
      const octokit = await octokitFor(repo);
      await octokit.request("PATCH /repos/{owner}/{repo}/pulls/{pull_number}", {
        owner,
        repo,
        pull_number: number,
        ...pr,
      });
    },

    async getPr(repo, number) {
      const octokit = await octokitFor(repo);
      const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
        owner,
        repo,
        pull_number: number,
      });
      return {
        number: data.number,
        url: data.html_url,
        state: prStateOf(data),
        headRef: data.head.ref,
        fromFork: data.head.repo?.full_name !== data.base.repo.full_name,
      };
    },

    async getReviewFeedback(repo, pr, reviewId): Promise<ReviewFeedback> {
      const octokit = await octokitFor(repo);
      const [{ data: review }, all] = await Promise.all([
        octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}", {
          owner,
          repo,
          pull_number: pr,
          review_id: reviewId,
        }),
        rawReviewComments(repo, pr),
      ]);

      return {
        reviewer: review.user?.login ?? "",
        state: review.state.toLowerCase(),
        body: review.body ?? "",
        url: review.html_url,
        comments: all
          .filter((comment) => comment.reviewId === reviewId)
          .map((comment) => ({
            id: comment.id,
            threadRootId: comment.rootId,
            path: comment.path,
            line: comment.line ?? comment.original_line ?? null,
            diffHunk: comment.diff_hunk,
            body: comment.body,
            url: comment.html_url,
            thread: all
              .filter((other) => other.rootId === comment.rootId && other.id < comment.id)
              .map((other) => ({ author: other.user?.login ?? "", body: other.body })),
          })),
      };
    },

    async listReviewThreads(repo, pr) {
      const octokit = await octokitFor(repo);
      type Page = {
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: { hasNextPage: boolean; endCursor: string | null };
              nodes: {
                isResolved: boolean;
                path: string;
                line: number | null;
                comments: { nodes: { databaseId: number; body: string; author: { login: string } | null }[] };
              }[];
            };
          };
        };
      };

      const threads: ReviewThread[] = [];
      let cursor: string | null = null;

      do {
        const page: Page = await octokit.graphql<Page>(
          `query($owner: String!, $repo: String!, $pr: Int!, $cursor: String) {
            repository(owner: $owner, name: $repo) {
              pullRequest(number: $pr) {
                reviewThreads(first: 100, after: $cursor) {
                  pageInfo { hasNextPage endCursor }
                  nodes { isResolved path line comments(first: 100) { nodes { databaseId body author { login } } } }
                }
              }
            }
          }`,
          { owner, repo, pr, cursor },
        );
        const { nodes, pageInfo } = page.repository.pullRequest.reviewThreads;

        for (const thread of nodes.filter((node) => !node.isResolved)) {
          threads.push({
            path: thread.path,
            line: thread.line,
            comments: thread.comments.nodes.map((comment) => ({
              id: comment.databaseId,
              author: comment.author?.login ?? "",
              body: comment.body,
            })),
          });
        }
        cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
      } while (cursor);
      return threads;
    },

    async react(repo, nodeId) {
      const octokit = await octokitFor(repo);
      await octokit.graphql(
        `mutation($id: ID!) { addReaction(input: { subjectId: $id, content: EYES }) { clientMutationId } }`,
        { id: nodeId },
      );
    },

    async replyToReviewComment(repo, pr, commentId, marker, body) {
      const octokit = await octokitFor(repo);
      const { name: botLogin } = await this.botIdentity();
      const tag = markerComment(marker);
      const all = await rawReviewComments(repo, pr);
      if (all.some((comment) => comment.user?.login === botLogin && comment.body.includes(tag))) return true;

      const target = all.find((comment) => comment.id === commentId);
      if (!target) return false;

      await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies", {
        owner,
        repo,
        pull_number: pr,
        comment_id: target.rootId,
        body: `${tag}\n${body}`,
      });
      return true;
    },

    async requestReview(repo, pr, login) {
      const octokit = await octokitFor(repo);
      await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers", {
        owner,
        repo,
        pull_number: pr,
        reviewers: [login],
      });
    },

    async gitToken(repo) {
      const cached = tokens.get(repo);
      if (cached && cached.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) return cached.token;

      const { data } = await app.octokit.request("POST /app/installations/{installation_id}/access_tokens", {
        installation_id: await installationId(repo),
        repositories: [repo],
        permissions: { contents: "write" },
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
        // App JWT auth only covers /app routes; the bot's public profile needs no auth.
        const res = await fetch(`https://api.github.com/users/${encodeURIComponent(botLogin)}`, {
          headers: { accept: "application/vnd.github+json", "user-agent": "mike-factory" },
        });
        if (!res.ok) throw new Error(`GET /users/${botLogin} failed: ${res.status}`);

        const user = (await res.json()) as { id: number };
        return { name: botLogin, email: `${user.id}+${botLogin}@users.noreply.github.com` };
      })();
      identity.catch(() => (identity = undefined));
      return identity;
    },
  };
}
