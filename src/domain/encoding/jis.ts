import iconv from "iconv-lite";

/**
 * JIS X 0208 level 1/2, plus the non-kanji rows of JIS X 0208 (kana, symbols)
 * and JIS X 0201 (ASCII, half-width katakana).
 *
 * iconv-lite's "shiftjis" table is CP932. It round-trips 髙, 﨑, and ①, which
 * are outside JIS X 0208, so a round-trip alone is not the check. Bytes in the
 * CP932 extension (lead byte 0xF0–0xFC, or JIS rows 9–15 and 85–94) are rejected.
 * Row 13 is where CP932 stores ①. 髙 lives at 0xFBFC.
 */
export function isJisX0208OrX0201(char: string): boolean {
  const encoded = iconv.encode(char, "shiftjis");
  if (iconv.decode(encoded, "shiftjis") !== char) return false;
  if (encoded.length === 1) {
    const byte = encoded[0] ?? 0;
    return (byte >= 0x20 && byte <= 0x7e) || (byte >= 0xa1 && byte <= 0xdf);
  }
  if (encoded.length !== 2) return false;
  const row = jisRow(encoded[0] ?? 0, encoded[1] ?? 0);
  if (row == null) return false;
  return (row >= 1 && row <= 8) || (row >= 16 && row <= 84);
}

export function shiftJisByteLength(value: string): number | null {
  let total = 0;
  for (const char of value) {
    if (!isJisX0208OrX0201(char)) return null;
    total += iconv.encode(char, "shiftjis").length;
  }
  return total;
}

export function isShiftJisText(value: string): boolean {
  // CR/LF are JIS X 0201 C0 controls and the RFC 4180 record separator.
  // They stay illegal inside a cell: isJisX0208OrX0201 still rejects them.
  for (const char of value) {
    if (char === "\r" || char === "\n") continue;
    if (!isJisX0208OrX0201(char)) return false;
  }
  return true;
}

function jisRow(lead: number, trail: number): number | null {
  const leadOk = (lead >= 0x81 && lead <= 0x9f) || (lead >= 0xe0 && lead <= 0xef);
  const trailOk = (trail >= 0x40 && trail <= 0x7e) || (trail >= 0x80 && trail <= 0xfc);
  if (!leadOk || !trailOk) return null;
  let j1 = lead;
  let j2 = trail;
  if (j1 >= 0xe0) j1 -= 0x40;
  j1 -= 0x81;
  j1 = j1 * 2 + 0x21;
  if (j2 >= 0x80) j2 -= 1;
  if (j2 >= 0x9e) {
    j1 += 1;
    j2 -= 0x7d;
  } else {
    j2 -= 0x1f;
  }
  return j1 - 0x20;
}
