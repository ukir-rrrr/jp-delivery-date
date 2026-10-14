# Final Plan: Delivery Date/Time + Shipping-Label CSV App (non-Plus, JP)

Legend: **[V]** checked on shopify.dev 2026-10-14 (per candidates). **[B]** from the brief. **[U]** unverified. No facts beyond the brief and candidates.

## Synthesis note
- **Base: candidate-2 (robustness/testability).** The two costly failure modes are a wrong earliest date and wrong CSV bytes. Candidate-2 isolates both as pure domain code with byte-exact golden tests, a `reasons[]` trace and versioned settings, and it marks unverified items clearly.
- **Grafted from candidate-1 (simplicity):** (a) a no-silent-change rule for JIS substitution and address overflow, where the merchant confirms every substitution and the app flags rows instead of truncating; (b) a worst-case region offset by default, plus an optional prefecture selector the merchant can turn on; (c) explicit handling of PCD redaction (null fields returned with HTTP 200) through a banner.
- **Grafted from candidate-3 (merchant UX/BFS):** (a) a 3-step home setup guide that detects block/embed status with App Bridge `app.extensions()` and is built in week 1; (b) per-row editing of the delivery date and slot on the CSV screen, so Buy Now orders ("日時指定なし") can still be exported correctly. The edits are held in memory and never persisted.
- **Rejected:**
  - Candidate-3's double storage (a shop metafield mirrored into an app-data metafield). It creates a sync bug surface; use one metafield.
  - Candidate-3's `CarrierProfile` DB table. Store the sender profile in the settings metafield; it is merchant data, not PII.
  - The product-page block for Buy Now. Whether line item properties survive the dynamic checkout button is [U]; deferred.
  - Shopify Functions cart validation. Non-Plus availability is [U]; deferred.
  - Candidate-1's assumption that carriers accept a blank date as "no preference." It is [U]; we flag such rows instead.
  - Candidate-2's 100% branch coverage mandate. Too costly for a solo dev; require full coverage only for `calendar/`, `delivery/` and `carriers/`.
  - `write_orders`/order tagging and the orders/create webhook. They add scope and PCD surface; use `ExportLog` instead.

## 1) Modules and data flow
```
app/routes/       app._index (setup guide), app.settings.*, app.orders (CSV screen),
                  app.export.$carrier (resource route, streams the file), webhooks.*
src/domain/       PURE, no Shopify/Prisma/IO imports
  calendar/       LocalDate (JST YYYY-MM-DD), BusinessCalendar, holidays
  delivery/       Slot enum, Region (47), earliestDate()
  order/          NormalizedOrder, parseNoteAttributes()
  address/        splitAddress(), jisCheck(), substitution table
  carriers/       CarrierAdapter + yamato/, sagawa/, yupackR/
  encoding/       CSV serializer (RFC4180, CRLF), encode()
src/infra/        GraphQL wrappers, zod metafield codec, Prisma
extensions/delivery-cart-block/   app block + app embed, shared engine bundle
tests/golden/<carrier>/<case>/{order.json,expected.csv}
```
Flow: settings UI → zod `SettingsV1` → one app-owned JSON metafield → Liquid reads it in the block → the bundled engine shows the selectable dates → `/cart/update.js` writes `attributes` → order `customAttributes`/`note_attributes` [B] → order loader → `parseNoteAttributes` → `NormalizedOrder` → adapter → serializer → encoder → download. Routes stay thin.

## 2) Data model
| Data | Store |
|---|---|
| Settings: holidays, New Year preset (12/29–1/3), closed weekdays, cutoff, slots, prefecture→days, sender profile, CSV prefs | One app-owned JSON metafield `settings_v1` with `schemaVersion` and tested pure `migrate()` functions. Owner (AppInstallation vs Shop) to be decided once Liquid access is verified [U] |
| Per-product lead time | App-owned product metafield `app.lead_time_days` (integer), defined in `shopify.app.toml` [V: https://shopify.dev/docs/apps/build/custom-data/ownership] |
| Buyer choice | Cart attributes: visible labels `配達希望日`/`配達時間帯` plus machine keys `_delivery_date`, `_delivery_slot` (internal enum), `_delivery_v` |
| Sessions | Template Prisma session table |
| ExportLog (shop, orderId, carrier, exportedAt) | Prisma. **IDs only, no PII** |
| Customer name/address/phone | Never persisted or logged; fetched per export and streamed |

JSON metafield size limit: [U].

## 3) Cart block
- An app block for OS 2.0 cart sections, plus an app embed for cart drawers mounted at a merchant-configurable CSS selector (with Dawn presets). No theme code edits; ScriptTag and Asset API are not used.
- Native `<select>` elements, no date-picker library, theme CSS inheritance, deferred JS (target ~15 KB gzipped). The block recomputes on cart change: theme events where they exist, otherwise a MutationObserver.
- If the merchant sets the field as required, the client disables checkout until a valid date is chosen. Shoppers can edit cart attributes, so the server re-validates on the CSV screen and marks orders "要確認".
- **Buy Now / express wallets skip the cart** [B]. Mitigations: document the limitation in the setup guide and listing; show a "日時指定なし" filter; allow per-row date/slot entry before export; explain the theme's own toggle for hiding dynamic checkout buttons.

## 4) Earliest-date engine
```ts
earliestDate({ now: ZonedInstant /*injected*/, settings: SettingsV1,
  items: {productId, leadTimeDays}[], prefecture?: PrefectureCode })
  : { earliest: LocalDate; selectable: LocalDate[]; reasons: Reason[] }
```
- Steps: if past the cutoff, start tomorrow → add max(lead time) in **shipping business days** → add region days in **calendar days** (worst case when the prefecture is unknown) → apply the window (e.g. +30). Date-only JST arithmetic; no browser-local `Date`. Document the order of steps in the settings UI.
- One module serves the extension bundle and the server, so they cannot disagree. An admin "preview" shows `reasons[]`.
- **Tests (Vitest):**
  - Table-driven cases: cutoff ±1 minute, Friday before a holiday, Golden Week, 振替休日, New Year across the year boundary, leap day, lead time 0, empty cart, remote prefecture, an all-closed horizon (returns empty, never loops).
  - fast-check properties: earliest ≥ today; never a closed ship day; monotonic in `now` and in lead time; adding a holiday never moves the date earlier.
  - Year-long golden calendar; bundle-vs-server parity test.
- Holiday seed: merchant-editable; source/licence [U].

## 5) CSV export
```ts
interface CarrierAdapter { id; columns: ColumnSpec[] /*order,label,maxBytes,required*/;
  mapSlot(s): string|Issue; formatDate(d): string;
  toRow(o, s): Result<Row, Issue[]>; encoding: 'shift_jis'|'cp932'|'utf8_bom' }
```
- **Yamato B2 Cloud:** `YYYY/MM/DD`, slot codes 0812/1416/1618/1820/1921, JIS L1/L2 kanji only [B; https://bmypage.kuronekoyamato.co.jp/bmypage/pdf/new_exchange1.pdf].
- **Sagawa e-Hiden III:** 8-digit date, codes 01/12/14/16/18/04/19 [B; https://e-hiden3.sagawa-exp.co.jp/help_nsx/manual-takuhai.pdf]. Map each code to its slot from the PDF only.
- **Yu-Print R:** a fixed, documented column set plus a mapping guide, since the mapping happens on its import side [B].
- Encoding is set per adapter (iconv-lite) and runs after a pre-flight check. Characters outside JIS X 0208 (髙, 﨑, ①, emoji) produce an Issue with a suggested substitution, applied only when the merchant confirms.
- `splitAddress(province, city, address1, address2)` splits at token boundaries (spaces, 丁目, 番地, hyphens) within each carrier's byte limits. It normalizes full-/half-width characters, postal codes and phone numbers. Overflow becomes an Issue, never a silent truncation.
- **CSV screen:** Polaris index table; filters for unexported, delivery date, carrier, 要確認 and 日時指定なし; OK/warning/error badges; a preview of the exact row; inline date/slot edits; per-carrier download; ExportLog badge.
- **Golden tests:** byte-exact comparison (encoding, CRLF, quoting). Cases: gaiji name, long building name, missing slot, Buy Now order, remote island. Each expected file is imported once into the real carrier software, with the date and result recorded in the fixture README.

## 6) PCD and scopes
- Scopes: `read_orders`, `read_products`, plus a metafield-write scope only if required [U: whether app-owned product metafield writes need `write_products`]. Do not request `read_all_orders` (60-day default window [U] is sufficient for exports).
- Name, address and phone are **Level 2** PCD; request only those fields, not email [V: https://shopify.dev/docs/apps/launch/protected-customer-data]. Dev stores need no review [V]. Unapproved fields come back redacted, so the normalizer must show a "PCD未承認" banner rather than export blank labels [V].
- **Submit the request in week 1.** Level 2 duties: encrypted DB and backups, prod/test separation, an access log on the export route, an incident policy, zero PII retention. Compliance webhooks (customers/data_request, customers/redact, shop/redact) and the uninstall handler: names [U].

## 7) Risks
Covered above: theme variance (§3), Buy Now (§3), date bugs (§4), encoding/address (§5), PCD delay (§6). Spec drift: record spec URL and date per adapter.

## 8) MVP (5–6 weeks, following the brief's order)
- **W1:** scaffold; domain skeleton and golden harness; PCD request; setup-guide home; spike on Liquid metafield access.
- **W2:** engine with tests; cart block and embed.
- **W3:** settings admin (calendar, lead times, regions, sender profile); order list and CSV screen.
- **W4:** Yamato adapter, golden tests, real B2 import (steps 1–5 done in 3–4 weeks [B]).
- **W5–6:** Sagawa and Yu-Print R adapters, real imports, theme matrix, compliance webhooks, listing documentation.

## Open questions (verify before building)
1. Shift_JIS vs CP932 for **each** carrier (Yamato, Sagawa, Yu-Print R); Shift_JIS itself is unverified for Sagawa and Yu-Print R.
2. Column order, headers, required fields and byte limits from the Yamato and Sagawa PDFs (not re-read by any candidate).
3. How Liquid in a theme app extension reads app-owned metafields (`app.metafields` vs resource `$app` namespace), and which owner (AppInstallation vs Shop) to use.
4. JSON metafield size limit; extension asset size limit.
5. Whether underscore-prefixed cart attributes are hidden in checkout/admin.
6. Whether each carrier accepts a blank date/slot.
7. Scope needed to write app-owned product metafields.
8. Current Plus-only status of checkout UI extensions and the availability of Functions validation for non-Plus.
9. The theme-editor deep-link (`addAppBlockId`) parameter format.
10. Current compliance webhook names; whether the 60-day order window is enough.
11. Holiday dataset source and licence.
