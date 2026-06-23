---
category: Primitives
---

The app's overlay primitive: a parchment dialog that lifts off the page with
the raised shadow. Portals to `document.body`, traps focus within the panel,
restores focus to the trigger on close, locks body scroll while open, and
closes on Escape or a backdrop click. Close is a text link, consistent with
the app's no-icon-only-controls rule. Always rendered open — mount it
conditionally and dismiss via `onClose`.
