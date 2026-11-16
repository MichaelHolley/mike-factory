import {
  type GitHubClient,
  type GitIdentity,
  type IssueComment,
  type IssueData,
  type PullRequestInfo,
  type PullRequestRef,
  type ReviewFeedback,
  type ReviewThread,
} from "../../src/contracts.ts";

export const FAKE_GIT_TOKEN = "fake-installation-token";
export const FAKE_BOT_IDENTITY: GitIdentity = {
  name: "mike-factory[bot]",
  email: "1+mike-factory[bot]@users.noreply.github.com",
};

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

export interface FakeReview {
  id: number;
  repo: string;
  pr: number;
  reviewer: string;
  state: string;
  body: string;
}

export interface FakeReviewComment {
  id: number;
  repo: string;
  pr: number;
  reviewId: number;
  author: string;
  path: string;
  line: number;
  body: string;
  inReplyTo: number | null;
}

export interface FakeGitHubState {
  issues: FakeIssue[];
  comments: FakeComment[];
  prs: FakePr[];
  reviews: FakeReview[];
  reviewComments: FakeReviewComment[];
  reactions: { repo: string; nodeId: string }[];
  reviewRequests: { repo: string; pr: number; login: string }[];
  calls: Record<string, number>;
  nextId: number;
}

export class FakeGitHub implements GitHubClient {
  private issues = new Map<string, FakeIssue>();
  private commentList: FakeComment[] = [];
  private prList: FakePr[] = [];
  private reviewList: FakeReview[] = [];
  private reviewCommentList: FakeReviewComment[] = [];
  private reactionList: FakeGitHubState["reactions"] = [];
  private reviewRequestList: FakeGitHubState["reviewRequests"] = [];
  private callCounts: Record<string, number> = {};
  private nextId = 1;

  static fromJSON(state: FakeGitHubState): FakeGitHub {
    const fake = new FakeGitHub();
    for (const issue of state.issues) fake.issues.set(fake.key(issue.repo, issue.number), issue);
    fake.commentList = state.comments;
    fake.prList = state.prs;
    fake.reviewList = state.reviews;
    fake.reviewCommentList = state.reviewComments;
    fake.reactionList = state.reactions;
    fake.reviewRequestList = state.reviewRequests;
    fake.callCounts = state.calls;
    fake.nextId = state.nextId;
    return fake;
  }

  toJSON(): FakeGitHubState {
    return {
      issues: [...this.issues.values()],
      comments: this.commentList,
      prs: this.prList,
      reviews: this.reviewList,
      reviewComments: this.reviewCommentList,
      reactions: this.reactionList,
      reviewRequests: this.reviewRequestList,
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

  get reactions(): readonly { repo: string; nodeId: string }[] {
    return this.reactionList;
  }

  get reviewRequests(): readonly { repo: string; pr: number; login: string }[] {
    return this.reviewRequestList;
  }

  /** Submits a review whose inline comments each start a thread, or reply to one with `inReplyTo`. */
  addReview(
    repo: string,
    pr: number,
    review: {
      reviewer: string;
      state: string;
      body: string;
      comments?: { path: string; line: number; body: string; inReplyTo?: number }[];
    },
  ): { reviewId: number; commentIds: number[] } {
    const reviewId = this.nextId++;
    this.reviewList.push({ id: reviewId, repo, pr, reviewer: review.reviewer, state: review.state, body: review.body });
    const commentIds = (review.comments ?? []).map(({ inReplyTo, ...comment }) => {
      const id = this.nextId++;
      this.reviewCommentList.push({
        ...comment,
        id,
        repo,
        pr,
        reviewId,
        author: review.reviewer,
        inReplyTo: inReplyTo ?? null,
      });
      return id;
    });
    return { reviewId, commentIds };
  }

  reviewCommentsOn(repo: string, pr: number): FakeReviewComment[] {
    return this.reviewCommentList.filter((comment) => comment.repo === repo && comment.pr === pr);
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
    if (!this.prList.some((pr) => pr.repo === repo && pr.number === issue)) this.issue(repo, issue);
    const tag = COMMENT_MARKER(marker);
    const fullBody = `${tag}\n${body}`;
    const existing = this.commentsOn(repo, issue).find(
      (comment) => comment.author === BOT_LOGIN && comment.body.includes(tag),
    );
    if (existing) existing.body = fullBody;
    else
      this.commentList.push({
        id: this.nextId++,
        repo,
        issue,
        author: BOT_LOGIN,
        body: fullBody,
        createdAt: new Date().toISOString(),
      });
  }

  async findOpenPr(repo: string, head: string): Promise<PullRequestRef | undefined> {
    this.called("findOpenPr");
    const pr = this.openPr(repo, head);
    return pr && { number: pr.number, url: pr.url };
  }

  async createPr(
    repo: string,
    pr: { head: string; base: string; title: string; body: string },
  ): Promise<PullRequestRef> {
    this.called("createPr");
    if (this.openPr(repo, pr.head))
      throw new Error(`422 Validation Failed: A pull request already exists for ${pr.head}`);
    // Apart from issue numbers, so a PR's comments never mix with an issue's.
    const number = 100 + this.nextId++;
    const created: FakePr = {
      ...pr,
      repo,
      number,
      url: `https://github.com/fake/${repo}/pull/${number}`,
      state: "open",
    };
    this.prList.push(created);
    return { number: created.number, url: created.url };
  }

  async updatePr(repo: string, number: number, pr: { title: string; body: string }): Promise<void> {
    this.called("updatePr");
    Object.assign(this.pr(repo, number), pr);
  }

  async getPr(repo: string, number: number): Promise<PullRequestInfo> {
    this.called("getPr");
    const pr = this.pr(repo, number);
    return { number, url: pr.url, state: pr.state, headRef: pr.head, fromFork: false };
  }

  async getReviewFeedback(repo: string, pr: number, reviewId: number): Promise<ReviewFeedback> {
    this.called("getReviewFeedback");
    const review = this.reviewList.find((candidate) => candidate.repo === repo && candidate.id === reviewId);
    if (!review) throw new Error(`404 Not Found: ${repo} review ${reviewId}`);
    const all = this.reviewCommentsOn(repo, pr);
    const url = this.pr(repo, pr).url;
    return {
      reviewer: review.reviewer,
      state: review.state,
      body: review.body,
      url: `${url}#pullrequestreview-${reviewId}`,
      comments: all
        .filter((comment) => comment.reviewId === reviewId)
        .map((comment) => ({
          id: comment.id,
          threadRootId: comment.inReplyTo ?? comment.id,
          path: comment.path,
          line: comment.line,
          diffHunk: `@@ -1 +1 @@\n+${comment.path}`,
          body: comment.body,
          url: `${url}#discussion_r${comment.id}`,
          thread: all
            .filter(
              (other) => (other.inReplyTo ?? other.id) === (comment.inReplyTo ?? comment.id) && other.id < comment.id,
            )
            .map(({ author, body }) => ({ author, body })),
        })),
    };
  }

  async listReviewThreads(repo: string, pr: number): Promise<ReviewThread[]> {
    this.called("listReviewThreads");
    const all = this.reviewCommentsOn(repo, pr);
    return all
      .filter((comment) => comment.inReplyTo === null)
      .map((root) => ({
        path: root.path,
        line: root.line,
        comments: all
          .filter((comment) => (comment.inReplyTo ?? comment.id) === root.id)
          .map(({ id, author, body }) => ({ id, author, body })),
      }));
  }

  async react(repo: string, nodeId: string): Promise<void> {
    this.called("react");
    if (!this.reactionList.some((reaction) => reaction.repo === repo && reaction.nodeId === nodeId))
      this.reactionList.push({ repo, nodeId });
  }

  async replyToReviewComment(repo: string, pr: number, commentId: number, marker: string, body: string) {
    this.called("replyToReviewComment");
    const tag = COMMENT_MARKER(marker);
    const all = this.reviewCommentsOn(repo, pr);
    if (all.some((comment) => comment.body.includes(tag))) return true;
    const target = all.find((comment) => comment.id === commentId);
    if (!target) return false;
    this.reviewCommentList.push({
      ...target,
      id: this.nextId++,
      author: BOT_LOGIN,
      body: `${tag}\n${body}`,
      inReplyTo: target.inReplyTo ?? target.id,
    });
    return true;
  }

  async requestReview(repo: string, pr: number, login: string): Promise<void> {
    this.called("requestReview");
    this.pr(repo, pr);
    this.reviewRequestList.push({ repo, pr, login });
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

  private pr(repo: string, number: number): FakePr {
    const pr = this.prList.find((candidate) => candidate.repo === repo && candidate.number === number);
    if (!pr) throw new Error(`404 Not Found: ${repo} pull ${number}`);
    return pr;
  }

  private openPr(repo: string, head: string) {
    return this.prList.find((pr) => pr.repo === repo && pr.head === head && pr.state === "open");
  }

  private called(method: keyof GitHubClient) {
    this.callCounts[method] = (this.callCounts[method] ?? 0) + 1;
  }
}
