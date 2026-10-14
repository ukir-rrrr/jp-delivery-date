import { z } from "zod";
import { parseLocalDate } from "../../domain/calendar/local-date";
import { isSlot, type Slot } from "../../domain/delivery/slot";
import {
  DEFAULT_SETTINGS_V1,
  type SettingsV1,
} from "../../domain/delivery/settings";

const WeekdaySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

const SenderSchema = z
  .object({
    name: z.string().optional(),
    postalCode: z.string().optional(),
    prefecture: z.string().optional(),
    address1: z.string().optional(),
    address2: z.string().optional(),
    phone: z.string().optional(),
  })
  .partial();

export const SettingsV1Schema = z.object({
  schemaVersion: z.literal(1),
  holidays: z.array(z.string().transform(parseLocalDate)),
  newYearPreset: z.boolean(),
  closedWeekdays: z.array(WeekdaySchema),
  cutoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  slots: z.array(z.custom<Slot>((v) => typeof v === "string" && isSlot(v))),
  prefectureLeadDays: z.record(z.string(), z.number().int()),
  defaultRegionDays: z.number().int(),
  selectableWindowDays: z.number().int().positive(),
  sender: SenderSchema,
});

export function parseSettings(raw: unknown): SettingsV1 {
  return SettingsV1Schema.parse(raw);
}

export function migrate(raw: unknown): SettingsV1 {
  if (raw == null) {
    return DEFAULT_SETTINGS_V1;
  }
  if (typeof raw !== "object") {
    throw new Error("settings metafield is not an object");
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version === 1) {
    return parseSettings(raw);
  }
  throw new Error(`unsupported settings schemaVersion: ${String(version)}`);
}
