import {
  isLeadTimeInput,
  leadFieldName,
  MAX_LEAD_TIME_DAYS,
  MAX_LEAD_TIME_ROWS,
  originalFieldName,
  productNumericId,
  type LeadTimeUpdate,
} from "./lead-time";

export type { LeadTimeUpdate };
export { MAX_LEAD_TIME_DAYS, MAX_LEAD_TIME_ROWS, isLeadTimeInput };

export interface LeadTimeFieldFailure {
  ok: false;
  formError: string | null;
  fieldErrors: Record<string, string>;
}

export type LeadTimeFormResult =
  | { ok: true; updates: LeadTimeUpdate[] }
  | LeadTimeFieldFailure;

/** Changed rows only. Each product is named lead.<id> / original.<id>, not zipped lists. */
export function leadTimesFromForm(form: FormData): LeadTimeFormResult {
  const ids = form.getAll("productId").map(String);
  if (ids.length > MAX_LEAD_TIME_ROWS) {
    return {
      ok: false,
      formError: `一度に保存できる商品は${MAX_LEAD_TIME_ROWS}件までです。`,
      fieldErrors: {},
    };
  }
  if (ids.length === 0) {
    return { ok: false, formError: "保存する商品がありません。", fieldErrors: {} };
  }

  const seen = new Set<string>();
  const fieldErrors: Record<string, string> = {};
  const updates: LeadTimeUpdate[] = [];
  for (const id of ids) {
    const numericId = productNumericId(id);
    if (!numericId || seen.has(id)) {
      return { ok: false, formError: "商品IDが不正です。", fieldErrors: {} };
    }
    seen.add(id);
    const rawLead = form.get(leadFieldName(numericId));
    const rawOriginal = form.get(originalFieldName(numericId));
    if (typeof rawLead !== "string" || typeof rawOriginal !== "string") {
      return {
        ok: false,
        formError: "商品とリードタイムの対応が取れません。ページを読み直してください。",
        fieldErrors: {},
      };
    }
    const raw = rawLead.trim();
    const original = rawOriginal.trim();
    if (!isLeadTimeInput(raw)) {
      fieldErrors[id] = `0〜${MAX_LEAD_TIME_DAYS}の整数で入力してください。`;
      continue;
    }
    const leadTimeDays = Number(raw);
    if (isLeadTimeInput(original) && Number(original) === leadTimeDays) continue;
    updates.push({ id, leadTimeDays });
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, formError: null, fieldErrors };
  }
  return { ok: true, updates };
}
