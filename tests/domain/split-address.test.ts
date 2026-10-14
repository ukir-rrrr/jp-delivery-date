import { describe, expect, it } from "vitest";
import { normalizeCsvText } from "@domain/address/normalize";
import { packByBytes, splitAddress } from "@domain/address/split-address";
import { jisCheck } from "@domain/address/jis-check";
import { SUGGESTED_SUBSTITUTIONS } from "@domain/address/substitutions";
import { shiftJisByteLength } from "@domain/encoding/jis";

describe("splitAddress", () => {
  it("flags overflow without dropping or slicing a token", () => {
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
    expect(`${result.parts.join("")}${result.remainder}`).toBe("東京都渋谷区1-2-3ビル名");
    for (const part of result.parts) {
      const bytes = shiftJisByteLength(part);
      expect(bytes).not.toBeNull();
      expect(bytes).toBeLessThanOrEqual(10);
    }
  });

  it("keeps a short address in one field", () => {
    const result = splitAddress(
      {
        province: "東京都",
        city: "渋谷区",
        address1: "神宮前1-2-3",
        address2: "",
      },
      [64],
    );
    expect(result).toEqual({
      parts: ["東京都渋谷区神宮前1-2-3"],
      remainder: "",
      overflow: false,
    });
  });

  it("breaks after 丁目 and 番地 instead of cutting a character", () => {
    const result = packByBytes("神宮前1丁目2番地3", [16, 16]);
    expect(result.overflow).toBe(false);
    expect(result.parts).toEqual(["神宮前1丁目2番地", "3"]);
  });
});

describe("normalizeCsvText", () => {
  it("folds letters, digits, and the fullwidth hyphen, and leaves the rest", () => {
    expect(normalizeCsvText("Ａ１－　")).toBe("A1-");
    expect(normalizeCsvText("山～田")).toBe("山～田");
    expect(normalizeCsvText("神宮前1–2")).toBe("神宮前1–2");
    expect(normalizeCsvText("山＂田")).toBe("山＂田");
  });
});

describe("jisCheck", () => {
  it("flags non-BMP emoji and known gaiji", () => {
    const issues = jisCheck("🚚髙", SUGGESTED_SUBSTITUTIONS);
    expect(issues.map((issue) => issue.char)).toEqual(["🚚", "髙"]);
    expect(issues[1]?.suggestion).toBe("高");
  });

  it("accepts JIS level 1/2 and half-width katakana, and flags CP932 extensions", () => {
    expect(jisCheck("高崎あｱA1", SUGGESTED_SUBSTITUTIONS)).toEqual([]);
    expect(jisCheck("﨑①", SUGGESTED_SUBSTITUTIONS).map((issue) => issue.char)).toEqual(["﨑", "①"]);
  });
});
