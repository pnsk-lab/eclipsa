---
name: commit-make-pr
description: Standardize Git commit and pull request workflows. Use when Codex is asked to commit changes, prepare a commit message, create or open a pull request, or handle requests such as commitして, PR作って, make pr, or gh pr create. Require adding the specified Co-authored-by trailer to commits created by Codex and require creating pull requests with gh commands instead of browser or manual UI flows.
---

# Commit and Make PR

Use this skill to finish repository work cleanly once code changes are ready. Follow repository-specific instructions first, then apply the commit and PR rules in this skill.

## Workflow

- Review `git status` and the relevant diff before committing or opening a PR.
- Keep unrelated changes out of the commit and PR. Stage only the intended files.
- Prefer non-interactive commands for both Git and GitHub CLI operations.
- Report the resulting commit hash or PR URL after the operation finishes.

## Commit Rules

- When Codex creates a commit, include this trailer in the commit message:

```text
Co-authored-by: codex <codex@openai.com>
```

- Add the trailer as part of the actual commit message, not as a separate note in the response.
- Write a concise subject line that matches the repository's commit style.
- Prefer a non-interactive command such as `git commit -m` or `git commit -F` so the full message, including the trailer, is explicit and reproducible.
- After committing, report the commit hash and subject.

## Pull Request Rules

- When Codex is asked to create or open a PR, use `gh` commands. Do not rely on a browser flow or ask the user to open the PR manually if `gh` can do it.
- Prefer `gh pr create` with explicit `--title` and `--body` values derived from the actual diff and verification steps.
- Push the branch first if needed, then create the PR with `gh`.
- After creating the PR, report the PR number and URL.

## Combined Requests

When the user asks for both a commit and a PR, finish them in this order:

1. Verify the working tree and stage only intended files.
2. Create the commit with the required `Co-authored-by` trailer.
3. Push the branch if necessary.
4. Create the PR with `gh pr create`.

Summarize the final state with the commit hash, pushed branch, and PR URL.

## Response Expectations

- Mention blockers before the commit or PR step if the tree is dirty in an unexpected way, the branch is wrong, or required remote state is missing.
- If the user asked only for preparation, provide the exact commit message or `gh pr create` command you would run, still following the rules in this skill.
