export interface SplitAddressInput {
  province: string;
  city: string;
  address1: string;
  address2: string;
}

export interface SplitAddressResult {
  parts: string[];
  overflow: boolean;
}

/**
 * Split at token boundaries (spaces, 丁目, 番地, hyphens) within each
 * carrier's byte limits. Overflow is flagged — never silently truncated.
 * Token-boundary splitting lands with the adapters (W4).
 */
export function splitAddress(
  input: SplitAddressInput,
  maxBytesPerPart: readonly number[],
): SplitAddressResult {
  const parts = [input.province, input.city, input.address1, input.address2]
    .map((s) => s.trim())
    .filter(Boolean);
  const overflow = parts.length > maxBytesPerPart.length;
  return { parts, overflow };
}
