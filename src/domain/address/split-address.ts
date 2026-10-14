import { shiftJisByteLength } from "../encoding/jis";
import { normalizeCsvText } from "./normalize";

export interface SplitAddressInput {
  province: string;
  city: string;
  address1: string;
  address2: string;
}

export interface SplitAddressResult {
  parts: string[];
  remainder: string;
  overflow: boolean;
}

const BOUNDARY_SPLIT = /([ \u3000]+|丁目|番地|、|[-－−‐‑‒–—])/;
const BOUNDARY_ONLY = /^(?:[ \u3000]+|丁目|番地|、|[-－−‐‑‒–—])$/;

/**
 * Pack province, city, address1, and address2 into `maxBytesPerPart` Shift_JIS
 * budgets. Breaks only after a space, 丁目, 番地, ideographic comma, or hyphen.
 * A token that does not fit is left in `remainder`. Nothing is sliced mid-token.
 */
export function splitAddress(
  input: SplitAddressInput,
  maxBytesPerPart: readonly number[],
): SplitAddressResult {
  const text = [input.province, input.city, input.address1, input.address2]
    .map((part) => normalizeCsvText(part))
    .filter(Boolean)
    .join("");
  return packByBytes(text, maxBytesPerPart);
}

export type TextWidth = (text: string) => number | null;

/** 16 full-width characters occupy 32. A half-width character is one of those 16 after conversion. */
export function fullWidthSlots(text: string): number | null {
  if (shiftJisByteLength(text) == null) return null;
  return [...text].length * 2;
}

/**
 * 全半角 columns keep a pure half-width string at its Shift_JIS length.
 * One full-width character makes the importer convert the whole cell.
 */
export function mixedWidthSlots(text: string): number | null {
  const bytes = shiftJisByteLength(text);
  if (bytes == null) return null;
  const chars = [...text];
  const mixed = chars.some((char) => (shiftJisByteLength(char) ?? 0) > 1);
  return mixed ? chars.length * 2 : bytes;
}

export function packByBytes(
  text: string,
  maxBytesPerPart: readonly number[],
  width: TextWidth = shiftJisByteLength,
): SplitAddressResult {
  const parts = maxBytesPerPart.map(() => "");
  const pieces = tokenize(text);
  let partIndex = 0;
  let pieceIndex = 0;
  for (; pieceIndex < pieces.length; pieceIndex += 1) {
    const piece = pieces[pieceIndex] ?? "";
    const pieceLength = width(piece);
    if (pieceLength == null) break;
    const placed = placePiece(parts, maxBytesPerPart, partIndex, piece, pieceLength, width);
    if (!placed.ok) break;
    partIndex = placed.partIndex;
  }
  const remainder = pieces.slice(pieceIndex).join("");
  return { parts, remainder, overflow: remainder.length > 0 };
}

function placePiece(
  parts: string[],
  limits: readonly number[],
  start: number,
  piece: string,
  pieceLength: number,
  width: TextWidth,
): { ok: true; partIndex: number } | { ok: false } {
  for (let index = start; index < parts.length; index += 1) {
    const limit = limits[index] ?? 0;
    if (pieceLength > limit && parts[index] === "") continue;
    const combined = `${parts[index] ?? ""}${piece}`;
    const combinedLength = width(combined);
    if (combinedLength != null && combinedLength <= limit) {
      parts[index] = combined;
      return { ok: true, partIndex: index };
    }
  }
  return { ok: false };
}

function tokenize(text: string): string[] {
  if (!text) return [];
  const raw = text.split(BOUNDARY_SPLIT).filter((part) => part !== "");
  const pieces: string[] = [];
  for (const part of raw) {
    const previous = pieces[pieces.length - 1];
    if (previous != null && BOUNDARY_ONLY.test(part)) {
      pieces[pieces.length - 1] = previous + part;
    } else {
      pieces.push(part);
    }
  }
  return pieces;
}
