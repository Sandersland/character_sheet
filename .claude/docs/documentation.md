# How We Write Docs Here

Read this when you're adding or substantially editing any doc, or deciding where a piece of knowledge should live.

This is the house style for documentation in this repo. It optimizes for one thing: **the lowest-drift, lowest-cost home for every fact.** Docs that drift are worse than no docs — an agent that trusts a stale router map ships a bug. The rules below all serve keeping docs cheap to maintain and hard to falsify.

---

## 1. Placement / tiering — lead with this

Every fact has a right altitude. Before writing anything, ask: **"is this at the right altitude?"** The tiers, from highest cost to lowest drift:

| Tier | Where | Cost / drift | Put here only… |
|---|---|---|---|
| **Session-loaded** | `CLAUDE.md` (root) | Loaded **every session** → costs tokens every time | Broad, stable **invariants / contracts**. Ruthlessly trimmed. |
| **On-demand** | `.claude/docs/*.md` | NOT auto-loaded; cost paid only when read | **Cross-cutting** knowledge spanning many files (architecture overview, transaction pattern, leveling reconciliation). |
| **Code-colocated** | comments, docstrings, `schema.prisma` model comments | **Lowest drift** — moves with the code, seen on every edit | Any fact about **ONE** file / function / model. |
| **Outside the repo** | `memory/` | Not loaded for execution | Roadmap, product vision, rationale the agent doesn't need to *do* anything with. |

Rules of thumb:

- **`CLAUDE.md` is the most expensive page in the repo.** A line there is paid for on every single session. It earns its place only if it's a broad invariant a reader must know *before* touching anything (e.g. "derive, don't persist"; "all backend calls go through `client.ts`"). If it's about one file, it does not belong here.
- **An on-demand doc is justified only by cross-cutting scope.** If the knowledge lives in and is about a single file, colocate it as a comment instead — a new `.claude/docs/foo.md` that just restates one module's behavior will rot independently of that module.
- **Code-colocated comments explain *why*, not *what*.** Restating the code (`// increment i`) is noise that drifts. Capturing intent (`// LIFO guard skips ended sessions — frozen history can't be undone`) is durable.
- **`memory/` is for things the agent doesn't execute.** Vision, "why we chose X", deferred roadmap. If acting on it requires a rule, that rule belongs in code or a doc; the memory note just links context.

---

## 2. Invariant over enumeration

Prefer documenting **the pattern + why** (stable) over **listing instances** (volatile — they rot the moment someone adds an op, a route, or an enum value).

- "Every mutable domain follows the intent-bearing transaction pattern: Zod union → `apply*Operations` in one `$transaction` → route re-serializes" is an invariant. It stays true as domains are added.
- A hand-maintained list of all 14 op types is an enumeration. It is wrong the day someone adds the 15th and forgets the doc.

When an enumeration genuinely earns its place — usually for **navigation** (a router map, a lib responsibility table) — **anchor it to its source-of-truth file** with a one-line pointer, so a reader *regenerates* the truth from code rather than *trusting* the list:

> See `schema.prisma` model comments for the detailed snapshot-vs-overlay reasoning.
> The full op set is the Zod union in `routes/inventory.ts` — that file is authoritative.

The anchor makes the enumeration self-correcting: if it ever disagrees with the source, the source wins and the reader knows where to look.

---

## 3. Canonical example

For a concept that recurs across many domains, document **ONE worked example** in depth and point everything else at it.

> `lib/inventory.ts` is the reference implementation for the intent-bearing transaction pattern.

New domains then say "follows the transaction pattern (see `lib/inventory.ts`)" instead of re-describing the whole shape. One canonical write-up to maintain; every other reference is a one-liner that can't drift out of sync with a description it doesn't contain.

---

## 4. Concrete & testable

Every instruction must be **actionable and checkable** — a reader (or a reviewer) can tell at a glance whether it was followed.

- ✅ "Never add `level` as a column — it's derived from `experiencePoints` in `serializeCharacter`." (Checkable: grep the schema.)
- ✅ "All backend calls go through `frontend/src/api/client.ts`; never call `fetch` from a component."
- ❌ "Be careful with leveling." (Unfalsifiable — nobody can verify they complied.)
- ❌ "Try to keep the schema clean."

If you can't phrase a guideline as something a reviewer could fail a PR on, it's probably rationale — move it to `memory/` or cut it.

---

## 5. "Read this when…" routing + token discipline

- **Every on-demand doc opens with a "Read this when…" header** naming the situations that should send a reader here. The reader decides in one line whether to pay the read cost. (See the top of this file, `architecture.md`, `leveling.md`.)
- **Keep `CLAUDE.md` lean; push depth down.** When a `CLAUDE.md` section grows past a stable invariant into procedure or enumeration, extract the depth into an on-demand doc and leave a one-line pointer behind.
- **A new on-demand doc gets exactly one row in the CLAUDE.md Doc-map table** — its filename and its "Read this when…" trigger. That's the only `CLAUDE.md` footprint a new doc should add.

---

## 6. Definition of Done

**Docs and comments are part of "done."** A change isn't complete until the knowledge it invalidates is fixed.

When a change touches a code surface in the **doc-ownership map** (the Doc-map table in `CLAUDE.md`, plus the per-surface mapping the `/doc-sync` skill uses), **update the mapped doc in the same PR.** A new route updates the architecture router map; a new lib module updates the lib table; a new transaction domain updates `CLAUDE.md` + architecture.

This is enforced, not aspirational:

- The **`/doc-sync` skill** audits a change set against the docs it should have touched, updates them in house-style, and offers to file a `documentation` issue for anything out of scope.
- The **PR review gate** runs the same checks automatically on PRs into `main`.

---

## 7. Doc template skeleton

Copy-paste starting point for a new on-demand doc. Stable invariants up top; code-anchored enumerations below, each pointing at its source of truth.

```markdown
# <Title>

Read this when <the situation(s) that should send a reader here>.

---

## Stable: invariants & patterns

<The durable rules and the *why* behind them. This is the bulk of the doc.
Phrase each as concrete & testable. Document patterns, not instance lists.
Point at the canonical example instead of re-describing a recurring shape.>

---

## Code-anchored: enumerations (source of truth: <file>)

<Only the lists that earn their place for navigation. Lead with the pointer
to the authoritative file, then the table. If this list ever disagrees with
<file>, <file> wins — regenerate from there.>
```
