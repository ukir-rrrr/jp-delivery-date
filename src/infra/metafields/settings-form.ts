import { z } from "zod";
import { parseLocalDate } from "../../domain/calendar/local-date";
import type { Weekday } from "../../domain/calendar/business-calendar";
import { PREFECTURES, prefectureByCode } from "../../domain/delivery/region";
import { SLOTS, isSlot } from "../../domain/delivery/slot";
import type { SettingsV1 } from "../../domain/delivery/settings";
import { parseSettings } from "./settings";

const WEEKDAYS = new Set(["0", "1", "2", "3", "4", "5", "6"]);
const MAX_HOLIDAYS = 400;
const MAX_TEXT = 255;

export interface SettingsFieldFailure {
  ok: false;
  formError: string | null;
  fieldErrors: Record<string, string>;
}

export type SettingsFormResult =
  | { ok: true; settings: SettingsV1 }
  | SettingsFieldFailure;

const settingsFormSchema = z
  .object({
    holidays: z.array(z.string()),
    newYearPreset: z.boolean(),
    closedWeekdays: z.array(z.string()),
    cutoff: z.string(),
    slots: z.array(z.string()),
    defaultRegionDays: z.string(),
    selectableWindowDays: z.string(),
    prefectureDays: z.record(z.string(), z.string()),
    senderName: z.string(),
    senderPostalCode: z.string(),
    senderPrefecture: z.string(),
    senderAddress1: z.string(),
    senderAddress2: z.string(),
    senderPhone: z.string(),
    senderYamatoBillingCode: z.string(),
    senderYamatoFreightNumber: z.string(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.holidays.length > MAX_HOLIDAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["holidays"],
        message: "休業日は400件までです。",
      });
    } else {
      const bad = value.holidays.filter((line) => !isLocalDate(line));
      if (bad.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["holidays"],
          message: `日付は YYYY-MM-DD で、1行に1日です。読めない行: ${bad.slice(0, 5).join("、")}`,
        });
      }
    }

    if (value.closedWeekdays.some((day) => !WEEKDAYS.has(day))) {
      ctx.addIssue({
        code: "custom",
        path: ["closedWeekdays"],
        message: "曜日の指定が不正です。",
      });
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.cutoff)) {
      ctx.addIssue({
        code: "custom",
        path: ["cutoff"],
        message: "カットオフは HH:mm（例: 15:00）で入力してください。",
      });
    }

    if (value.slots.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["slots"],
        message: "時間帯を1つ以上選んでください。",
      });
    } else if (value.slots.some((slot) => !isSlot(slot))) {
      ctx.addIssue({
        code: "custom",
        path: ["slots"],
        message: "時間帯の指定が不正です。",
      });
    }

    if (intInRange(value.defaultRegionDays, 0, 366) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultRegionDays"],
        message: "標準の加算日数は 0〜366 の整数です。",
      });
    }
    if (intInRange(value.selectableWindowDays, 1, 366) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["selectableWindowDays"],
        message: "選択できる日数は 1〜366 の整数です。",
      });
    }

    for (const [code, raw] of Object.entries(value.prefectureDays)) {
      if (!prefectureByCode(code) || intInRange(raw, 0, 366) === null) {
        ctx.addIssue({
          code: "custom",
          path: ["prefectureDays", code],
          message: "加算日数は 0〜366 の整数です。空欄は標準日数です。",
        });
      }
    }

    for (const key of [
      "senderName",
      "senderPostalCode",
      "senderPrefecture",
      "senderAddress1",
      "senderAddress2",
      "senderPhone",
      "senderYamatoBillingCode",
      "senderYamatoFreightNumber",
    ] as const) {
      if (value[key].length > MAX_TEXT) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${MAX_TEXT}文字以内で入力してください。`,
        });
      }
    }
  })
  .transform((value) => {
    const sender: SettingsV1["sender"] = {};
    if (value.senderName) sender.name = value.senderName;
    if (value.senderPostalCode) sender.postalCode = value.senderPostalCode;
    if (value.senderPrefecture) sender.prefecture = value.senderPrefecture;
    if (value.senderAddress1) sender.address1 = value.senderAddress1;
    if (value.senderAddress2) sender.address2 = value.senderAddress2;
    if (value.senderPhone) sender.phone = value.senderPhone;
    if (value.senderYamatoBillingCode) sender.yamatoBillingCode = value.senderYamatoBillingCode;
    if (value.senderYamatoFreightNumber) sender.yamatoFreightNumber = value.senderYamatoFreightNumber;

    const prefectureLeadDays: Record<string, number> = {};
    for (const [code, raw] of Object.entries(value.prefectureDays)) {
      prefectureLeadDays[code] = Number(raw);
    }

    return {
      schemaVersion: 1 as const,
      holidays: [...new Set(value.holidays)].sort().map((date) => parseLocalDate(date)),
      newYearPreset: value.newYearPreset,
      closedWeekdays: [...new Set(value.closedWeekdays)]
        .map((day) => Number(day) as Weekday)
        .sort((a, b) => a - b),
      cutoff: value.cutoff,
      slots: SLOTS.filter((slot) => value.slots.includes(slot)),
      prefectureLeadDays,
      defaultRegionDays: Number(value.defaultRegionDays),
      selectableWindowDays: Number(value.selectableWindowDays),
      sender,
    };
  });

/**
 * Turn the settings form into SettingsV1.
 * Zod checks the form. parseSettings is the metafield codec and must accept
 * the result before anything is written.
 */
export function settingsFromForm(form: FormData): SettingsFormResult {
  const parsed = settingsFormSchema.safeParse({
    holidays: lines(form.get("holidays")),
    newYearPreset: form.get("newYearPreset") != null,
    closedWeekdays: form.getAll("closedWeekdays").map(String),
    cutoff: text(form.get("cutoff")),
    slots: form.getAll("slots").map(String),
    defaultRegionDays: text(form.get("defaultRegionDays")),
    selectableWindowDays: text(form.get("selectableWindowDays")),
    prefectureDays: prefectureDays(form),
    senderName: text(form.get("senderName")),
    senderPostalCode: text(form.get("senderPostalCode")),
    senderPrefecture: text(form.get("senderPrefecture")),
    senderAddress1: text(form.get("senderAddress1")),
    senderAddress2: text(form.get("senderAddress2")),
    senderPhone: text(form.get("senderPhone")),
    senderYamatoBillingCode: text(form.get("senderYamatoBillingCode")),
    senderYamatoFreightNumber: text(form.get("senderYamatoFreightNumber")),
  });
  if (!parsed.success) {
    return { ok: false, formError: null, fieldErrors: fieldErrorsOf(parsed.error) };
  }
  try {
    return { ok: true, settings: parseSettings(parsed.data) };
  } catch {
    return {
      ok: false,
      formError: "設定の形式が不正です。",
      fieldErrors: {},
    };
  }
}

function prefectureDays(form: FormData): Record<string, string> {
  const days: Record<string, string> = {};
  for (const prefecture of PREFECTURES) {
    const raw = text(form.get(`prefectureDays.${prefecture.code}`));
    if (raw) days[prefecture.code] = raw;
  }
  return days;
}

function lines(value: FormDataEntryValue | null): string[] {
  return text(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function intInRange(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) return null;
  return value;
}

function isLocalDate(value: string): boolean {
  try {
    parseLocalDate(value);
    return true;
  } catch {
    return false;
  }
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
