# Sagawa e飛伝III golden files

Spec: [e飛伝III 操作マニュアル（飛脚宅配便）](https://e-hiden3.sagawa-exp.co.jp/help_nsx/manual-takuhai.pdf)

Retrieved 2026-10-14. Manual revision 5.5, 更新日 2026/09/28. The import layout is appendix a-1, printed pages 417–420 (74 columns). The header row is the 入力項目 name. 「標準_飛脚宅配便_CSV_ヘッダ有」 is the template named on printed page 36.

The manual describes CSV *output* as UTF-8 by default, with Shift_JIS as the legacy option (環境設定, printed p.344; FAQ c-1 item 10, printed p.475). It does not name the encoding of the import template. These files are Shift_JIS, CRLF, RFC 4180. `encodingVerified` is false.

Dates are 8 digits (printed p.418, example 20210201). 配達指定時間帯 on the same page is 01 午前中, 12 12:00～14:00, 14 14:00～16:00, 16 16:00～18:00, 18 18:00～20:00, 04 18:00～21:00, 19 19:00～21:00. This app's cart has no 12:00～14:00 or 18:00～21:00 slot, so 12 and 04 are never written. A missing slot is blank.

Printed p.417 marks only お届け先住所１ and お届け先名称１ as 必須. The app also refuses a blank ship date, delivery date, phone, postal code, sender, or item name. お客様コード is left blank; the layout does not mark it required.

App defaults for one prepaid parcel: 出荷個数 `1`, スピード指定 `000` (飛脚宅配便), クール便指定 `001` (指定なし), 営業所受取 `0`, SRC区分 `0`, 元着区分 `1` (元払). Pages 418–419.

Address and name lines are 16 characters (printed p.417, 全角文字). Half-width characters are converted to full-width on import, so a line is packed by character count, not by raw Shift_JIS bytes. These files do not pre-convert. 品名 is 全角 16 / 半角 32 (p.417). A cell that contains any full-width character is limited to 16 characters, because mixed text is converted to full-width. A pure half-width 品名 may use 32 characters. Breaks stay on a token boundary.

`expected.csv` is the raw Shift_JIS file. A real import into e飛伝III has not been run.

| Case | Result in this repo | Real e飛伝III import |
|---|---|---|
| standard | byte file, slot 01 | not run |
| missing-slot | blank 配達指定時間帯 | not run |
| remote-island | 沖縄県 address, slot 19 | not run |
| quoted-item | RFC 4180 quotes, slot 14 | not run |
| buy-now-edited | 8-digit date filled in memory, slot 18 | not run |
| buy-now | no CSV; missing delivery date is flagged | n/a |
| gaiji | no CSV; 髙 is kept and suggested as 高 | n/a |
| long-building | no CSV; the 80-character building name is not cut | n/a |
