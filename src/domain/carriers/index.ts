import type { SettingsV1 } from "../delivery/settings";
import type { NormalizedOrder } from "../order/normalized-order";
import type { CarrierAdapter, Issue, PreviewLine } from "./adapter";
import { sagawaAdapter } from "./sagawa";
import { yamatoAdapter } from "./yamato";
import { yupackRAdapter } from "./yupackR";

export type {
  ColumnSpec,
  CarrierEncoding,
  Issue,
  Result,
  Row,
  CarrierAdapter,
} from "./adapter";
export { buildLabelFile, type LabelFailure } from "./label-file";
export { yamatoAdapter } from "./yamato";
export { sagawaAdapter } from "./sagawa";
export { yupackRAdapter } from "./yupackR";

export const CARRIERS: readonly CarrierAdapter[] = [
  yamatoAdapter,
  sagawaAdapter,
  yupackRAdapter,
];

export function carrierById(id: string): CarrierAdapter | undefined {
  return CARRIERS.find((c) => c.id === id);
}

export interface CarrierReview {
  issues: Issue[];
  preview: PreviewLine[];
}

export function reviewOrder(
  carrierId: string,
  order: NormalizedOrder,
  settings: SettingsV1,
): CarrierReview | undefined {
  const adapter = carrierById(carrierId);
  if (!adapter) return undefined;
  const view = adapter.mapRow(order, settings);
  return { issues: view.issues, preview: adapter.preview(view.cells) };
}
