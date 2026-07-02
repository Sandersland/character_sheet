The reviewer examined your branch and requires changes before it can ship. This resumes your Worker session — you still own issue #{{issue}} in {{worktree}}.

## Review findings (address EVERY one)

{{findings}}

## Rules (unchanged)

- Fix each finding; if a finding is factually wrong, fix what's right and explain the disagreement in your summary — the reviewer re-checks everything.
- Same house rules as before (one-line comments, `@/` imports, label helpers, api client, container-run tooling).
- Denied writes: if a write/edit is permission-denied twice for the same path, STOP retrying it — repeat denials burn the session rate limit. If the denied write is the only way to satisfy a finding, emit `blocked` with the intended content in `blockedWrites` (`[{path, reason, content}]`) so a human can apply it; otherwise finish the other findings and report it in the `done` payload's `blockedWrites`.
- After the fixes: full test suites + typecheck + lint for both workspaces, all green.
- Commit the fixes with a conventional message ending in `(#{{issue}})`. Never push; never touch GitHub.

Emit `done` (same payload shape as before — updated chunks list and testsSummary) or `blocked` if a finding is impossible to satisfy.
