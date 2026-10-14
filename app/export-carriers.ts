export interface ExportCarrier {
  id: "yamato" | "sagawa" | "yupackR";
  label: string;
  fileName: string;
  button: string;
  note: string;
}

export const EXPORT_CARRIERS: readonly ExportCarrier[] = [
  {
    id: "yamato",
    label: "ヤマト運輸 B2クラウド",
    fileName: "yamato-b2.csv",
    button: "ヤマトB2のCSVを書き出す",
    note: "出荷予定日は書き出した日（日本時間）です。送り状種類は発払いです。",
  },
  {
    id: "sagawa",
    label: "佐川急便 e飛伝III",
    fileName: "sagawa-ehiden3.csv",
    button: "佐川e飛伝IIIのCSVを書き出す",
    note: "取込テンプレートは「標準_飛脚宅配便_CSV_ヘッダ有」です。日付は8桁、元払の飛脚宅配便です。時間帯は午前中が01、14時台が14、16時台が16、18時台が18、19時台が19で、指定なしは空欄です。文字コードはマニュアルが取込ファイルを指定していないためShift_JISで、未確認です。",
  },
  {
    id: "yupackR",
    label: "日本郵便 ゆうプリR",
    fileName: "yupack-r.csv",
    button: "ゆうプリRのCSVを書き出す",
    note: "列の対応と値の変換は、ゆうプリRの取込フィルタでこのCSVの見出しを発送予定の項目へ結びます。日付は8桁、時間帯はゆうプリRの設定値です。文字コードはShift_JISですが、公式資料はShift-JISとUTF-8の両方を案内しているため未確認です。",
  },
];

const BY_ID = new Map<string, ExportCarrier>(EXPORT_CARRIERS.map((carrier) => [carrier.id, carrier]));
const YAMATO = EXPORT_CARRIERS[0];

export function findExportCarrier(id: string | undefined): ExportCarrier | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function exportCarrier(id: string | null): { carrier: ExportCarrier; error: string | null } {
  if (!id) return { carrier: YAMATO, error: null };
  const carrier = BY_ID.get(id);
  if (carrier) return { carrier, error: null };
  return { carrier: YAMATO, error: "運送会社の指定が不正です。ヤマト運輸を表示しています。" };
}
