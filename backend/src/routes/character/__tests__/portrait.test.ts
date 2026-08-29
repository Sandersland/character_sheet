import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { __resetBlobStoreForTests, createBlobStore } from "@/lib/storage/index.js";
import { PORTRAIT_CACHE_CONTROL, PORTRAIT_FIELD } from "@/lib/storage/portrait-http.js";

const OWNER = { id: "portrait-owner", email: "portrait-owner@test.local" };
const INTRUDER = { id: "portrait-intruder", email: "portrait-intruder@test.local" };
const CHARACTER_ID = "portrait-test-character";
const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

let ownerCookie: string;
let intruderCookie: string;

async function jpegFixture(): Promise<Buffer> {
  // EXIF orientation 6 (90° CW): .rotate() bakes it in (600x800 → fit-inside-512 → 384x512); sharp's metadata strip drops the EXIF block.
  return sharp({ create: { width: 800, height: 600, channels: 3, background: "#8b1a1a" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

async function pngFixture(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 64, channels: 4, background: "#1a8b2a" } })
    .png()
    .toBuffer();
}

function post(cookie: string, characterId = CHARACTER_ID) {
  return supertest.agent(app).set("Cookie", cookie).post(`/api/characters/${characterId}/portrait`);
}

async function uploadPortrait(
  cookie: string,
  buffer: Buffer,
  contentType: string,
  characterId = CHARACTER_ID,
) {
  return post(cookie, characterId).attach(PORTRAIT_FIELD, buffer, { filename: "upload.bin", contentType });
}

async function storedKey(): Promise<string | null> {
  const row = await prisma.character.findUniqueOrThrow({
    where: { id: CHARACTER_ID },
    select: { portraitKey: true },
  });
  return row.portraitKey;
}

describe("portrait endpoints (#1615)", () => {
  beforeEach(async () => {
    // __resetBlobStoreForTests clears getBlobStore's memo so each test re-reads the stubbed env — otherwise every test would write into the first test's tmpdir.
    vi.stubEnv("BLOB_STORE_DRIVER", "fs");
    vi.stubEnv("BLOB_FS_DIR", await mkdtemp(path.join(os.tmpdir(), "portrait-route-test-")));
    __resetBlobStoreForTests();

    for (const user of [OWNER, INTRUDER]) {
      await prisma.user.upsert({ where: { id: user.id }, create: user, update: user });
    }
    ownerCookie = await authCookie(OWNER.id);
    intruderCookie = await authCookie(INTRUDER.id);

    await prisma.character.create({
      data: {
        id: CHARACTER_ID,
        name: "Portrait Fixture",
        alignment: "True Neutral",
        experiencePoints: 0,
        initiativeBonus: 0,
        speed: 30,
        hitPoints: { current: 10, max: 10, temp: 0 },
        hitDice: { total: 1, die: "d8" },
        abilityScores: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        savingThrowProficiencies: [],
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        spellcasting: Prisma.JsonNull,
        owner: { connect: { id: OWNER.id } },
        raceSelection: { create: { name: "Portrait Race" } },
        backgroundSelection: { create: { name: "Portrait Background" } },
        classEntries: { create: [{ name: "Portrait Class", position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CHARACTER_ID } });
    vi.unstubAllEnvs();
    __resetBlobStoreForTests();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [OWNER.id, INTRUDER.id] } } });
  });

  describe("POST /api/characters/:id/portrait", () => {
    it("re-encodes an oriented oversized JPEG to a ≤512px EXIF-free webp and returns the serialized character", async () => {
      const response = await uploadPortrait(ownerCookie, await jpegFixture(), "image/jpeg");

      expect(response.status).toBe(200);
      expect(response.body.portraitUrl).toMatch(
        new RegExp(`^/api/characters/${CHARACTER_ID}/portrait\\?v=${UUID_RE}$`),
      );
      // Full serialized character, not a portrait-only payload.
      expect(response.body.id).toBe(CHARACTER_ID);
      expect(response.body.level).toBe(1);

      const served = await supertest
        .agent(app)
        .set("Cookie", ownerCookie)
        .get(`/api/characters/${CHARACTER_ID}/portrait`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      expect(served.status).toBe(200);
      expect(served.headers["content-type"]).toBe("image/webp");
      expect(served.headers["cache-control"]).toBe(PORTRAIT_CACHE_CONTROL);
      expect(PORTRAIT_CACHE_CONTROL).toBe("private, max-age=31536000, immutable");
      expect(Number(served.headers["content-length"])).toBe((served.body as Buffer).length);

      const metadata = await sharp(served.body as Buffer).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBe(384);
      expect(metadata.height).toBe(512);
      expect(metadata.exif).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
    });

    it("rejects PNG bytes declared as image/jpeg with 400", async () => {
      const response = await uploadPortrait(ownerCookie, await pngFixture(), "image/jpeg");

      expect(response.status).toBe(400);
      expect(await storedKey()).toBeNull();
    });

    it("rejects undecodable bytes declared as image/png with 400", async () => {
      const response = await uploadPortrait(
        ownerCookie,
        Buffer.from("definitely not an image, not even close"),
        "image/png",
      );

      expect(response.status).toBe(400);
      expect(await storedKey()).toBeNull();
    });

    it("rejects an SVG (sniffable but outside the whitelist) with 400", async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
      const response = await uploadPortrait(ownerCookie, svg, "image/svg+xml");

      expect(response.status).toBe(400);
      expect(await storedKey()).toBeNull();
    });

    it("rejects a body over the 5 MB cap with 413", async () => {
      const response = await uploadPortrait(ownerCookie, Buffer.alloc(6 * 1024 * 1024), "image/png");

      expect(response.status).toBe(413);
      expect(await storedKey()).toBeNull();
    });

    it("rejects a request with no portrait file part with 400", async () => {
      const response = await post(ownerCookie).send();

      expect(response.status).toBe(400);
    });

    it("rejects a file sent under the wrong field name with 400", async () => {
      const response = await post(ownerCookie).attach("avatar", await pngFixture(), {
        filename: "p.png",
        contentType: "image/png",
      });

      expect(response.status).toBe(400);
    });

    it("replaces the previous portrait: new ?v=, old blob deleted", async () => {
      const first = await uploadPortrait(ownerCookie, await jpegFixture(), "image/jpeg");
      expect(first.status).toBe(200);
      const firstKey = await storedKey();
      expect(firstKey).not.toBeNull();

      const second = await uploadPortrait(ownerCookie, await pngFixture(), "image/png");
      expect(second.status).toBe(200);
      expect(second.body.portraitUrl).not.toBe(first.body.portraitUrl);

      const store = createBlobStore();
      expect(await store.exists(firstKey as string)).toBe(false);
      expect(await store.exists((await storedKey()) as string)).toBe(true);
    });

    it("403s a non-owner without touching the character", async () => {
      const response = await uploadPortrait(intruderCookie, await pngFixture(), "image/png");

      expect(response.status).toBe(403);
      expect(await storedKey()).toBeNull();
    });

    it("404s an unknown character", async () => {
      const response = await uploadPortrait(ownerCookie, await pngFixture(), "image/png", "does-not-exist");

      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/characters/:id/portrait", () => {
    it("404s when the character has no portrait", async () => {
      const response = await supertest
        .agent(app)
        .set("Cookie", ownerCookie)
        .get(`/api/characters/${CHARACTER_ID}/portrait`);

      expect(response.status).toBe(404);
    });

    it("403s a non-owner", async () => {
      await uploadPortrait(ownerCookie, await pngFixture(), "image/png");

      const response = await supertest
        .agent(app)
        .set("Cookie", intruderCookie)
        .get(`/api/characters/${CHARACTER_ID}/portrait`);

      expect(response.status).toBe(403);
    });

    it("404s an unknown character", async () => {
      const response = await supertest
        .agent(app)
        .set("Cookie", ownerCookie)
        .get("/api/characters/does-not-exist/portrait");

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/characters/:id/portrait", () => {
    it("nulls the key, deletes the blob, and returns the serialized character", async () => {
      await uploadPortrait(ownerCookie, await pngFixture(), "image/png");
      const key = await storedKey();
      expect(key).not.toBeNull();

      const response = await supertest
        .agent(app)
        .set("Cookie", ownerCookie)
        .delete(`/api/characters/${CHARACTER_ID}/portrait`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(CHARACTER_ID);
      expect(response.body.portraitUrl).toBeUndefined();
      expect(await storedKey()).toBeNull();
      expect(await createBlobStore().exists(key as string)).toBe(false);

      const get = await supertest
        .agent(app)
        .set("Cookie", ownerCookie)
        .get(`/api/characters/${CHARACTER_ID}/portrait`);
      expect(get.status).toBe(404);
    });

    it("is idempotent when no portrait is stored", async () => {
      const response = await supertest
        .agent(app)
        .set("Cookie", ownerCookie)
        .delete(`/api/characters/${CHARACTER_ID}/portrait`);

      expect(response.status).toBe(200);
      expect(response.body.portraitUrl).toBeUndefined();
    });

    it("403s a non-owner", async () => {
      await uploadPortrait(ownerCookie, await pngFixture(), "image/png");

      const response = await supertest
        .agent(app)
        .set("Cookie", intruderCookie)
        .delete(`/api/characters/${CHARACTER_ID}/portrait`);

      expect(response.status).toBe(403);
      expect(await storedKey()).not.toBeNull();
    });
  });

  it("DELETE /api/characters/:id also deletes the portrait blob", async () => {
    await uploadPortrait(ownerCookie, await pngFixture(), "image/png");
    const key = await storedKey();
    expect(key).not.toBeNull();

    const response = await supertest
      .agent(app)
      .set("Cookie", ownerCookie)
      .delete(`/api/characters/${CHARACTER_ID}`);

    expect(response.status).toBe(204);
    expect(await createBlobStore().exists(key as string)).toBe(false);
  });
});
