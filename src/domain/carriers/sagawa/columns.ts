import type { Slot } from "../../delivery/slot";
import type { ColumnWidth } from "../adapter";
import type { KeyedColumn } from "../cells";

/**
 * e飛伝III 飛脚宅配便 送り状データ取込レイアウト.
 * Spec: https://e-hiden3.sagawa-exp.co.jp/help_nsx/manual-takuhai.pdf
 * Retrieved 2026-10-14. Manual revision 5.5 (更新日 2026/09/28).
 * Appendix a-1, printed pages 417–420. 74 columns, in that order.
 *
 * 桁数 for 全角 is a full-width character count (16 → 32). Those columns set
 * width "fullwidth": a half-width character becomes one full-width character
 * on import (p.417), so 16 characters is the line limit even when the raw
 * Shift_JIS length is under 32. The file is not pre-converted.
 * 全半角 columns say 全角16桁 / 半角32桁. width "mixed" counts a pure
 * half-width cell in Shift_JIS bytes, and a cell that contains any full-width
 * character as 16 full-width slots, because 全半角混在は全角へ変換 (p.417).
 * 半角 columns use the printed 桁数 as maxBytes and width "bytes".
 * The two （必須） marks are on お届け先住所１ and お届け先名称１ (p.417).
 * The import screen names those fields without the parenthetical (printed p.93).
 *
 * The manual names UTF-8 as the default for data *output*, with Shift_JIS as
 * the legacy output option (環境設定, printed p.344; FAQ c-1 item 10, printed
 * p.475). It does not name the encoding of 標準_飛脚宅配便_CSV_ヘッダ有.
 * This file is Shift_JIS and encodingVerified is false.
 */
export const SAGAWA_EHIDEN_SPEC = {
  url: "https://e-hiden3.sagawa-exp.co.jp/help_nsx/manual-takuhai.pdf",
  retrieved: "2026-10-14",
  revision: "5.5 (2026/09/28)",
  layoutPages: "417-420",
} as const;

export interface SagawaColumn extends KeyedColumn {
  key: string;
}

function col(
  order: number,
  key: string,
  label: string,
  maxBytes: number,
  required = false,
  width: ColumnWidth = "bytes",
): SagawaColumn {
  return { order, key, label, maxBytes, required, width };
}

export const SAGAWA_COLUMNS: readonly SagawaColumn[] = [
  // printed p.417
  col(1, "recipientCodeKind", "お届け先コード取得区分", 1),
  col(2, "recipientCode", "お届け先コード", 12),
  col(3, "recipientPhone", "お届け先電話番号", 14),
  col(4, "recipientPostal", "お届け先郵便番号", 8),
  col(5, "recipientAddress1", "お届け先住所１", 32, true, "fullwidth"),
  col(6, "recipientAddress2", "お届け先住所２", 32, false, "fullwidth"),
  col(7, "recipientAddress3", "お届け先住所３", 32, false, "fullwidth"),
  col(8, "recipientName1", "お届け先名称１", 32, true, "fullwidth"),
  col(9, "recipientName2", "お届け先名称２", 32, false, "fullwidth"),
  col(10, "customerCode", "お客様管理番号", 16),
  col(11, "accountCode", "お客様コード", 12),
  col(12, "departmentCodeKind", "部署ご担当者コード取得区分", 1),
  col(13, "departmentCode", "部署ご担当者コード", 4),
  col(14, "departmentName", "部署ご担当者名称", 32, false, "fullwidth"),
  col(15, "shipperPhone", "荷送人電話番号", 14),
  col(16, "senderCodeKind", "ご依頼主コード取得区分", 1),
  col(17, "senderCode", "ご依頼主コード", 12),
  col(18, "senderPhone", "ご依頼主電話番号", 14),
  col(19, "senderPostal", "ご依頼主郵便番号", 8),
  col(20, "senderAddress1", "ご依頼主住所１", 32, false, "fullwidth"),
  col(21, "senderAddress2", "ご依頼主住所２", 32, false, "fullwidth"),
  col(22, "senderName1", "ご依頼主名称１", 32, false, "fullwidth"),
  col(23, "senderName2", "ご依頼主名称２", 32, false, "fullwidth"),
  col(24, "packageShape", "荷姿", 3),
  col(25, "itemName1", "品名１", 32, false, "mixed"),
  col(26, "itemName2", "品名２", 32, false, "mixed"),
  col(27, "itemName3", "品名３", 32, false, "mixed"),
  // printed p.418
  col(28, "itemName4", "品名４", 32, false, "mixed"),
  col(29, "itemName5", "品名５", 32, false, "mixed"),
  col(30, "tagShape", "荷札荷姿", 3),
  col(31, "tagItem1", "荷札品名１", 32, false, "mixed"),
  col(32, "tagItem2", "荷札品名２", 32, false, "mixed"),
  col(33, "tagItem3", "荷札品名３", 32, false, "mixed"),
  col(34, "tagItem4", "荷札品名４", 32, false, "mixed"),
  col(35, "tagItem5", "荷札品名５", 32, false, "mixed"),
  col(36, "tagItem6", "荷札品名６", 32, false, "mixed"),
  col(37, "tagItem7", "荷札品名７", 32, false, "mixed"),
  col(38, "tagItem8", "荷札品名８", 32, false, "mixed"),
  col(39, "tagItem9", "荷札品名９", 32, false, "mixed"),
  col(40, "tagItem10", "荷札品名１０", 32, false, "mixed"),
  col(41, "tagItem11", "荷札品名１１", 32, false, "mixed"),
  col(42, "pieceCount", "出荷個数", 3),
  col(43, "speed", "スピード指定", 3),
  col(44, "cool", "クール便指定", 3),
  col(45, "deliveryDate", "配達日", 8),
  col(46, "timeSlot", "配達指定時間帯", 2),
  col(47, "deliveryTime", "配達指定時間（時分）", 4),
  col(48, "collectAmount", "代引金額", 7),
  col(49, "tax", "消費税", 6),
  col(50, "paymentType", "決済種別", 1),
  col(51, "insurance", "保険金額", 8),
  // printed p.419
  col(52, "seal1", "指定シール１", 3),
  col(53, "seal2", "指定シール２", 3),
  col(54, "seal3", "指定シール３", 3),
  col(55, "officeHold", "営業所受取", 1),
  col(56, "src", "SRC区分", 1),
  col(57, "officeCode", "営業所受取営業所コード", 4),
  col(58, "freightPayer", "元着区分", 1),
  col(59, "email", "メールアドレス", 100),
  col(60, "absencePhone", "ご不在時連絡先", 14),
  col(61, "shipDate", "出荷日", 8),
  col(62, "trackingNumber", "お問い合せ送り状No.", 12),
  col(63, "depotPrint", "出荷場印字区分", 1),
  col(64, "ungroup", "集約解除指定", 1),
  col(65, "edit01", "編集０１", 32, false, "mixed"),
  col(66, "edit02", "編集０２", 32, false, "mixed"),
  col(67, "edit03", "編集０３", 32, false, "mixed"),
  col(68, "edit04", "編集０４", 32, false, "mixed"),
  col(69, "edit05", "編集０５", 32, false, "mixed"),
  col(70, "edit06", "編集０６", 32, false, "mixed"),
  col(71, "edit07", "編集０７", 32, false, "mixed"),
  col(72, "edit08", "編集０８", 32, false, "mixed"),
  // printed p.420
  col(73, "edit09", "編集０９", 32, false, "mixed"),
  col(74, "edit10", "編集１０", 32, false, "mixed"),
];

/**
 * Printed p.418 配達指定時間帯, repeated on p.421.
 * 12 (12:00～14:00) and 04 (18:00～21:00) are real codes. This app's cart
 * slots do not include those windows, so mapSlot does not emit them.
 * p.421 notes that 18 and 19 were the 6-slot codes and 04 the 5-slot code
 * on e飛伝II. e飛伝III accepts the whole list.
 */
export const SAGAWA_TIME_SLOTS = [
  { code: "01", window: "午前中", slot: "morning" },
  { code: "12", window: "12:00～14:00", slot: null },
  { code: "14", window: "14:00～16:00", slot: "afternoon_early" },
  { code: "16", window: "16:00～18:00", slot: "afternoon_late" },
  { code: "18", window: "18:00～20:00", slot: "evening" },
  { code: "04", window: "18:00～21:00", slot: null },
  { code: "19", window: "19:00～21:00", slot: "night" },
] as const;

export const SAGAWA_SLOT_CODES: Record<Slot, string> = {
  unspecified: "",
  morning: "01",
  afternoon_early: "14",
  afternoon_late: "16",
  evening: "18",
  night: "19",
};

const BY_KEY = new Map(SAGAWA_COLUMNS.map((column) => [column.key, column]));

export function sagawaColumn(key: string): SagawaColumn {
  const column = BY_KEY.get(key);
  if (!column) throw new Error(`unknown Sagawa column: ${key}`);
  return column;
}

export function sagawaHeader(): string[] {
  return SAGAWA_COLUMNS.map((column) => column.label);
}
