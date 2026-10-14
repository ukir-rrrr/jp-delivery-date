# Yu-Print R golden files

Japan Post docs, retrieved 2026-10-14:

- [８．入出力インターフェース仕様書](https://www.post.japanpost.jp/yu-packprint-r/member/download/instructions/%EF%BC%98%EF%BC%8E%E5%85%A5%E5%87%BA%E5%8A%9B%E3%82%A4%E3%83%B3%E3%82%BF%E3%83%BC%E3%83%95%E3%82%A7%E3%83%BC%E3%82%B9%E4%BB%95%E6%A7%98%E6%9B%B8.pdf) (2025-08-07). 発送予定データ 取込項目一覧 is printed pp.1-1–1-3. Byte counts treat a full-width character as 2 bytes and say the counts are for Shift-JIS.
- 区分・種別コード一覧, printed p.7-1. 配達時間帯区分 uses the ゆうプリR設定値 column: 00 希望しない, 51 午前中, 53 14～16時, 54 16～18時, 55 18～20時, 57 19～21時. 56 (20～21時) was abolished on 2024-10-01 and is not written. 52, 61, 62, and 63 have no cart slot.
- 取り込みが行える日付形式, printed p.8-1. YYYYMMDD is accepted. 発送予定日 and 配達希望日 are 8 bytes, so the file uses 8 digits rather than `YYYY/MM/DD`.
- [６－１．フィルタ設定別冊](https://www.post.japanpost.jp/yu-packprint-r/member/download/instructions/%EF%BC%96%EF%BC%8D%EF%BC%91%EF%BC%8E%E3%83%95%E3%82%A3%E3%83%AB%E3%82%BF%E8%A8%AD%E5%AE%9A%E5%88%A5%E5%86%8A%EF%BC%88%E3%83%95%E3%82%A9%E3%83%BC%E3%83%9E%E3%83%83%E3%83%88%E4%B8%80%E8%A6%A7%EF%BC%89.pdf) (2024-10-01). Standard formats say the character set is Shift-JIS or UTF-8. The filter screen also lists EUC and UTF-16.

This is not standard format v1. That format is a fixed 51-column file whose unused columns must still be present, and whose value conversion is built in. Yu-Print R maps an arbitrary CSV in the import filter, so this file is a 20-column layout whose headers are the official 項目名.

## Mapping guide

In 取込フィルタ, set 列見出し to あり and map each header to the 発送予定 item of the same name. No conversion is required for dates (YYYYMMDD, p.8-1) or for 配達時間帯区分 (already ゆうプリR設定値). If a saved filter expects the older reference codes (51→60, 53→63, and so on, printed p.7-1 ゆうプリ設定値), convert there. 00 means 希望しない.

◎ on 発送予定（簡易） makes お届け先の郵便番号・住所・名称 and ご依頼主の郵便番号・住所・名称 required (pp.1-1–1-2). The app also refuses a blank delivery date, ship date, phone, or item name.

These files are Shift_JIS, CRLF, RFC 4180. `encodingVerified` is false.

`expected.csv` is the raw Shift_JIS file. A real import into ゆうプリR has not been run.

| Case | Result in this repo | Real ゆうプリR import |
|---|---|---|
| standard | byte file, slot 51 | not run |
| missing-slot | 配達時間帯区分 `00` | not run |
| remote-island | 沖縄県 address, slot 57 | not run |
| quoted-item | RFC 4180 quotes, slot 53 | not run |
| buy-now-edited | 8-digit date filled in memory, slot 55 | not run |
| buy-now | no CSV; missing delivery date is flagged | n/a |
| gaiji | no CSV; 髙 is kept and suggested as 高 | n/a |
| long-building | no CSV; the 80-character building name is not cut | n/a |
