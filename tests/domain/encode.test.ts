import { describe, expect, it } from "vitest";
import { encodeCsv } from "@domain/encoding/encode";

describe("encodeCsv", () => {
  it("writes Shift_JIS bytes and refuses characters outside JIS X 0208", () => {
    const { bytes, encoding } = encodeCsv("あ\r\n", "shift_jis");
    expect(encoding).toBe("shift_jis");
    expect([...bytes]).toEqual([0x82, 0xa0, 0x0d, 0x0a]);
    expect(() => encodeCsv("髙", "shift_jis")).toThrow(/JIS X 0208/);
    expect(() => encodeCsv("①", "shift_jis")).toThrow(/JIS X 0208/);
  });

  it("writes a UTF-8 BOM for utf8_bom", () => {
    const { bytes, encoding } = encodeCsv("a", "utf8_bom");
    expect(encoding).toBe("utf8_bom");
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
