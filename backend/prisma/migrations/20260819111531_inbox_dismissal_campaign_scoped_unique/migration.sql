-- Scope InboxDismissal's identity to campaignId too (#1945 review): the
-- stored campaignId column now actually governs suppression, matching
-- filterDismissed's (kind, campaignId, signature) match key.
DROP INDEX "InboxDismissal_userId_kind_signature_key";
DROP INDEX "InboxDismissal_userId_campaignId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "InboxDismissal_userId_campaignId_kind_signature_key" ON "InboxDismissal"("userId", "campaignId", "kind", "signature");
