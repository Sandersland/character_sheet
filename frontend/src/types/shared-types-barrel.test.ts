/**
 * Guards the @/types/character barrel's surface for the wire types that now live
 * in shared-types (#1273). Every migrated name must stay reachable from the
 * barrel: hundreds of call sites import from there, and a dropped re-export in a
 * types/character/*.ts module would otherwise only surface as scattered errors.
 * The import list below IS the assertion — tsc fails if a name stops resolving.
 */

import { describe, expectTypeOf, it } from "vitest";

import type * as Shared from "@character-sheet/shared-types";
import type {
  ClassStartingEquipment,
  EquipmentBundle,
  OpenWeaponPick,
} from "@/types/character";
import type {
  CastElementalBurstOperation,
  ElementalDamageType,
  ElementalStrikeOperation,
  ForgetManeuverOperation,
  ForgetSubclassChoiceOperation,
  ForgetToolProficiencyOperation,
  LearnManeuverOperation,
  LearnSubclassChoiceOperation,
  LearnToolProficiencyOperation,
  ResourceOperation,
  ResourceOpResult,
  RestoreResourceOperation,
  RollInitiativeOperation,
  SpendResourceOperation,
  ToggleElementalAttunementOperation,
  WarriorOfElementsOperation,
  WarriorOfElementsResult,
} from "@/types/character";
import type {
  AdvantageOn,
  ArmorCategory,
  ArmorDetailInput,
  AttunementPrereqKind,
  CampaignRecap,
  CapabilityDice,
  CapabilityKind,
  CapabilityOp,
  CapabilityTarget,
  CastResource,
  CastStatMode,
  ChargeTrigger,
  GrantType,
  GrantValueKind,
  ItemAdvantageGrant,
  ItemCapability,
  ItemCategory,
  ItemProficiencyGrant,
  ParticipantSummary,
  ProficiencyKind,
  SessionDoorwayKind,
  SessionDoorwaySessionState,
  SessionDoorwayState,
  SessionSummary,
  SessionSummaryAdvancement,
  SessionSummaryItem,
  WeaponClass,
  WeaponDetailInput,
  WeaponRange,
} from "@/types/character";

describe("@/types/character barrel", () => {
  it("re-exports the shared session wire types", () => {
    expectTypeOf<CampaignRecap>().toEqualTypeOf<Shared.CampaignRecap>();
    expectTypeOf<ParticipantSummary>().toEqualTypeOf<Shared.ParticipantSummary>();
    expectTypeOf<SessionDoorwayKind>().toEqualTypeOf<Shared.SessionDoorwayKind>();
    expectTypeOf<SessionDoorwaySessionState>().toEqualTypeOf<Shared.SessionDoorwaySessionState>();
    expectTypeOf<SessionDoorwayState>().toEqualTypeOf<Shared.SessionDoorwayState>();
    expectTypeOf<SessionSummary>().toEqualTypeOf<Shared.SessionSummary>();
    expectTypeOf<SessionSummaryAdvancement>().toEqualTypeOf<Shared.SessionSummaryAdvancement>();
    expectTypeOf<SessionSummaryItem>().toEqualTypeOf<Shared.SessionSummaryItem>();
  });

  it("re-exports the shared item + capability wire types", () => {
    expectTypeOf<AdvantageOn>().toEqualTypeOf<Shared.AdvantageOn>();
    expectTypeOf<ArmorCategory>().toEqualTypeOf<Shared.ArmorCategory>();
    expectTypeOf<ArmorDetailInput>().toEqualTypeOf<Shared.ArmorDetailInput>();
    expectTypeOf<AttunementPrereqKind>().toEqualTypeOf<Shared.AttunementPrereqKind>();
    expectTypeOf<CapabilityDice>().toEqualTypeOf<Shared.CapabilityDice>();
    expectTypeOf<CapabilityKind>().toEqualTypeOf<Shared.CapabilityKind>();
    expectTypeOf<CapabilityOp>().toEqualTypeOf<Shared.CapabilityOp>();
    expectTypeOf<CapabilityTarget>().toEqualTypeOf<Shared.CapabilityTarget>();
    expectTypeOf<CastResource>().toEqualTypeOf<Shared.CastResource>();
    expectTypeOf<CastStatMode>().toEqualTypeOf<Shared.CastStatMode>();
    expectTypeOf<ChargeTrigger>().toEqualTypeOf<Shared.ChargeTrigger>();
    expectTypeOf<GrantType>().toEqualTypeOf<Shared.GrantType>();
    expectTypeOf<GrantValueKind>().toEqualTypeOf<Shared.GrantValueKind>();
    expectTypeOf<ItemAdvantageGrant>().toEqualTypeOf<Shared.ItemAdvantageGrant>();
    // The frontend's ItemCapability is the shared SerializedCapability aliased.
    expectTypeOf<ItemCapability>().toEqualTypeOf<Shared.SerializedCapability>();
    expectTypeOf<ItemCategory>().toEqualTypeOf<Shared.ItemCategory>();
    expectTypeOf<ItemProficiencyGrant>().toEqualTypeOf<Shared.ItemProficiencyGrant>();
    expectTypeOf<ProficiencyKind>().toEqualTypeOf<Shared.ProficiencyKind>();
    expectTypeOf<WeaponClass>().toEqualTypeOf<Shared.WeaponClass>();
    expectTypeOf<WeaponDetailInput>().toEqualTypeOf<Shared.WeaponDetailInput>();
    expectTypeOf<WeaponRange>().toEqualTypeOf<Shared.WeaponRange>();
  });

  it("re-exports the shared class-resource + elements wire types", () => {
    expectTypeOf<CastElementalBurstOperation>().toEqualTypeOf<Shared.CastElementalBurstOperation>();
    expectTypeOf<ElementalDamageType>().toEqualTypeOf<Shared.ElementalDamageType>();
    expectTypeOf<ElementalStrikeOperation>().toEqualTypeOf<Shared.ElementalStrikeOperation>();
    expectTypeOf<ForgetManeuverOperation>().toEqualTypeOf<Shared.ForgetManeuverOperation>();
    expectTypeOf<ForgetSubclassChoiceOperation>().toEqualTypeOf<Shared.ForgetSubclassChoiceOperation>();
    expectTypeOf<ForgetToolProficiencyOperation>().toEqualTypeOf<Shared.ForgetToolProficiencyOperation>();
    expectTypeOf<LearnManeuverOperation>().toEqualTypeOf<Shared.LearnManeuverOperation>();
    expectTypeOf<LearnSubclassChoiceOperation>().toEqualTypeOf<Shared.LearnSubclassChoiceOperation>();
    expectTypeOf<LearnToolProficiencyOperation>().toEqualTypeOf<Shared.LearnToolProficiencyOperation>();
    expectTypeOf<ResourceOperation>().toEqualTypeOf<Shared.ResourceOperation>();
    // The frontend's ResourceOpResult is the shared ResourceOpAudit aliased.
    expectTypeOf<ResourceOpResult>().toEqualTypeOf<Shared.ResourceOpAudit>();
    expectTypeOf<RestoreResourceOperation>().toEqualTypeOf<Shared.RestoreResourceOperation>();
    expectTypeOf<RollInitiativeOperation>().toEqualTypeOf<Shared.RollInitiativeOperation>();
    expectTypeOf<SpendResourceOperation>().toEqualTypeOf<Shared.SpendResourceOperation>();
    expectTypeOf<ToggleElementalAttunementOperation>().toEqualTypeOf<Shared.ToggleElementalAttunementOperation>();
    expectTypeOf<WarriorOfElementsOperation>().toEqualTypeOf<Shared.WarriorOfElementsOperation>();
    expectTypeOf<WarriorOfElementsResult>().toEqualTypeOf<Shared.WarriorOfElementsResult>();
  });

  it("re-exports the shared starting-equipment wire types", () => {
    expectTypeOf<ClassStartingEquipment>().toEqualTypeOf<Shared.ClassStartingEquipment>();
    expectTypeOf<EquipmentBundle>().toEqualTypeOf<Shared.EquipmentBundle>();
    expectTypeOf<OpenWeaponPick>().toEqualTypeOf<Shared.OpenWeaponPick>();
  });
});
