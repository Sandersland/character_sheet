import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// #1406 — a numbered color utility whose ramp step is not declared anywhere is
// silently dropped by Tailwind: no build error, no type error, no runtime
// warning, just an element that renders with nothing applied. A background
// fill on `ink-900` shipped two invisible scrims that way, because `--color-ink`
// is a single fixed label token with NO ramp behind it. Nothing else in the
// toolchain can catch it, so this guard reads the checked-in index.css and
// the checked-in sources and proves every `<prefix>-<family>-<step>` in the app
// resolves to a real declaration.

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(TEST_DIR, "..");
const CSS_PATH = join(SRC_DIR, "index.css");

// Tailwind ships these ramps in its default palette, so a class naming one
// resolves without any @theme declaration of ours.
const BUILTIN_PALETTES = new Set([
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
  "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
]);

// The optional single-letter segment is a side/axis modifier (border-t-garnet-700).
const RAMP_UTILITY =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|divide|placeholder|accent|caret|shadow)(?:-[trblxyse])?-([a-z]+)-(\d{2,3})\b/g;

function declaredRampSteps(css: string): Set<string> {
  const steps = new Set<string>();
  for (const match of css.matchAll(/--color-([a-z]+(?:-[a-z]+)*)-(\d{2,3}):/g)) {
    steps.add(`${match[1]}-${match[2]}`);
  }
  return steps;
}

/** Every ramp utility in `source` whose family-step pair resolves nowhere. */
function findPhantomRampClasses(source: string, declared: Set<string>): string[] {
  const phantoms: string[] = [];
  for (const [utility, family, step] of source.matchAll(RAMP_UTILITY)) {
    if (BUILTIN_PALETTES.has(family)) continue;
    if (declared.has(`${family}-${step}`)) continue;
    phantoms.push(utility);
  }
  return phantoms;
}

function sourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf-8" })
    .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
    .map((entry) => join(SRC_DIR, entry));
}

const declared = declaredRampSteps(readFileSync(CSS_PATH, "utf-8"));
const files = sourceFiles();

describe("phantom color classes (#1406)", () => {
  it("index.css declares a non-trivial set of ramp steps", () => {
    // Anti-vacuity: if the --color-* scan silently returns {} (a renamed token
    // convention, a selector-parse miss), the sweep below would report every
    // utility in the app as a phantom — or, with an inverted check, none at all.
    expect(declared.size).toBeGreaterThan(40);
    expect(declared.has("parchment-100")).toBe(true);
  });

  it("the source sweep actually reaches the app's files", () => {
    // Anti-vacuity: a broken glob yields zero files and a vacuously green sweep.
    expect(files.length).toBeGreaterThan(100);
  });

  it("every numbered color utility in frontend/src resolves to a declared ramp step", () => {
    const offenders: string[] = [];
    let utilitiesSeen = 0;
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      utilitiesSeen += [...source.matchAll(RAMP_UTILITY)].length;
      for (const phantom of findPhantomRampClasses(source, declared)) {
        offenders.push(`${file.slice(SRC_DIR.length + 1)}: ${phantom}`);
      }
    }
    // Anti-vacuity: prove the regex matched real utilities, not that the app
    // happens to contain none for it to judge.
    expect(utilitiesSeen).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });

  it("mutation: a phantom class is reported", () => {
    // Assembled rather than written literally so this file's own text does not
    // trip the whole-tree sweep above.
    const phantom = ["bg", "ink", "900"].join("-");
    expect(findPhantomRampClasses(`className="${phantom}/20"`, declared)).toEqual([phantom]);
  });

  it("mutation: a real ramp step and a Tailwind built-in are both accepted", () => {
    expect(findPhantomRampClasses('className="bg-parchment-100 text-emerald-700"', declared)).toEqual([]);
  });
});
