---
name: liveplay-rolling-mockup
description: Approved-direction mockup set for the #942 live-play + rolling redesign (Combat-dissolve + roll-seal), in the Mobile-First IA claude-design project
metadata:
  type: project
---

Design-exploration mockup for the **#942 live-play + dice-rolling redesign** — folding the
separate `/characters/:id/session` page INTO the sheet's swipe/tab workspace so there's one
nav model and no duplicated content.

**Where:** claude-design project "Character Sheet Redesign — Mobile-First IA"
(id `50744e37-1f66-43f6-9e0b-8951d7a9845b`) — same project as the #942 session-doorway
frames, added for continuity. Five plain `.html` board-gallery canvases (NOT `.dc.html`
runtime shape — matching the 13 sibling frames' convention):
`liveplay-1-overview.html` … `liveplay-5-doorway-desktop.html`.

**Committed direction visualized (do not re-litigate):** when a session is live, the existing
**Combat tab dissolves into the live turn tracker** (issue #942 "Combat-dissolve") — no separate
session page. Rolling a save mid-fight = swipe Combat→Overview, roll, swipe back.

**Key execution decisions shown:**
- Overview: kill the full-screen "All 18 Skills" modal; all abilities/saves/18 skills become
  inline roll rows (the root fix for the suppressed-toast problem — no dialog open means the
  result surface is never suppressed).
- Roll result = a themed **parchment "seal"** (garnet wax, serif total), always top-layer,
  replacing the generic toast; Quick vs Animated both land on the same seal; crit=vitality glow,
  nat-1=ashen garnet. ADV/DIS moves onto the roll surface, not a global footer.
- Session-only surfaces rehomed; the #942 doorbar shrinks to a header live-status strip that
  jumps to the Combat tab in-workspace (no route change).

**D1–D4 now DECIDED and applied (revision pass 2026-07-16):**
- D1 = **flat, always-open** skills (grouped by ability). Collapsible alternative dropped.
- D2 = **dim + tap-anywhere** seal dismiss (scrim lighter than a real modal). Other options dropped.
- D3 = **Loot DROPPED from the UI entirely** (ticket to reconsider later); **Log kept** as a small
  secondary sub-nav item beside Turn. Note/Leave/End = the garnet header's `⋯` overflow.
- D4 = header live-strip renders **only OFF the Combat tab** (on Combat the turn tracker is the
  context; its `⋯` controls move into Combat's own garnet panel header). Desktop banner always shows.

**Two corrections also applied:** (1) NO enemy/initiative-order tracking — the app doesn't model
enemies; the invented initiative rail was deleted from canvases 3 AND 5 (desktop). Combat state is
only *not-in-combat* → *your-turn* (round + action economy). (2) The live-Combat turn surface is now
FAITHFUL to the real app (`/characters/:id/session`, reference character `b9f629ea-…c0578ecec9`): the
idle "Roll initiative · Start combat" card; a "Your turn · Round N" card with End turn + three stacked
slots (Action / Bonus Action / Reaction, Reaction's Use in vitality green, each with its own Use); and
the pick-one **BottomSheet** ("Action" · "nothing is spent until you choose" · Attack/Cast/Use item/
Change weapons/Dash|Dodge/More actions). The redesign only re-homes this UI under Combat — it does not
redesign how the tracker presents choices.

Continues the mockup-before-build workflow (see [[attack-sheet-redesign-mockup]],
[[sheet-redesign-epic]], [[journal-redesign-direction]]). Tokens per [[design-system]].
