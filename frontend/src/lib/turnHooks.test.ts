import { describe, expect, it } from "vitest";

import { buffsToAutoEnd, endReminders } from "@/lib/turnHooks";

describe("buffsToAutoEnd — Rage end-condition (#457)", () => {
  it("ends Rage when no attack was made and no damage was taken this turn", () => {
    expect(buffsToAutoEnd(["rage"], { attacked: false, tookDamage: false })).toEqual(["rage"]);
  });

  it("keeps Rage when an attack was made", () => {
    expect(buffsToAutoEnd(["rage"], { attacked: true, tookDamage: false })).toEqual([]);
  });

  it("keeps Rage when damage was taken", () => {
    expect(buffsToAutoEnd(["rage"], { attacked: false, tookDamage: true })).toEqual([]);
  });

  it("returns nothing when Rage is not active, even on an idle turn", () => {
    expect(buffsToAutoEnd([], { attacked: false, tookDamage: false })).toEqual([]);
  });

  it("ignores buff keys with no registered end-condition", () => {
    expect(buffsToAutoEnd(["bless"], { attacked: false, tookDamage: false })).toEqual([]);
  });
});

describe("endReminders — surfaced while a durable buff is active (#457)", () => {
  it("returns the Rage reminder when Rage is active", () => {
    const reminders = endReminders(["rage"]);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].key).toBe("rage");
    expect(reminders[0].reminder).toMatch(/rage/i);
  });

  it("returns nothing when no durable buff with a reminder is active", () => {
    expect(endReminders(["bless"])).toEqual([]);
  });
});
