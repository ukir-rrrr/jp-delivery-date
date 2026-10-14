import type { LocalDate } from "../calendar/local-date";
import type { Weekday } from "../calendar/business-calendar";
import type { Slot } from "./slot";

export interface SenderProfile {
  name?: string;
  postalCode?: string;
  prefecture?: string;
  address1?: string;
  address2?: string;
  phone?: string;
}

export interface SettingsV1 {
  schemaVersion: 1;
  holidays: LocalDate[];
  newYearPreset: boolean;
  closedWeekdays: Weekday[];
  /** HH:mm in JST. Orders after this cutoff start from tomorrow. */
  cutoff: string;
  slots: Slot[];
  /** Prefecture code → extra calendar days. Missing keys use defaultRegionDays. */
  prefectureLeadDays: Record<string, number>;
  /** Worst-case region offset when prefecture is unknown. */
  defaultRegionDays: number;
  selectableWindowDays: number;
  sender: SenderProfile;
}

export const DEFAULT_SETTINGS_V1: SettingsV1 = {
  schemaVersion: 1,
  holidays: [],
  newYearPreset: true,
  closedWeekdays: [0],
  cutoff: "15:00",
  slots: [
    "morning",
    "afternoon_early",
    "afternoon_late",
    "evening",
    "night",
  ],
  prefectureLeadDays: {},
  defaultRegionDays: 2,
  selectableWindowDays: 30,
  sender: {},
};
