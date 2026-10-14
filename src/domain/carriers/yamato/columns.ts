import type { ColumnSpec } from "../adapter";
import type { Slot } from "../../delivery/slot";

/**
 * Yamato B2 Cloud 送り状発行データレイアウト (入出力用).
 * Spec: https://bmypage.kuronekoyamato.co.jp/bmypage/pdf/new_exchange1.pdf
 * Retrieved 2026-10-14. Footer mark C-09. 97 columns, pp. 1–4.
 * Pages 5–7 are address-book / sender / item masters and are not this file.
 *
 * The PDF names character classes (半角/全角) and does not name Shift_JIS or
 * CP932. This adapter emits Shift_JIS. maxBytes is the half-width maximum,
 * which equals the Shift_JIS byte length of a JIS X 0208 string (full-width
 * is 2 bytes). "16文字/32文字" therefore has maxBytes 32.
 *
 * `required` is the 宅急便 column marked ○ for 発払い. Parenthetical （○）
 * conditions (collect, office hold, mail notify) are not required here.
 */
export const YAMATO_B2_SPEC = {
  url: "https://bmypage.kuronekoyamato.co.jp/bmypage/pdf/new_exchange1.pdf",
  retrieved: "2026-10-14",
  revision: "C-09",
} as const;

export interface YamatoColumn extends ColumnSpec {
  key: string;
}

function col(
  order: number,
  key: string,
  label: string,
  maxBytes: number,
  required = false,
): YamatoColumn {
  return { order, key, label, maxBytes, required };
}

export const YAMATO_COLUMNS: readonly YamatoColumn[] = [
  // p.1
  col(1, "customerCode", "お客様管理番号", 50),
  col(2, "invoiceType", "送り状種類", 1, true),
  col(3, "cool", "クール区分", 1),
  col(4, "trackingNumber", "伝票番号", 12),
  col(5, "shipDate", "出荷予定日", 10, true),
  col(6, "deliveryDate", "お届け予定（指定）日", 10),
  col(7, "timeSlot", "配達時間帯", 4),
  col(8, "recipientCode", "お届け先コード", 20),
  col(9, "recipientPhone", "お届け先電話番号", 15, true),
  col(10, "recipientPhoneExt", "お届け先電話番号枝番", 2),
  col(11, "recipientPostal", "お届け先郵便番号", 8, true),
  // p.1: one cell, 32 full-width / 64 half-width. The parenthetical
  // 都道府県4＋市区郡町村12＋町・番地16 describes the on-screen boxes.
  col(12, "recipientAddress", "お届け先住所", 64, true),
  col(13, "recipientBuilding", "お届け先住所（アパートマンション名）", 32),
  col(14, "recipientCompany1", "お届け先会社・部門名１", 50),
  col(15, "recipientCompany2", "お届け先会社・部門名２", 50),
  col(16, "recipientName", "お届け先名", 32, true),
  col(17, "recipientKana", "お届け先名略称カナ", 50),
  col(18, "honorific", "敬称", 4),
  col(19, "senderCode", "ご依頼主コード", 20),
  col(20, "senderPhone", "ご依頼主電話番号", 15, true),
  col(21, "senderPhoneExt", "ご依頼主電話番号枝番", 2),
  col(22, "senderPostal", "ご依頼主郵便番号", 8, true),
  col(23, "senderAddress", "ご依頼主住所", 64, true),
  // p.2
  col(24, "senderBuilding", "ご依頼主住所（アパートマンション名）", 32),
  col(25, "senderName", "ご依頼主名", 32, true),
  col(26, "senderKana", "ご依頼主略称カナ", 50),
  col(27, "itemCode1", "品名コード１", 30),
  col(28, "itemName1", "品名１", 50, true),
  col(29, "itemCode2", "品名コード２", 30),
  col(30, "itemName2", "品名２", 50),
  col(31, "handling1", "荷扱い１", 20),
  col(32, "handling2", "荷扱い２", 20),
  col(33, "note", "記事", 44),
  col(34, "collectAmount", "コレクト代金引換額（税込）", 7),
  col(35, "collectTax", "コレクト内消費税額等", 7),
  col(36, "officeHold", "営業所止置き", 1),
  col(37, "officeCode", "営業所コード", 6),
  col(38, "labelCount", "発行枚数", 2),
  col(39, "piecePrint", "個数口枠の印字", 1),
  col(40, "billingCode", "ご請求先顧客コード", 12, true),
  col(41, "billingBranch", "ご請求先分類コード", 3),
  col(42, "freightNumber", "運賃管理番号", 2, true),
  col(43, "webCollectFlag", "クロネコwebコレクトデータ登録", 1),
  col(44, "webCollectMerchant", "クロネコwebコレクト加盟店番号", 9),
  col(45, "webCollectReceipt1", "クロネコwebコレクト申込受付番号１", 23),
  col(46, "webCollectReceipt2", "クロネコwebコレクト申込受付番号２", 23),
  col(47, "webCollectReceipt3", "クロネコwebコレクト申込受付番号３", 23),
  col(48, "deliveryMailFlag", "お届け予定ｅメール利用区分", 1),
  col(49, "deliveryMailAddress", "お届け予定ｅメールe-mailアドレス", 60),
  col(50, "device", "入力機種", 1),
  col(51, "deliveryMailMessage", "お届け予定eメールメッセージ", 148),
  col(52, "completeMailFlag", "お届け完了ｅメール利用区分", 1),
  col(53, "completeMailAddress", "お届け完了ｅメールe-mailアドレス", 60),
  col(54, "completeMailMessage", "お届け完了eメールメッセージ", 318),
  col(55, "storageFlag", "クロネコ収納代行利用区分", 1),
  // p.3
  col(56, "reserved56", "予備", 1),
  col(57, "storageAmount", "収納代行請求金額(税込)", 7),
  col(58, "storageTax", "収納代行内消費税額等", 7),
  col(59, "storagePostal", "収納代行請求先郵便番号", 8),
  col(60, "storageAddress", "収納代行請求先住所", 64),
  col(61, "storageBuilding", "収納代行請求先住所（アパートマンション名）", 32),
  col(62, "storageCompany1", "収納代行請求先会社・部門名１", 50),
  col(63, "storageCompany2", "収納代行請求先会社・部門名２", 50),
  col(64, "storageName", "収納代行請求先名(漢字)", 32),
  col(65, "storageKana", "収納代行請求先名(カナ)", 50),
  col(66, "storageContactName", "収納代行問合せ先名(漢字)", 32),
  col(67, "storageContactPostal", "収納代行問合せ先郵便番号", 8),
  col(68, "storageContactAddress", "収納代行問合せ先住所", 64),
  col(69, "storageContactBuilding", "収納代行問合せ先住所（アパートマンション名）", 32),
  col(70, "storageContactPhone", "収納代行問合せ先電話番号", 15),
  col(71, "storageNumber", "収納代行管理番号", 20),
  col(72, "storageItem", "収納代行品名", 50),
  col(73, "storageNote", "収納代行備考", 28),
  col(74, "multiPieceKey", "複数口くくりキー", 20),
  col(75, "searchTitle1", "検索キータイトル1", 20),
  col(76, "searchKey1", "検索キー1", 20),
  col(77, "searchTitle2", "検索キータイトル2", 20),
  col(78, "searchKey2", "検索キー2", 20),
  col(79, "searchTitle3", "検索キータイトル3", 20),
  col(80, "searchKey3", "検索キー3", 20),
  col(81, "searchTitle4", "検索キータイトル4", 20),
  col(82, "searchKey4", "検索キー4", 20),
  col(83, "searchTitle5", "検索キータイトル5", 20),
  col(84, "searchKey5", "検索キー5", 20),
  col(85, "reserved85", "予備", 12),
  col(86, "reserved86", "予備", 3),
  // p.4
  col(87, "postMailFlag", "投函予定メール利用区分", 1),
  col(88, "postMailAddress", "投函予定メールe-mailアドレス", 60),
  col(89, "postMailMessage", "投函予定メールメッセージ", 148),
  col(90, "postDoneRecipientFlag", "投函完了メール（お届け先宛）利用区分", 1),
  col(91, "postDoneRecipientAddress", "投函完了メール（お届け先宛）e-mailアドレス", 60),
  col(92, "postDoneRecipientMessage", "投函完了メール（お届け先宛）メールメッセージ", 318),
  col(93, "postDoneSenderFlag", "投函完了メール（ご依頼主宛）利用区分", 1),
  col(94, "postDoneSenderAddress", "投函完了メール（ご依頼主宛）e-mailアドレス", 60),
  col(95, "postDoneSenderMessage", "投函完了メール（ご依頼主宛）メールメッセージ", 318),
  col(96, "linkNumber", "連携管理番号", 70),
  col(97, "noticeMail", "通知メールアドレス", 60),
];

/** p.1 配達時間帯. Blank is 指定なし. Time Service codes 0010/0017 are not used. */
export const YAMATO_SLOT_CODES: Record<Slot, string> = {
  unspecified: "",
  morning: "0812",
  afternoon_early: "1416",
  afternoon_late: "1618",
  evening: "1820",
  night: "1921",
};

const BY_KEY = new Map(YAMATO_COLUMNS.map((column) => [column.key, column]));

export function yamatoColumn(key: string): YamatoColumn {
  const column = BY_KEY.get(key);
  if (!column) throw new Error(`unknown Yamato column: ${key}`);
  return column;
}

export function yamatoHeader(): string[] {
  return YAMATO_COLUMNS.map((column) => column.label);
}
