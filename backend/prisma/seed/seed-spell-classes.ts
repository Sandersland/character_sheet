import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { reconcileSpellClasses } from "../../src/lib/spellcasting/spell-classes.js";

// `prisma` here is seed.ts's own PrismaClient instance, never the src/ singleton reconcileSpellClasses' other caller uses.
export async function seedSpellClassesFor(
  prisma: PrismaClient,
  spellId: string,
  classNames: string[],
): Promise<void> {
  await reconcileSpellClasses(prisma, spellId, classNames);
}
