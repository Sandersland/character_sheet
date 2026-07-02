---
name: promote
description: Promote staging to main via a merge-commit PR — checks staging is ahead and green, opens (or reuses) the staging→main promote PR with a summary of included changes, and arms auto-merge. Use when the user says "/promote", "promote staging", "cut a release to main", or wants staging's accumulated work landed on main. Not for feature→staging merges — those are ordinary squash PRs.
---

# promote

Land everything accumulated on `staging` onto `main` in one mechanical, low-ceremony step. The heavy verification already happened per-feature (claude-review + CI on each staging PR, plus CI's post-merge run on every staging push), so the promote is deliberately thin: `claude-code-review.yml` **skips** the staging→main PR (the job reports `skipped`, which satisfies main's required check), leaving only lint/test/build to re-run on the aggregate.

**Always a MERGE COMMIT, never squash.** Squash-promoting rewrites staging's history into one commit that main then diverges from, which re-conflicts every subsequent promote — this repo enabled merge commits specifically to end that. Issue auto-close is not the promote's job either: `staging` is the default branch, so `Closes #` fires when feature PRs land there.

## Steps

### 1. Is there anything to promote?

```bash
git fetch origin main staging --quiet
git rev-list --count origin/main..origin/staging   # 0 → nothing to promote; stop and say so
git log --oneline origin/main..origin/staging       # the changes going out — goes in the PR body
```

### 2. Is staging green?

```bash
gh api repos/{owner}/{repo}/commits/staging/check-runs \
  -q '[.check_runs[] | {name, conclusion}] | unique'
```

- Any `failure`/`cancelled` → **stop** and report which check is red; don't promote a broken staging.
- Empty list (commit predates the `push: staging` CI trigger) → note it and proceed; every commit arrived through a fully-checked PR.

### 3. Open — or reuse — the promote PR

Check for an existing one first (`gh pr list --base main --head staging`); a promote PR left open from last time just needs its auto-merge re-armed, not a duplicate.

```bash
gh pr create --base main --head staging \
  --title "chore: promote staging to main ($(date +%Y-%m-%d))" \
  --body "<### Included\n- one line per commit from step 1, PR refs intact\n\nRoutine promotion; per-feature review happened on the staging PRs.>"
```

### 4. Arm auto-merge — merge commit, not squash

```bash
gh pr merge <pr-url> --merge --auto
```

Main's protection is strict (up-to-date required), but a staging→main PR is up to date by construction. Once lint/test/build pass (claude-review reports `skipped`), it lands itself.

### 5. Report

Promoted range (`N` commits, listed), PR link, and merge status (auto-merge armed / already landed / blocked-on-which-check). If step 1 found nothing to promote, that one line is the whole report.
