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
});
