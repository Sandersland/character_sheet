-- CreateTable
CREATE TABLE "CampaignItem" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "ItemCategory" NOT NULL,
    "rarity" TEXT,
    "requiresAttunement" BOOLEAN NOT NULL DEFAULT false,
    "isUnique" BOOLEAN NOT NULL DEFAULT false,
    "weight" DOUBLE PRECISION,
    "cost" JSONB,
    "dmNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignItemWeaponDetail" (
    "id" TEXT NOT NULL,
    "campaignItemId" TEXT NOT NULL,
    "damageDiceCount" INTEGER NOT NULL,
    "damageDiceFaces" INTEGER NOT NULL,
    "damageModifier" INTEGER NOT NULL DEFAULT 0,
    "damageType" TEXT NOT NULL,
    "versatileDiceCount" INTEGER,
    "versatileDiceFaces" INTEGER,
    "finesse" BOOLEAN NOT NULL DEFAULT false,
    "light" BOOLEAN NOT NULL DEFAULT false,
    "heavy" BOOLEAN NOT NULL DEFAULT false,
    "twoHanded" BOOLEAN NOT NULL DEFAULT false,
    "reach" BOOLEAN NOT NULL DEFAULT false,
    "thrown" BOOLEAN NOT NULL DEFAULT false,
    "ammunition" BOOLEAN NOT NULL DEFAULT false,
    "rangeNormal" INTEGER,
    "rangeLong" INTEGER,
    "weaponClass" "WeaponClass",
    "weaponRange" "WeaponRange",

    CONSTRAINT "CampaignItemWeaponDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignItemArmorDetail" (
    "id" TEXT NOT NULL,
    "campaignItemId" TEXT NOT NULL,
    "armorCategory" "ArmorCategory" NOT NULL,
    "baseArmorClass" INTEGER NOT NULL,
    "dexModifierApplies" BOOLEAN NOT NULL DEFAULT false,
    "dexModifierMax" INTEGER,
    "stealthDisadvantage" BOOLEAN NOT NULL DEFAULT false,
    "strengthRequirement" INTEGER,

    CONSTRAINT "CampaignItemArmorDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignItemConsumableDetail" (
    "id" TEXT NOT NULL,
    "campaignItemId" TEXT NOT NULL,
    "effectDiceCount" INTEGER,
    "effectDiceFaces" INTEGER,
    "effectModifier" INTEGER,
    "effectDescription" TEXT,

    CONSTRAINT "CampaignItemConsumableDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignItemLink" (
    "id" TEXT NOT NULL,
    "campaignEntityId" TEXT NOT NULL,
    "campaignItemId" TEXT NOT NULL,

    CONSTRAINT "CampaignItemLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignItem_campaignId_idx" ON "CampaignItem"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignItemWeaponDetail_campaignItemId_key" ON "CampaignItemWeaponDetail"("campaignItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignItemArmorDetail_campaignItemId_key" ON "CampaignItemArmorDetail"("campaignItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignItemConsumableDetail_campaignItemId_key" ON "CampaignItemConsumableDetail"("campaignItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignItemLink_campaignEntityId_key" ON "CampaignItemLink"("campaignEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignItemLink_campaignItemId_key" ON "CampaignItemLink"("campaignItemId");

-- AddForeignKey
ALTER TABLE "CampaignItem" ADD CONSTRAINT "CampaignItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignItemWeaponDetail" ADD CONSTRAINT "CampaignItemWeaponDetail_campaignItemId_fkey" FOREIGN KEY ("campaignItemId") REFERENCES "CampaignItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignItemArmorDetail" ADD CONSTRAINT "CampaignItemArmorDetail_campaignItemId_fkey" FOREIGN KEY ("campaignItemId") REFERENCES "CampaignItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignItemConsumableDetail" ADD CONSTRAINT "CampaignItemConsumableDetail_campaignItemId_fkey" FOREIGN KEY ("campaignItemId") REFERENCES "CampaignItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignItemLink" ADD CONSTRAINT "CampaignItemLink_campaignEntityId_fkey" FOREIGN KEY ("campaignEntityId") REFERENCES "CampaignEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignItemLink" ADD CONSTRAINT "CampaignItemLink_campaignItemId_fkey" FOREIGN KEY ("campaignItemId") REFERENCES "CampaignItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
