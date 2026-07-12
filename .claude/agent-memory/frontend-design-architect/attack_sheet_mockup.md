---
name: attack-sheet-mockup
description: "#811/#813 attack-sheet final spec (user-approved) in Claude Design project 6cf3e149-051a-46a8-ad98-1a7b22a61c44 — 'Attack Sheet - Final Spec.dc.html' (frames 1-13) + companion '…- Off-hand.dc.html' (frames 14-17); step-rail flow, inline banner resolve, quiet Change row, desktop 42rem modal, off-hand bonus-action variant"
metadata:
  type: reference
---

**AUTHORITATIVE (user-approved 2026-07-12): `Attack Sheet - Final Spec.dc.html`**
in Claude Design project `6cf3e149-051a-46a8-ad98-1a7b22a61c44` —
https://claude.ai/design/p/6cf3e149-051a-46a8-ad98-1a7b22a61c44?file=Attack+Sheet+-+Final+Spec.dc.html
13 frames in journey order: mobile flow (1–6), Turn summary + inline resolve +
quiet Change row (7–11), desktop 42rem modal w/ right rail + turn screen
(12–13). Frames 14–17 (the #813 off-hand bonus-action sheet) live in the
companion canvas `Attack Sheet - Final Spec - Off-hand.dc.html` (split out to
respect the 1000-line file guidance; the spec header links to it). Implement
from these two files. The two earlier files are exploration history only:
`Attack Sheet Redesign.dc.html` (original 7-state flow) and
`Attack Resolve + Desktop.dc.html` (resolve options incl. the REJECTED
reopen-the-sheet alternative in its frame 14 — do not build that).

Off-hand spec (frames 14–17), for #813:

- Same step-rail shell + identical verdict flow; sheet title "Off-hand attack",
  kicker "Two-Weapon Fighting · bonus action". Single form: the Segmented tabs
  collapse to a static "Attacking with · Dagger (off-hand)" header row.
- One swing: no counter pips, no "Skip — roll next attack", no Resume. Footer =
  "Cancel — refund bonus action" pre-roll, "Done" from the roll onward (the
  swing is spent on the to-hit roll, matching recordTwfAttackState).
- TWF damage rule shown honestly: "1d4 piercing — no ability mod (no TWF
  style)"; with the twoWeaponFighting style it reads "1d4 + 3"
  (buildOffHandEntry).
- Tally kicker "This bonus action"; banner lines carry the "(off-hand)" source
  label (e.g. "Dagger (off-hand): hit — to-hit 14 — 3 damage") and resolve
  inline like any line (frame 17 shows it mid-resolve).
- Maneuvers disclosure included — a deliberate functional ADDITION over the
  current InlineOffHandPicker (which omits maneuvers); RAW allows maneuvers on
  any weapon attack. Desktop: same right-rail modal treatment as frame 12,
  minus the counter — annotated, no separate frame.

Visual decisions in the spec (beyond the issue's settled flow decisions):

- **Step-rail layout**: the attack card is one numbered 1-2-3 rail
  (Roll to hit → Call it → Damage) with dot states done/active/pending —
  replaces the two separate Attack/Damage cards. Dropped the 36px icon squares
  (GiCrossedSwords/GiSwordWound) to reclaim width on 390px.
- **Verdict buttons**: "it Missed" quiet (parchment outline), "Crit!"
  garnet-tinted (garnet-50 bg / garnet-200 border / garnet-800 text), both 44px,
  side by side under the to-hit result. Post-damage the row shows a "✓ Hit"
  status chip (arcane-100/800, matching the existing VERDICT_CHIP tones) with
  Crit! still offered.
- **Miss resets immediately** (row collapses dimmed into the tally, card re-arms
  next attack); **hit keeps the card expanded** (riders/maneuvers/re-roll/crit
  upgrade still pending) with a full-width "Roll to hit — attack 2 of 2" button
  below.
- **Attack counter** = kicker "Attacks · N of M remaining" + small pips
  (filled garnet = spent).
- **Tally rule**: display-only for *resolved* verdicts; an **unresolved** row
  keeps a tappable "hit or miss?" (garnet, dotted underline) — same affordance
  as the Turn-summary banner line. Rule: unresolved = tappable everywhere;
  resolved = correctable only via the banner's Change row.
- Maneuvers collapse behind a 44px disclosure row ("Battle Master maneuvers ·
  4 × d8 · Commander's Strike").

Decisions FINAL per user approval 2026-07-12:

- **Hit/Crit resolve on a banner line = inline "Roll damage" button growing on
  the line itself** (reopen-the-sheet alternative REJECTED). Uses the recorded
  form's damage spec; the 3D dice animation still plays (standing user
  preference).
- **Mistaken-verdict recovery**: tapping a *resolved* banner line reveals a
  quiet "Change · Miss · Crit!" row (tap again to hide); resolved lines carry
  no visible affordance, nat-locked lines never offer it; switching to Miss
  drops the damage from the line.
- **Desktop ships in the same build as mobile** (not split): BottomSheet's
  existing centered dialog at md+, widened 36rem → ~42rem, with counter +
  "This action" tally + maneuvers disclosure in a right rail beside the step
  card; hover states on all controls. The Turn-summary widget is deliberately
  identical at every breakpoint (one code path; popover variant rejected).

Left for implementation: expanded maneuver-disclosure state,
InlineSpellAttackSection placement (same collapsed-row treatment), dark-mode
pass, drag/close animation.

Related: [[design-system]] for the token values the spec uses.
