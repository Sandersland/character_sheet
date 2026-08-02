/**
 * Guards the #1600 fix, which is invisible at the assertion level: passing
 * supertest a non-listening app makes it bind a fresh ephemeral port PER
 * REQUEST, and the resulting collisions failed ~3 of every 10 full suite runs
 * with `Parse Error: Expected HTTP/…` or `socket hang up` — in a different test
 * each time, never as an assertion failure. Nothing else in the suite would go
 * red if the per-request bind came back, so these two tests are the only thing
 * standing between a re-introduced `supertest(createApp())` and a fortnight of
 * chasing "flaky" tests again.
 */

import { readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";

import { describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";

describe("the shared test server binds exactly once (#1600)", () => {
  it("serves repeated requests without a single additional listen()", async () => {
    // Counting real binds is the only honest check — the request succeeding
    // proves nothing, because the per-request-bind version succeeded too (~70%
    // of the time). Patching the prototype catches a bind from anywhere,
    // including inside supertest.
    const originalListen = http.Server.prototype.listen;
    let binds = 0;
    http.Server.prototype.listen = function patched(this: http.Server, ...args: unknown[]) {
      binds += 1;
      return (originalListen as (...a: unknown[]) => http.Server).apply(this, args);
    } as typeof originalListen;

    try {
      for (let i = 0; i < 5; i += 1) {
        // /api/health is public, so this needs no fixture or cookie.
        const res = await supertest(app).get("/api/health");
        expect(res.status).toBe(200);
      }
    } finally {
      http.Server.prototype.listen = originalListen;
    }

    expect(binds).toBe(0);
    expect(app.listening).toBe(true);
  });

  it("no test file hands supertest a freshly-constructed app", () => {
    const root = path.resolve(import.meta.dirname, "../..");

    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "generated" ? [] : walk(full);
        return entry.name.endsWith(".test.ts") ? [full] : [];
      });
    }

    // Comment lines are dropped first, or this file's own prose describing the
    // banned shape would report itself as the offender (it did).
    const codeOnly = (source: string) =>
      source
        .split("\n")
        .filter((line) => {
          const t = line.trim();
          return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
        })
        .join("\n");

    // `supertest(createApp())` and `supertest.agent(createApp())` — the two
    // shapes that reintroduce the per-request bind.
    const offenders = walk(root).filter((file) =>
      /supertest(\.agent)?\(\s*createApp\(\)/.test(codeOnly(readFileSync(file, "utf8"))),
    );

    expect(
      offenders.map((f) => path.relative(root, f)),
      "import { app } from '@/test-support/app-server.js' instead — see #1600",
    ).toEqual([]);
  });
});
