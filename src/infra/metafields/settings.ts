import { z } from "zod";
import {
  DEFAULT_SETTINGS_V1,
  type SettingsV1,
} from "../../domain/delivery/settings";

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
  holidays: z.array(z.string()),
  newYearPreset: z.boolean(),
  closedWeekdays: z.array(z.number().int().min(0).max(6)),
  cutoff: z.string(),
  slots: z.array(z.string()),
  prefectureLeadDays: z.record(z.string(), z.number().int()),
  defaultRegionDays: z.number().int(),
  selectableWindowDays: z.number().int(),
  sender: SenderSchema,
});

export function parseSettings(raw: unknown): SettingsV1 {
  const parsed = SettingsV1Schema.parse(raw);
  return parsed as SettingsV1;
}

export function migrate(raw: unknown): SettingsV1 {
  if (raw == null || typeof raw !== "object") {
    return DEFAULT_SETTINGS_V1;
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version === 1) {
    return parseSettings(raw);
  }
  return DEFAULT_SETTINGS_V1;
}
