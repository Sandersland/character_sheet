---
name: issues
description: Triage, refine, and label GitHub issues so each is either clearly ready to work or clearly flagged as needing decisions. Use when creating a new issue, refining or triaging the backlog, deciding whether issues are ready to assign, splitting an epic into sub-issues, or applying the readiness labels. Triggers include "refine the issues", "are these issues ready", "triage the backlog", "get the issues ready to work on", "file an issue for X". This is the management/triage counterpart to parallel-issues (which only builds issues already marked `ready`).
---

# issues

How we manage GitHub issues in this repo. The goal is that at any moment you can look at the backlog and know, per issue, whether it is **ready to work** or **still needs a decision** — no reading the whole body to find out. This skill owns *creating, refining, triaging, and labeling*. Building issues is a separate skill (`parallel-issues`), which only consumes issues already marked `ready`.

Use `gh` for all issue operations.

## The readiness labels (the core convention)

Every open issue carries exactly one of these three labels at all times. They are the at-a-glance state.

| Label | Color | Meaning |
|---|---|---|
| `ready` | `2EA043` (green) | Refined and assignable **right now** — clear scope, acceptance criteria, no open decisions. `parallel-issues` will only build these. |
| `needs-refinement` | `D93F0B` (orange) | Has an open decision, ambiguity, or missing scope. Must be refined before it can be worked. Also covers discovery **spikes** (their deliverable is a proposal) and items **backlogged pending a decision**. |
| `epic` | `6F42C1` (purple) | A tracking/parent issue. You don't "work" an epic — you work its sub-issues. The epic body lists them with build order. |

These coexist with the topical labels (`enhancement`, `ux`, `tech-debt`, `testing`, `bug`, `question`, …) — a `ready` issue is also usually `enhancement`, etc. A `question`-labeled issue is typically also `needs-refinement`.

If the labels don't exist yet (fresh clone / new repo), create them:

```bash
gh label create ready            --color 2EA043 --description "Refined and ready to assign/work — no open decisions"
gh label create needs-refinement --color D93F0B --description "Has open decisions/ambiguity — refine before working"
gh label create epic             --color 6F42C1 --description "Tracking/parent issue — work its sub-issues, not the epic itself"
```

## Readiness lifecycle

1. **New issue → `needs-refinement` by default.** A freshly-filed issue is not ready until proven otherwise. Only label it `ready` at creation if it already meets the checklist below.
2. **Refine → promote to `ready`** once it passes the readiness checklist.
3. **An epic is never `ready`** — it's `epic`. Its children carry `ready`/`needs-refinement`.
4. **Re-open the question, re-label.** If new ambiguity surfaces on a `ready` issue, move it back to `needs-refinement`.

## Readiness checklist (what makes an issue `ready`)

An issue is `ready` only when **all** hold:

- [ ] **Scope is concrete** — what to build, not just why. Bullet-level "Scope" section.
- [ ] **Acceptance criteria** are present and checkable.
- [ ] **No open decisions** — every "should we A or B?" is settled in the body (or a dated resolution comment). If a decision is genuinely the user's, ask it and record the answer; don't ship the issue with the fork unresolved.
- [ ] **Code references verified against current code** — file/function/line pointers actually exist (re-grep; don't trust stale line numbers). Note where a claimed thing is *missing* if that's the point.
- [ ] **Dependencies named** — "depends on #N", "blocks #M", and build order if part of an epic.
- [ ] **Honors CLAUDE.md non-negotiables** where relevant (derive-don't-persist, 5e rules only in `lib/`, transaction endpoints, `frontend/src/api/client.ts`, label-helper resolution, level-gated reconcilers).

If any box fails, it stays `needs-refinement` — and the body should say *what's missing* so the next person can close the gap.

## Refining a backlog (the triage pass)

When asked to get issues ready to work on:

1. **Pull them all:** `gh issue list --state open --limit 100 --json number,title,labels,milestone,body`.
2. **Per issue, find the gaps:** open decisions, ambiguous scope, stale/unverified code refs, missing acceptance criteria, epics masquerading as work items.
3. **Resolve what you can; ask what you can't.** Settle technical defaults yourself (record the call). Batch genuinely user-facing product/process decisions into an `AskUserQuestion`.
4. **Record decisions in the issue.** Either edit the body to fold the decision in, or add a dated resolution comment (`**Decision (YYYY-MM-DD):** …`). Convert relative dates to absolute.
5. **Label every issue** with its readiness state. Leave none unlabeled.
6. **Report** the readiness breakdown (counts per label + the not-ready shortlist with the specific blocker each).

## Creating issues

- Default new issues to `needs-refinement` unless they already pass the checklist.
- Include **Why**, **Scope** (checkboxes), **Acceptance criteria** (checkboxes), **Relevant code** (verified paths), and **Dependencies**.
- Add the right topical label(s) alongside the readiness label.

## Splitting an epic

When an issue is too large to assign as one unit:

1. Decide the cut (often by layer: rules/`lib` → backend op → API/serialization → frontend, or by independently-shippable feature).
2. File one sub-issue per slice with its own scope + acceptance criteria + build order, each labeled `ready` or `needs-refinement` on its own merits.
3. Rewrite the parent into a **tracker**: a checklist linking the sub-issues (`- [ ] #123 — …`), the build order, and the cross-cutting non-negotiables. Label the parent `epic`.
4. Keep the parent's "current state / structural readiness" notes so context isn't lost.

## Relationship to parallel-issues

`parallel-issues` is the build pipeline. It **only builds `ready` issues** — it refuses `epic` (points you at the children) and `needs-refinement` (must be refined here first). So the handoff is: refine + label here → hand the `ready` numbers to `parallel-issues`.
