---
name: pull-request
description: Write commit messages and the pull request description. Read before your first commit; your final reply becomes the PR body.
---

# Pull request

The pipeline pushes the branch, opens the PR with the issue title, and appends `Closes #<issue>` to your final reply. You write the commits and that reply.

## 1. Commit

Match the repository's convention: read `git log --oneline -15` and copy the shape you find. When history has no clear pattern, use Conventional Commits (`fix(parser): handle empty input`). Each subject is one imperative line naming the effect, and each commit holds one logical change. Add a body when the reason is not obvious from the subject. **Done when** every change is committed under a subject that follows the observed convention.

## 2. Write the PR description

Your final reply is the PR body, read by a reviewer who has not seen this conversation. Cover the whole branch, including earlier work and verification fixes, in this order:

1. **Problem**: what was broken, missing, or in the way, in plain language a reviewer can follow without the diff.
2. **Solution**: the approach in a line or two, and why it was chosen when there was a clear alternative.
3. **Testing**: the commands you ran and what they showed. Name anything left untested.
4. **Notes**, only when relevant: breaking changes, migration or setup steps, documentation updated, known limitations.

If the repo has a pull request template (`.github/pull_request_template.md` or similar), fill every section of it in the same order instead. Leave the file-by-file inventory to the diff and keep the body under 3,000 characters. **Done when** your final reply is only the PR body, leading with the problem, and every claim in it is something you observed.
