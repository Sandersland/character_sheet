---
category: Primitives
---

Segmented-control tab switcher — domain-agnostic and controlled. Renders only
the switcher; the caller renders the active panel below it. Follows the
WAI-ARIA Tabs pattern: `role="tablist"`/`role="tab"`, `aria-selected`, roving
tabindex, and Arrow/Home/End keyboard navigation. Each tab may carry an
optional `badge` (e.g. a count) to the right of its label. The active tab is a
filled garnet pill inside a parchment track.
