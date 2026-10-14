import iconv from "iconv-lite";
import type { CarrierEncoding } from "../carriers/adapter";
import { isShiftJisText } from "./jis";

export interface EncodedCsv {
  bytes: Uint8Array;
  encoding: CarrierEncoding;
}

/**
 * Encoding runs after the carrier preflight. Shift_JIS refuses characters
 * outside JIS X 0208 / JIS X 0201 instead of letting iconv-lite's CP932 table
 * write them. CP932 is available for a carrier that explicitly selects it.
 */
export function encodeCsv(csv: string, encoding: CarrierEncoding): EncodedCsv {
  if (encoding === "utf8_bom") {
    const body = new TextEncoder().encode(csv);
    const bytes = new Uint8Array(3 + body.length);
    bytes.set([0xef, 0xbb, 0xbf], 0);
    bytes.set(body, 3);
    return { bytes, encoding };
  }
  if (encoding === "shift_jis") {
    if (!isShiftJisText(csv)) {
      throw new Error(
        "CSV contains characters outside JIS X 0208 / JIS X 0201; Shift_JIS was not written",
      );
    }
    return { bytes: Uint8Array.from(iconv.encode(csv, "shiftjis")), encoding };
  }
  if (encoding === "cp932") {
    const encoded = iconv.encode(csv, "cp932");
    if (iconv.decode(encoded, "cp932") !== csv) {
      throw new Error("CSV contains characters that CP932 cannot encode");
    }
    return { bytes: Uint8Array.from(encoded), encoding };
  }
  const unknown: never = encoding;
  throw new Error(`CSV encoding "${unknown}" is not implemented`);
}
