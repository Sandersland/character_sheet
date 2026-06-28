import { prisma } from "../../prisma.js";
import type { TokenColumns } from "./flow.js";
import type { AuthProvider, NormalizedProfile } from "./types.js";

// Resolve the user a callback should authenticate, and persist the account.
//   - Signed in: link the provider account to the current user, but only when
//     the email is verified (mapProfile already nulled an unverified email).
//     The session stays on the current user either way.
//   - Not signed in: upsert by (provider, providerAccountId) ONLY — never merge
//     by email — minting a fresh User on first sight.
// Tokens are refreshed on every callback.
export async function resolveUserId(
  provider: AuthProvider,
  profile: NormalizedProfile,
  tokens: TokenColumns,
  currentUserId: string | null,
): Promise<string> {
  if (currentUserId) {
    if (profile.email !== null) {
      await prisma.authAccount.upsert({
        where: {
          provider_providerAccountId: {
            provider: provider.id,
            providerAccountId: profile.providerAccountId,
          },
        },
        create: {
          userId: currentUserId,
          provider: provider.id,
          providerAccountId: profile.providerAccountId,
          ...tokens,
        },
        // Never reassign userId on an existing link: if this (provider,
        // providerAccountId) already belongs to another user, refresh only the
        // tokens — silently transferring ownership would be account-link theft.
        update: tokens,
      });
    }
    return currentUserId;
  }

  const account = await prisma.authAccount.upsert({
    where: {
      provider_providerAccountId: {
        provider: provider.id,
        providerAccountId: profile.providerAccountId,
      },
    },
    create: {
      provider: provider.id,
      providerAccountId: profile.providerAccountId,
      ...tokens,
      user: {
        create: {
          email: profile.email,
          name: profile.name,
          imageUrl: profile.imageUrl,
        },
      },
    },
    update: tokens,
  });
  return account.userId;
}
