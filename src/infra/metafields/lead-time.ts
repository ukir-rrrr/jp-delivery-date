export const MAX_LEAD_TIME_DAYS = 3650;
export const MAX_LEAD_TIME_ROWS = 25;

const PRODUCT_GID = /^gid:\/\/shopify\/Product\/(\d+)$/;

export interface LeadTimeUpdate {
  id: string;
  leadTimeDays: number;
}

export function isLeadTimeInput(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) <= MAX_LEAD_TIME_DAYS;
}

export function productNumericId(gid: string): string | null {
  return PRODUCT_GID.exec(gid)?.[1] ?? null;
}

export function leadFieldName(numericId: string): string {
  return `lead.${numericId}`;
}

export function originalFieldName(numericId: string): string {
  return `original.${numericId}`;
}
