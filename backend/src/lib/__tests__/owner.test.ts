import { afterEach, describe, expect, it } from "vitest";

import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import { resolveBootstrapOwnerId } from "../owner.js";

describe("resolveBootstrapOwnerId", () => {
  const createdUserIds: string[] = [];
  const originalEmail = process.env.BOOTSTRAP_OWNER_EMAIL;

  afterEach(async () => {
    if (originalEmail === undefined) delete process.env.BOOTSTRAP_OWNER_EMAIL;
    else process.env.BOOTSTRAP_OWNER_EMAIL = originalEmail;
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  it("is idempotent — two calls return the same owner id (env unset)", async () => {
    delete process.env.BOOTSTRAP_OWNER_EMAIL;

    const first = await resolveBootstrapOwnerId();
    const second = await resolveBootstrapOwnerId();

    expect(first).toBe(second);
    // The resolved id is a real user row.
    await expect(
      prisma.user.findUnique({ where: { id: first } }),
    ).resolves.not.toBeNull();
  });

  it("does not throw when BOOTSTRAP_OWNER_EMAIL is unset", async () => {
    delete process.env.BOOTSTRAP_OWNER_EMAIL;
    await expect(resolveBootstrapOwnerId()).resolves.toEqual(expect.any(String));
  });

  it("upserts by BOOTSTRAP_OWNER_EMAIL and is idempotent for that email", async () => {
    const email = `bootstrap-test-${Date.now()}@example.com`;
    process.env.BOOTSTRAP_OWNER_EMAIL = email;

    const first = await resolveBootstrapOwnerId();
    createdUserIds.push(first);
    const second = await resolveBootstrapOwnerId();

    expect(first).toBe(second);
    const user = await prisma.user.findUnique({ where: { id: first } });
    expect(user?.email).toBe(email);
  });
});

describe("AuthAccount @@unique([provider, providerAccountId])", () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  it("rejects a duplicate (provider, providerAccountId) pair", async () => {
    const user = await prisma.user.create({ data: {} });
    createdUserIds.push(user.id);

    await prisma.authAccount.create({
      data: { userId: user.id, provider: "github", providerAccountId: "acct-123" },
    });

    // Second account with the same (provider, providerAccountId) violates the
    // composite unique index (Prisma error code P2002).
    await expect(
      prisma.authAccount.create({
        data: { userId: user.id, provider: "github", providerAccountId: "acct-123" },
      }),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002",
    );
  });
});
