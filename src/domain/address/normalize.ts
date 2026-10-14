const FULLWIDTH_DIGIT = /[\uFF10-\uFF19]/g;
const FULLWIDTH_LATIN = /[\uFF21-\uFF3A\uFF41-\uFF5A]/g;

/**
 * Width-fold only characters whose half-width form is the same letter, digit,
 * hyphen, or space. 〜 and other non-JIS characters stay, so the row can flag
 * them. The wave dash ～ (U+FF5E, Shift_JIS 81 60) is not an ASCII tilde.
 */
export function normalizeCsvText(value: string): string {
  return value
    .replaceAll("\u3000", " ")
    .replaceAll("\uFF0D", "-")
    .replace(FULLWIDTH_DIGIT, toHalfWidth)
    .replace(FULLWIDTH_LATIN, toHalfWidth)
    .trim();
}

function toHalfWidth(char: string): string {
  return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
}

/** Half-width digits and hyphens, at most 15 characters (B2 phone columns). */
export function normalizePhone(value: string): { value: string; ok: boolean } {
  const half = normalizeCsvText(value).replaceAll(" ", "");
  if (half === "") return { value: "", ok: false };
  return { value: half, ok: /^[0-9-]{1,15}$/.test(half) };
}

/**
 * Seven digits become NNN-NNNN. The B2 layout allows either 7 digits or 8
 * characters with a hyphen (p.1, お届け先郵便番号).
 */
export function normalizePostal(value: string): { value: string; ok: boolean } {
  const half = normalizeCsvText(value).replaceAll(" ", "");
  const digits = half.replaceAll("-", "");
  if (!/^\d{7}$/.test(digits)) return { value: half, ok: false };
  return { value: `${digits.slice(0, 3)}-${digits.slice(3)}`, ok: true };
}
