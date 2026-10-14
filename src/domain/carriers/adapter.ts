import type { LocalDate } from "../calendar/local-date";
import type { Slot } from "../delivery/slot";
import type { SettingsV1 } from "../delivery/settings";
import type { NormalizedOrder } from "../order/normalized-order";

export interface ColumnSpec {
  order: number;
  label: string;
  maxBytes: number;
  required: boolean;
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

export interface CarrierAdapter {
  id: string;
  columns: readonly ColumnSpec[];
  mapSlot(s: Slot): string | Issue;
  formatDate(d: LocalDate): string;
  toRow(o: NormalizedOrder, s: SettingsV1): Result<Row, Issue[]>;
  encoding: CarrierEncoding;
}
