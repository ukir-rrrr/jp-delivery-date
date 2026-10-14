import type { LocalDate } from "../calendar/local-date";
import type { Slot } from "../delivery/slot";
import type { SettingsV1 } from "../delivery/settings";
import type { NormalizedOrder } from "../order/normalized-order";

/**
 * bytes: Shift_JIS byte length.
 * fullwidth: every character counts as one full-width character (e飛伝 converts 半角).
 * mixed: Shift_JIS bytes when the cell is only half-width; otherwise fullwidth.
 */
export type ColumnWidth = "bytes" | "fullwidth" | "mixed";

export interface ColumnSpec {
  order: number;
  label: string;
  maxBytes: number;
  required: boolean;
  width?: ColumnWidth;
}

export type CarrierEncoding = "shift_jis" | "cp932" | "utf8_bom";

export interface Issue {
  code: string;
  message: string;
  field?: string;
  suggestion?: string;
}

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type Row = string[];

export interface RowView {
  cells: string[];
  issues: Issue[];
}

export interface PreviewLine {
  label: string;
  value: string;
}

export interface CarrierAdapter {
  id: string;
  columns: readonly ColumnSpec[];
  mapSlot(s: Slot): string | Issue;
  formatDate(d: LocalDate): string;
  /** Full cells, including fields that failed a check, so the screen can preview them. */
  mapRow(order: NormalizedOrder, settings: SettingsV1): RowView;
  preview(cells: readonly string[]): PreviewLine[];
  toRow(o: NormalizedOrder, s: SettingsV1): Result<Row, Issue[]>;
  encoding: CarrierEncoding;
  /**
   * False when the carrier manual does not name this file encoding, or names
   * more than one. The bytes are still written; a real import has to confirm them.
   */
  encodingVerified: boolean;
}

export function rowToResult(view: RowView): Result<Row, Issue[]> {
  if (view.issues.length > 0) return { ok: false, error: view.issues };
  return { ok: true, value: view.cells };
}

/** One `toRow`: issues refuse the file, and a clean row is the cells. */
export function defineAdapter(spec: Omit<CarrierAdapter, "toRow">): CarrierAdapter {
  return {
    ...spec,
    toRow(order, settings) {
      return rowToResult(spec.mapRow(order, settings));
    },
  };
}
