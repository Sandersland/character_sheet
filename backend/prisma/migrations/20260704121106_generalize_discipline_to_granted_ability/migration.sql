ALTER TABLE "Discipline" RENAME TO "GrantedAbility";
ALTER TABLE "GrantedAbility" RENAME CONSTRAINT "Discipline_pkey" TO "GrantedAbility_pkey";
ALTER INDEX "Discipline_name_key" RENAME TO "GrantedAbility_name_key";
ALTER TABLE "GrantedAbility" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'discipline';
