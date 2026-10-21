import { type GitHubClient, type GitIdentity, type IssueComment, type IssueData, type PullRequestRef } from "../../src/contracts.ts";

export const FAKE_GIT_TOKEN = "fake-installation-token";
export const FAKE_BOT_IDENTITY: GitIdentity = { name: "mike-factory[bot]", email: "1+mike-factory[bot]@users.noreply.github.com" };

const BOT_LOGIN = FAKE_BOT_IDENTITY.name;
const COMMENT_MARKER = (marker: string) => `<!-- ${marker} -->`;

export interface FakePr extends PullRequestRef {
  repo: string;
  head: string;
  base: string;
  title: string;
  body: string;
  state: "open" | "closed";
}

export interface FakeComment extends IssueComment {
  id: number;
  repo: string;
  issue: number;
}

interface FakeIssue extends IssueData {
  repo: string;
}

export interface FakeGitHubState {
  issues: FakeIssue[];
  comments: FakeComment[];
  prs: FakePr[];
  calls: Record<string, number>;
  nextId: number;
}

export class FakeGitHub implements GitHubClient {
  private issues = new Map<string, FakeIssue>();
  private commentList: FakeComment[] = [];
  private prList: FakePr[] = [];
  private callCounts: Record<string, number> = {};
  private nextId = 1;

  static fromJSON(state: FakeGitHubState): FakeGitHub {
    const fake = new FakeGitHub();
    for (const issue of state.issues) fake.issues.set(fake.key(issue.repo, issue.number), issue);
    fake.commentList = state.comments;
    fake.prList = state.prs;
    fake.callCounts = state.calls;
    fake.nextId = state.nextId;
    return fake;
  }

  toJSON(): FakeGitHubState {
    return {
      issues: [...this.issues.values()],
      comments: this.commentList,
      prs: this.prList,
      calls: this.callCounts,
      nextId: this.nextId,
    };
  }

  addIssue(repo: string, issue: Partial<IssueData> & { number: number }): void {
    this.issues.set(this.key(repo, issue.number), { title: "", body: "", labels: [], state: "open", ...issue, repo });
  }

  addComment(repo: string, issue: number, author: string, body: string): void {
    this.commentList.push({ id: this.nextId++, repo, issue, author, body, createdAt: new Date().toISOString() });
  }

  /** Closes the issue and its open agent PR, as merging a PR with `Closes #n` does. */
  closeIssue(repo: string, issue: number): void {
    this.issue(repo, issue).state = "closed";
    const pr = this.openPr(repo, `agent/issue-${issue}`);
    if (pr) pr.state = "closed";
  }

  commentsOn(repo: string, issue: number): FakeComment[] {
    return this.commentList.filter((comment) => comment.repo === repo && comment.issue === issue);
  }

  get prs(): readonly FakePr[] {
    return this.prList;
  }

  callCount(method: keyof GitHubClient): number {
    return this.callCounts[method] ?? 0;
  }

  async getIssue(repo: string, issue: number): Promise<IssueData> {
    this.called("getIssue");
    const { repo: _repo, ...data } = this.issue(repo, issue);
    return { ...data, labels: [...data.labels] };
  }

  async listIssueComments(repo: string, issue: number): Promise<IssueComment[]> {
    this.called("listIssueComments");
    return this.commentsOn(repo, issue).map(({ author, body, createdAt }) => ({ author, body, createdAt }));
  }

  async upsertComment(repo: string, issue: number, marker: string, body: string): Promise<void> {
    this.called("upsertComment");
    this.issue(repo, issue);
    const tag = COMMENT_MARKER(marker);
    const fullBody = `${tag}\n${body}`;
    const existing = this.commentsOn(repo, issue).find((comment) => comment.body.includes(tag));
    if (existing) existing.body = fullBody;
    else this.commentList.push({ id: this.nextId++, repo, issue, author: BOT_LOGIN, body: fullBody, createdAt: new Date().toISOString() });
  }

  async findOpenPr(repo: string, head: string): Promise<PullRequestRef | undefined> {
    this.called("findOpenPr");
    const pr = this.openPr(repo, head);
    return pr && { number: pr.number, url: pr.url };
  }

  async createPr(repo: string, pr: { head: string; base: string; title: string; body: string }): Promise<PullRequestRef> {
    this.called("createPr");
    if (this.openPr(repo, pr.head)) throw new Error(`422 Validation Failed: A pull request already exists for ${pr.head}`);
    const number = this.nextId++;
    const created: FakePr = { ...pr, repo, number, url: `https://github.com/fake/${repo}/pull/${number}`, state: "open" };
    this.prList.push(created);
    return { number: created.number, url: created.url };
  }

  async gitToken(_repo: string): Promise<string> {
    this.called("gitToken");
    return FAKE_GIT_TOKEN;
  }

  async botIdentity(): Promise<GitIdentity> {
    this.called("botIdentity");
    return FAKE_BOT_IDENTITY;
  }

  private key(repo: string, issue: number) {
    return `${repo}#${issue}`;
  }

  private issue(repo: string, issue: number): FakeIssue {
    const data = this.issues.get(this.key(repo, issue));
    if (!data) throw new Error(`404 Not Found: ${repo}#${issue}`);
    return data;
  }

  private openPr(repo: string, head: string) {
    return this.prList.find((pr) => pr.repo === repo && pr.head === head && pr.state === "open");
  }

  private called(method: keyof GitHubClient) {
    this.callCounts[method] = (this.callCounts[method] ?? 0) + 1;
  }
}
