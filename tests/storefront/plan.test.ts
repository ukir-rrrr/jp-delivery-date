import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS_V1, type SettingsV1 } from "@domain/delivery/settings";
import { planDeliveryView } from "@storefront/plan-delivery-view";
import type { ZonedInstant } from "@domain/delivery/earliest-date";

const now: ZonedInstant = {
  epochMs: Date.parse("2026-10-14T10:00:00+09:00"),
  timeZone: "Asia/Tokyo",
};

const settings: SettingsV1 = {
  ...DEFAULT_SETTINGS_V1,
  newYearPreset: false,
  holidays: [],
  closedWeekdays: [0],
  cutoff: "15:00",
  defaultRegionDays: 0,
  prefectureLeadDays: { "47": 5 },
  selectableWindowDays: 7,
  slots: ["morning", "evening"],
};

function plan(overrides: Partial<Parameters<typeof planDeliveryView>[0]> = {}) {
  return planDeliveryView({
    now,
    settings,
    items: [],
    prefecture: "",
    required: false,
    locale: "ja",
    date: "",
    slot: "",
    ...overrides,
  });
}

describe("planDeliveryView", () => {
  it("offers dates from the shared engine and clears an empty optional choice", () => {
    const result = plan();
    expect(result.dates[0]?.value).toBe("2026-10-19");
    expect(result.dates[0]?.label).toBe("2026年10月19日（月）");
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "before_cutoff",
      "lead_time",
      "unknown_prefecture",
    ]);
    expect(result.checkoutLocked).toBe(false);
    expect(result.attributes).toMatchObject({ _delivery_date: "", _delivery_slot: "" });
  });

  it("uses a shorter offset when the shopper picks a prefecture", () => {
    const tokyo = plan({
      settings: { ...settings, prefectureLeadDays: { "13": 1, "47": 5 } },
      prefecture: "13",
    });
    expect(tokyo.dates[0]?.value).toBe("2026-10-15");
    expect(tokyo.reasons.map((reason) => reason.code)).toContain("region_days");
  });

  it("locks checkout until a required choice is complete", () => {
    const empty = plan({ required: true });
    expect(empty.checkoutLocked).toBe(true);
    expect(empty.issues.map((issue) => issue.code)).toEqual(["date_required"]);

    const partial = plan({ required: true, date: "2026-10-19" });
    expect(partial.checkoutLocked).toBe(true);
    expect(partial.attributes).toBeNull();

    const complete = plan({ required: true, date: "2026-10-19", slot: "morning" });
    expect(complete.checkoutLocked).toBe(false);
    expect(complete.attributes).toMatchObject({
      配達希望日: "2026/10/19",
      配達時間帯: "午前中",
      _delivery_date: "2026-10-19",
      _delivery_slot: "morning",
      _delivery_v: "1",
    });
  });

  it("drops a date that is no longer selectable", () => {
    const result = plan({ date: "2026-10-14", slot: "morning" });
    expect(result.date).toBe("");
    expect(result.slot).toBe("");
    expect(result.issues.map((issue) => issue.code)).toEqual(["date_not_selectable"]);
    expect(result.attributes).toMatchObject({ _delivery_date: "" });
    expect(result.checkoutLocked).toBe(false);
  });

  it("does not invent a date when settings or lead times are missing", () => {
    expect(plan({ settings: null, required: true }).issues[0]?.code).toBe("settings_invalid");
    expect(plan({ settings: null, required: true }).checkoutLocked).toBe(true);
    expect(plan({ settings: null, required: false }).checkoutLocked).toBe(false);
    expect(plan({ settings: null }).attributes).toBeNull();

    const unknownLead = plan({ items: null, required: true });
    expect(unknownLead.issues[0]?.code).toBe("lead_time_unknown");
    expect(unknownLead.dates).toEqual([]);
    expect(unknownLead.attributes).toBeNull();
  });

  it("locks an optional but incomplete choice", () => {
    const result = plan({ date: "2026-10-19", slot: "" });
    expect(result.checkoutLocked).toBe(true);
    expect(result.attributes).toBeNull();
  });
});
