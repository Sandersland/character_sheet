// Entries default to PRIVATE, so another member's entry is visible only once its author chose CAMPAIGN.
export function journalVisibleTo(userId: string) {
  return { OR: [{ authorUserId: userId }, { visibility: "CAMPAIGN" as const }] };
}
