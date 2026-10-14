import type { CarrierAdapter } from "./adapter";
import { yamatoAdapter } from "./yamato";
import { sagawaAdapter } from "./sagawa";
import { yupackRAdapter } from "./yupackR";

export type {
  ColumnSpec,
  CarrierEncoding,
  Issue,
  Result,
  Row,
  CarrierAdapter,
} from "./adapter";
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
