/**
 * Internal slot enum. Adapters map these to carrier codes
 * (Yamato 0812/…, Sagawa 01/12/…).
 */
export const SLOTS = [
  "unspecified",
  "morning",
  "afternoon_early",
  "afternoon_late",
  "evening",
  "night",
] as const;

export type Slot = (typeof SLOTS)[number];

export function isSlot(value: string): value is Slot {
  return (SLOTS as readonly string[]).includes(value);
}
