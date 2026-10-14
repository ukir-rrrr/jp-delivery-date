import { describe, expect, it } from "vitest";
import { encodeCsv } from "@domain/encoding/encode";

describe("encodeCsv", () => {
  it("throws for unimplemented Shift_JIS instead of returning UTF-8", () => {
    expect(() => encodeCsv("送り状", "shift_jis")).toThrow(/not implemented/);
  });

  it("writes a UTF-8 BOM for utf8_bom", () => {
    const { bytes, encoding } = encodeCsv("a", "utf8_bom");
    expect(encoding).toBe("utf8_bom");
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
