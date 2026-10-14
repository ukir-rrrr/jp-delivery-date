import { describe, expect, it } from "vitest";
import { splitAddress } from "@domain/address/split-address";
import { jisCheck } from "@domain/address/jis-check";
import { SUGGESTED_SUBSTITUTIONS } from "@domain/address/substitutions";

describe("splitAddress", () => {
  it("flags overflow without dropping address lines", () => {
    const result = splitAddress(
      {
        province: "東京都",
        city: "渋谷区",
        address1: "1-2-3",
        address2: "ビル名",
      },
      [10, 10],
    );
    expect(result.overflow).toBe(true);
    expect(result.parts).toEqual(["東京都", "渋谷区", "1-2-3", "ビル名"]);
  });
});

describe("jisCheck", () => {
  it("flags non-BMP emoji and known gaiji", () => {
    const issues = jisCheck("🚚髙", SUGGESTED_SUBSTITUTIONS);
    expect(issues.map((i) => i.char)).toEqual(["🚚", "髙"]);
  });
});
