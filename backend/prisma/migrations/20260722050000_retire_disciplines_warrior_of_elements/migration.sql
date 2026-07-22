-- AlterEnum
BEGIN;
CREATE TYPE "CharacterEventType_new" AS ENUM ('acquired', 'consumed', 'sold', 'bought', 'removed', 'awarded', 'revoked', 'damage', 'heal', 'setTemp', 'shortRest', 'longRest', 'levelUp', 'levelDown', 'deathSave', 'stabilize', 'xpAward', 'xpSet', 'currencyAdjust', 'castSpell', 'expendSlot', 'restoreSlot', 'learnSpell', 'forgetSpell', 'prepareSpell', 'unprepareSpell', 'concentrationDropped', 'convertSorceryPoints', 'classAdded', 'subclassChosen', 'subclassRemoved', 'fightingStyleChosen', 'fightingStyleRemoved', 'classLevelsReconciled', 'spendResource', 'restoreResource', 'initiativeRegen', 'learnManeuver', 'forgetManeuver', 'maneuversReconciled', 'castManeuver', 'castShadowArt', 'castChannelDivinity', 'castStunningStrike', 'imposeOpenHandRider', 'setQuiveringPalm', 'triggerQuiveringPalm', 'toggleElementalAttunement', 'castElementalBurst', 'elementalStrike', 'learnToolProficiency', 'forgetToolProficiency', 'toolProficienciesReconciled', 'learnSubclassChoice', 'forgetSubclassChoice', 'subclassChoicesReconciled', 'abilityScoreImprovement', 'featTaken', 'advancementRemoved', 'advancementsReconciled', 'equipped', 'unequipped', 'attuned', 'unattuned', 'activated', 'deactivated', 'activatedRecharged', 'sessionStarted', 'sessionEnded', 'combatStarted', 'combatEnded', 'combatRoundAdvanced', 'conditionApplied', 'conditionRemoved', 'exhaustionSet', 'buffApplied', 'buffCleared', 'attackRoll', 'damageRoll', 'checkRoll', 'saveRoll', 'initiativeRoll', 'revert');
ALTER TABLE "CharacterEvent" ALTER COLUMN "type" TYPE "CharacterEventType_new" USING ("type"::text::"CharacterEventType_new");
ALTER TYPE "CharacterEventType" RENAME TO "CharacterEventType_old";
ALTER TYPE "CharacterEventType_new" RENAME TO "CharacterEventType";
DROP TYPE "public"."CharacterEventType_old";
COMMIT;

-- AlterTable
ALTER TABLE "GrantedAbility" ALTER COLUMN "source" SET DEFAULT 'maneuver';

