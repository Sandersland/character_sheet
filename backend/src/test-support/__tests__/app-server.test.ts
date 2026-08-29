// Guards #1600: an unlistening app makes supertest bind a new ephemeral port per request, causing rare flaky failures that nothing else in the suite would catch.
import { readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";

import { describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";

describe("the shared test server binds exactly once (#1600)", () => {
  it("serves repeated requests without a single additional listen()", async () => {
    // Counting real binds is the only honest check — request success alone doesn't prove no extra bind occurred.
    const originalListen = http.Server.prototype.listen;
    let binds = 0;
    http.Server.prototype.listen = function patched(this: http.Server, ...args: unknown[]) {
      binds += 1;
      return (originalListen as (...a: unknown[]) => http.Server).apply(this, args);
    } as typeof originalListen;

    try {
      for (let i = 0; i < 5; i += 1) {
        const res = await supertest(app).get("/api/health");
        expect(res.status).toBe(200);
      }
    } finally {
      http.Server.prototype.listen = originalListen;
    }

    expect(binds).toBe(0);
    expect(app.listening).toBe(true);
  });

  it("no test file constructs its own app, in any shape", () => {
    const root = path.resolve(import.meta.dirname, "../..");

    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "generated" ? [] : walk(full);
        return entry.name.endsWith(".test.ts") ? [full] : [];
      });
    }

    // Comment lines are dropped first, or this file's own prose describing the banned shape would report itself as the offender (it did).
    const codeOnly = (source: string) =>
      source
        .split("\n")
        .filter((line) => {
          const t = line.trim();
          return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
        })
        .join("\n");

    // Bans the createApp SYMBOL, not the `supertest(createApp())` call shape — matching the call shape misses indirections like a thunk wrapper.
    const ALLOWED = new Set([
      // Builds its own app under mutated CORS_ORIGIN, which is the thing it asserts.
      "routes/platform/__tests__/cors.test.ts",
    ]);

    const offenders = walk(root)
      .filter((file) => /\bcreateApp\b/.test(codeOnly(readFileSync(file, "utf8"))))
      .map((file) => path.relative(root, file))
      .filter((file) => !ALLOWED.has(file));

    expect(
      offenders,
      "import { app } from '@/test-support/app-server.js' instead — see #1600",
    ).toEqual([]);
  });
});
