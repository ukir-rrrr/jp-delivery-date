import type { Slot } from "../../delivery/slot";
import type { KeyedColumn } from "../cells";

/**
 * Yu-Print R (ゆうプリR) shipping-label CSV.
 *
 * Official docs, Japan Post, retrieved 2026-10-14:
 * - ８．入出力インターフェース仕様書 (2025-08-07)
 *   https://www.post.japanpost.jp/yu-packprint-r/member/download/instructions/８．入出力インターフェース仕様書.pdf
 *   発送予定データ 取込項目一覧, printed pp.1-1–1-3. Byte counts are Shift-JIS
 *   (full-width = 2). ◎ on the 発送予定（簡易） column is required.
 * - ７ 区分・種別コード一覧, printed p.7-1, for 配達時間帯区分.
 * - ８ 取り込みが行える日付形式, printed p.8-1. YYYYMMDD is accepted.
 *   発送予定日 and 配達希望日 are 8 bytes, so YYYY/MM/DD (10 characters) does not fit.
 * - ６－１．フィルタ設定別冊（フォーマット一覧） (2024-10-01), standard formats:
 *   文字コード is "Shift-JISまたはUTF-8". The filter screen also offers EUC and UTF-16.
 *   https://www.post.japanpost.jp/yu-packprint-r/member/download/instructions/６－１．フィルタ設定別冊（フォーマット一覧）.pdf
 *
 * Column order here is this app's layout, not standard format v1. Yu-Print R
 * maps headers to 発送予定 items in the import filter, and can convert values
 * there. Headers are the official 項目名 so the filter can match them by name.
 * Encoding is Shift_JIS. encodingVerified is false because the docs allow
 * more than one encoding.
 */
export const YUPACK_R_SPEC = {
  interfaceUrl:
    "https://www.post.japanpost.jp/yu-packprint-r/member/download/instructions/%EF%BC%98%EF%BC%8E%E5%85%A5%E5%87%BA%E5%8A%9B%E3%82%A4%E3%83%B3%E3%82%BF%E3%83%BC%E3%83%95%E3%82%A7%E3%83%BC%E3%82%B9%E4%BB%95%E6%A7%98%E6%9B%B8.pdf",
  formatsUrl:
    "https://www.post.japanpost.jp/yu-packprint-r/member/download/instructions/%EF%BC%96%EF%BC%8D%EF%BC%91%EF%BC%8E%E3%83%95%E3%82%A3%E3%83%AB%E3%82%BF%E8%A8%AD%E5%AE%9A%E5%88%A5%E5%86%8A%EF%BC%88%E3%83%95%E3%82%A9%E3%83%BC%E3%83%9E%E3%83%83%E3%83%88%E4%B8%80%E8%A6%A7%EF%BC%89.pdf",
  retrieved: "2026-10-14",
  interfaceDate: "2025-08-07",
  formatsDate: "2024-10-01",
} as const;

export interface YupackColumn extends KeyedColumn {
  /** Item number in 発送予定データ 取込項目一覧. */
  specNo: number;
}

function col(
  order: number,
  specNo: number,
  key: string,
  label: string,
  maxBytes: number,
  required = false,
): YupackColumn {
  return { order, specNo, key, label, maxBytes, required };
}

export const YUPACK_COLUMNS: readonly YupackColumn[] = [
  col(1, 16, "customerCode", "お客様側管理番号", 15),
  col(2, 19, "shipDate", "発送予定日", 8),
  col(3, 31, "recipientPostal", "お届け先 郵便番号", 8, true),
  col(4, 32, "recipientAddress1", "お届け先 住所", 50, true),
  col(5, 33, "recipientAddress2", "お届け先 住所２", 50),
  col(6, 34, "recipientAddress3", "お届け先 住所３", 50),
  col(7, 35, "recipientName1", "お届け先 名称", 50, true),
  col(8, 36, "recipientName2", "お届け先 名称２", 50),
  col(9, 40, "recipientPhone", "お届け先 電話番号", 20),
  col(10, 57, "senderPostal", "ご依頼主 郵便番号", 8, true),
  col(11, 58, "senderAddress1", "ご依頼主 住所", 50, true),
  col(12, 59, "senderAddress2", "ご依頼主 住所２", 50),
  col(13, 60, "senderAddress3", "ご依頼主 住所３", 50),
  col(14, 61, "senderName1", "ご依頼主 名称", 50, true),
  col(15, 62, "senderName2", "ご依頼主 名称２", 50),
  col(16, 66, "senderPhone", "ご依頼主 電話番号", 20),
  col(17, 105, "deliveryDate", "配達希望日", 8),
  col(18, 107, "timeSlot", "配達時間帯区分", 2),
  col(19, 116, "itemName1", "記事名１", 50),
  col(20, 117, "itemName2", "記事名２", 50),
];

/**
 * Printed p.7-1. ゆうプリR設定値 is the first code. The parenthetical ゆうプリ設定値
 * (00→99, 51→60, …) is a reference column and is not written.
 * 56 (20～21時) was abolished on 2024-10-01 and must not be written.
 * 52, 61, 62, and 63 have no matching cart slot.
 */
export const YUPACK_TIME_SLOTS = [
  { code: "00", window: "希望しない", slot: "unspecified" },
  { code: "51", window: "午前中", slot: "morning" },
  { code: "52", window: "12～14時", slot: null },
  { code: "53", window: "14～16時", slot: "afternoon_early" },
  { code: "54", window: "16～18時", slot: "afternoon_late" },
  { code: "55", window: "18～20時", slot: "evening" },
  { code: "57", window: "19～21時", slot: "night" },
  { code: "61", window: "08～12時", slot: null },
  { code: "62", window: "12～17時", slot: null },
  { code: "63", window: "17～21時", slot: null },
] as const;

export const YUPACK_SLOT_CODES: Record<Slot, string> = {
  unspecified: "00",
  morning: "51",
  afternoon_early: "53",
  afternoon_late: "54",
  evening: "55",
  night: "57",
};

const BY_KEY = new Map(YUPACK_COLUMNS.map((column) => [column.key, column]));

export function yupackColumn(key: string): YupackColumn {
  const column = BY_KEY.get(key);
  if (!column) throw new Error(`unknown Yu-Print R column: ${key}`);
  return column;
}

export function yupackHeader(): string[] {
  return YUPACK_COLUMNS.map((column) => column.label);
}
