import type { CarrierEncoding } from "../carriers/adapter";

export interface EncodedCsv {
  bytes: Uint8Array;
  encoding: CarrierEncoding;
}

/**
 * Encoding runs after a pre-flight JIS check. iconv-lite lands with W4.
 * Scaffold returns UTF-8 bytes so the pipeline type-checks.
 */
export function encodeCsv(
  csv: string,
  encoding: CarrierEncoding,
): EncodedCsv {
  const encoder = new TextEncoder();
  if (encoding === "utf8_bom") {
    const body = encoder.encode(csv);
    const bytes = new Uint8Array(3 + body.length);
    bytes.set([0xef, 0xbb, 0xbf], 0);
    bytes.set(body, 3);
    return { bytes, encoding };
  }
  return { bytes: encoder.encode(csv), encoding };
}
