import type { CartItem } from "./earliest-date";

/** Parse the lead-time snapshot embedded by Liquid. Null means the payload is unusable. */
export function readCartItems(raw: unknown): CartItem[] | null {
  if (!Array.isArray(raw)) return null;
  const items: CartItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    const productId = productIdOf(record.productId);
    const leadTimeDays = leadOf(record.leadTimeDays);
    if (!productId || leadTimeDays === null) return null;
    items.push({ productId, leadTimeDays });
  }
  return items;
}

/**
 * Pair the live cart's product ids with lead times captured from Liquid.
 * Returns null when any product is missing, so the date is not computed early.
 */
export function resolveLeadTimes(
  productIds: readonly string[],
  known: readonly CartItem[],
): CartItem[] | null {
  const leads = new Map<string, number>();
  for (const item of known) {
    const previous = leads.get(item.productId);
    leads.set(
      item.productId,
      previous === undefined ? item.leadTimeDays : Math.max(previous, item.leadTimeDays),
    );
  }
  const items: CartItem[] = [];
  for (const productId of productIds) {
    const leadTimeDays = leads.get(productId);
    if (leadTimeDays === undefined) return null;
    items.push({ productId, leadTimeDays });
  }
  return items;
}

function productIdOf(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return null;
}

function leadOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}
