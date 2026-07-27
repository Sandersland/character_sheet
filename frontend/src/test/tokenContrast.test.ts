import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// #994 — mechanical guard for the garnet brand-surface token pair. Reads the
// checked-in CSS (not a duplicated color table) so the test can only pass by
// the actual tokens clearing the bars, never by a copy drifting from them.
// Self-contained on purpose: this contrast math has no production consumer,
// so it lives here rather than in a lib/ module fallow would flag as dead.

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = join(TEST_DIR, "..", "index.css");

function extractBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const bodyStart = css.indexOf("{", start) + 1;
  const bodyEnd = css.indexOf("\n}", bodyStart);
  const body = css.slice(bodyStart, bodyEnd);
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    tokens[match[1]] = match[2].toLowerCase();
  }
  return tokens;
}

function hexToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * hexToLinear(r) + 0.7152 * hexToLinear(g) + 0.0722 * hexToLinear(b);
}

// WCAG 2.x contrast ratio, sRGB. Order-independent (lighter over darker).
function ratio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

const css = readFileSync(CSS_PATH, "utf-8");
const light = extractBlock(css, "@theme");
// Dark overrides only the tokens that differ; everything else falls through
// to the @theme (light) declaration via normal CSS cascade — mirror that here
// so `dark["garnet-on-surface"]` resolves to the light value, same as the browser.
const dark = { ...light, ...extractBlock(css, '[data-theme="dark"]') };

const THEMES = { light, dark } as const;

describe("garnet brand-surface tokens (#994)", () => {
  it("light values are byte-identical to the ramp they were copied from", () => {
    // A stronger proof of "light mode unchanged" than any screenshot: if this
    // assertion holds, every migrated fill resolves to the exact hex it did
    // before the migration, in light mode, full stop.
    expect(light["garnet-surface"]).toBe(light["garnet-700"]);
    expect(light["garnet-surface-hover"]).toBe(light["garnet-800"]);
    expect(light["garnet-surface-deep"]).toBe(light["garnet-900"]);
    expect(light["garnet-on-surface"]).toBe(light["parchment-50"]);
    expect(light["garnet-on-surface-dim"]).toBe(light["garnet-100"]);
  });

  it("--color-garnet-on-surface is absent from the dark block", () => {
    // Theme-invariance enforced structurally: on-surface must NOT be
    // redeclared under [data-theme="dark"], so it falls through to the same
    // #faf9f7 as light — that's the actual fix for the salmon-label bug.
    const darkOnly = extractBlock(css, '[data-theme="dark"]');
    expect(darkOnly["garnet-on-surface"]).toBeUndefined();
  });

  for (const [name, tokens] of Object.entries(THEMES)) {
    it(`${name}: on-surface clears 4.5:1 against surface/-hover/-deep`, () => {
      expect(ratio(tokens["garnet-on-surface"], tokens["garnet-surface"])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(tokens["garnet-on-surface"], tokens["garnet-surface-hover"])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(tokens["garnet-on-surface"], tokens["garnet-surface-deep"])).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: on-surface-dim clears 4.5:1 against surface and -deep`, () => {
      expect(ratio(tokens["garnet-on-surface-dim"], tokens["garnet-surface"])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(tokens["garnet-on-surface-dim"], tokens["garnet-surface-deep"])).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: surface clears 3:1 (SC 1.4.11) against the page and the card`, () => {
      // parchment-100 is the page background, parchment-50 is the Card surface
      // brand fills sit on — the two backgrounds a resting fill must read as a
      // shape against. parchment-200 (meter tracks) is deliberately excluded:
      // MeterBar stays on garnet-600 (2.65:1 vs its own track) — see #994 follow-up.
      expect(ratio(tokens["garnet-surface"], tokens["parchment-100"])).toBeGreaterThanOrEqual(3);
      expect(ratio(tokens["garnet-surface"], tokens["parchment-50"])).toBeGreaterThanOrEqual(3);
    });

    it(`${name}: hover darkens relative to resting (never lightens)`, () => {
      // Encodes "hover darkens in both themes" — the invariant that stops
      // someone lightening the dark hover value and silently breaking the
      // on-surface/-hover contrast bar above.
      expect(relativeLuminance(tokens["garnet-surface-hover"])).toBeLessThan(
        relativeLuminance(tokens["garnet-surface"]),
      );
    });
  }

  it("mutation: dark surface -> today's salmon fails the text bar", () => {
    const mutated: Record<string, string> = { ...dark, "garnet-surface": dark["garnet-700"] }; // #f5868c
    expect(ratio(mutated["garnet-on-surface"], mutated["garnet-surface"])).toBeLessThan(4.5);
  });

  it("mutation: dark surface -> deep garnet fails the page-boundary bar", () => {
    const mutated: Record<string, string> = { ...dark, "garnet-surface": "#8a041a" };
    expect(ratio(mutated["garnet-surface"], mutated["parchment-100"])).toBeLessThan(3);
  });

  it("mutation: light surface -> the issue's original garnet-600 value breaks light-lock", () => {
    const mutated: Record<string, string> = { ...light, "garnet-surface": "#cf1124" };
    expect(mutated["garnet-surface"]).not.toBe(mutated["garnet-700"]);
  });
});
