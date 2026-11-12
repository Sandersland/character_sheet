Review pull request {{REPO}}#{{PR}}.

SCOPE: {{MODE}} review. The diff to review is in .review/scope.diff — read it first; the working tree is the PR code, so Read/Grep it for context.
- full: the diff is the whole PR (base...head).
- incremental: the diff is ONLY the commits pushed since your last review (at commit {{BASE}}). Flag issues only in those changes. ALSO read your previous review and inline comments (gh pr view {{PR}} --json reviews,comments; gh api repos/{{REPO}}/pulls/{{PR}}/comments) and check every earlier BLOCKING finding at HEAD: if any is still unfixed, it counts as a finding of this review.

Read the root CLAUDE.md once and hold the change to it — it overrides general preferences.

INVESTIGATE BEFORE JUDGING — a diff alone hides most real bugs, so do all of this before deciding anything:
- Read every changed source file IN FULL at HEAD, not just its hunks.
- For every function, hook, component, prop, or type whose behaviour or signature changed, Grep its callers and read them: a change that is right in isolation is often wrong at a call site the diff never shows.
- Walk the changed logic through realistic edge states (empty/null, the first vs. a later iteration, interrupting an in-progress flow, cancel/undo paths, a resource already spent, both rules editions) and ask what each caller observes.
- Check that the tests touched or added actually exercise the changed branches.

FLAG ONLY HIGH-SIGNAL ISSUES: code that will not compile or type-check; logic that is wrong for realistic inputs or state; a clear CLAUDE.md violation where you can quote the rule; COMMENT DRIFT (a comment, docstring, or schema.prisma model comment the change makes false or strands). Docs under docs/ and CLAUDE.md are pointers, not mirrors: flag them only if this diff makes an existing statement false — never ask for additions describing new code. Do not flag style, naming, subjective improvements, or issues in code the diff did not touch.

VERIFY BEFORE FLAGGING: for each candidate, Read the code at HEAD and confirm the failure path concretely (inputs/state -> wrong result). Never claim a file, symbol, or doc is missing without reading for it. Drop anything you cannot confirm.

OUTPUT:
1. One inline comment per confirmed issue via mcp__github_inline_comment__create_inline_comment with confirmed: true — the defect, the concrete failure, and the fix (a suggestion block only when committing it fixes the issue entirely).
2. ALWAYS finish by submitting exactly one formal review (it records which commit you reviewed, for the next incremental run):
   - findings beyond minor nits: gh pr review {{PR}} --request-changes --body "<summary>"
   - otherwise: gh pr review {{PR}} --comment --body "<summary, or: No issues found ({{MODE}} review).>"
