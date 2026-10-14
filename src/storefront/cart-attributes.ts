import { DELIVERY_ATTRIBUTE_KEYS } from "@domain/delivery/attributes";

export function sameAttributes(
  current: Record<string, unknown> | null | undefined,
  next: Record<string, string>,
): boolean {
  const cart = current ?? {};
  for (const key of DELIVERY_ATTRIBUTE_KEYS) {
    const left = cart[key] == null ? "" : String(cart[key]);
    if (left !== (next[key] ?? "")) return false;
  }
  return true;
}

export function choiceFromAttributes(attributes: Record<string, unknown> | null | undefined): {
  date: string;
  slot: string;
} {
  const cart = attributes ?? {};
  const date = cart._delivery_date;
  const slot = cart._delivery_slot;
  return {
    date: typeof date === "string" ? date : "",
    slot: typeof slot === "string" ? slot : "",
  };
}
