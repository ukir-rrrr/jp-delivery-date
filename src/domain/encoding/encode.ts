import type { CarrierEncoding } from "../carriers/adapter";

export interface EncodedCsv {
  bytes: Uint8Array;
  encoding: CarrierEncoding;
}

/**
 * Encoding runs after a pre-flight JIS check. iconv-lite lands with W4.
 * Only UTF-8 with BOM is implemented; Shift_JIS / CP932 must not return
 * mislabeled UTF-8 bytes.
 */
export function encodeCsv(
  csv: string,
  encoding: CarrierEncoding,
): EncodedCsv {
  if (encoding !== "utf8_bom") {
    throw new Error(`CSV encoding "${encoding}" is not implemented`);
  }
  const body = new TextEncoder().encode(csv);
  const bytes = new Uint8Array(3 + body.length);
  bytes.set([0xef, 0xbb, 0xbf], 0);
  bytes.set(body, 3);
  return { bytes, encoding };
}
