---
category: Primitives
---

Horizontal resource meter for HP, spell-slot pools, and limited-use
abilities. The fill width tracks `current / max`, clamped to 0–100%. Color
alone never carries the value — callers render the numeric `current/max` as
text alongside it. Exposes `role="meter"` with `aria-valuenow/min/max`. Three
fill tones: `garnet` (default), `arcane`, `gold`.
