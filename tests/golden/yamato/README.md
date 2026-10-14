# Yamato B2 Cloud golden files

Spec: [Ｂ２クラウド　送り状発行データレイアウト　入出力用](https://bmypage.kuronekoyamato.co.jp/bmypage/pdf/new_exchange1.pdf)

Retrieved 2026-10-14. Footer mark C-09. The label file is pages 1–4 (97 columns). Pages 5–7 are other masters and are not exported.

The PDF does not name Shift_JIS or CP932. These files are Shift_JIS, CRLF, with a header row of the official 項目名称. Characters outside JIS X 0208 level 1/2 (and JIS X 0201) are refused, because iconv-lite's Shift_JIS table is CP932 and would encode 髙, 﨑, and ①.

Width fold covers the ideographic space, fullwidth hyphen (U+FF0D), digits, and A–Z/a–z. The wave dash ～ (Shift_JIS 81 60) stays. A dash that is not in JIS X 0208 is flagged and is not rewritten to an ASCII hyphen.

`expected.csv` is the raw Shift_JIS file. A real import into B2 Cloud has not been run.

| Case | Result in this repo | Real B2 import |
|---|---|---|
| standard | byte file | not run |
| missing-slot | blank 配達時間帯 (p.1 空白 = 指定なし) | not run |
| remote-island | 沖縄県 address kept | not run |
| quoted-item | RFC 4180 quotes | not run |
| buy-now-edited | date filled in memory, then exported | not run |
| buy-now | no CSV; missing delivery date is flagged | n/a |
| gaiji | no CSV; 髙 is kept and suggested as 高 | n/a |
| long-building | no CSV; the 20-character building name is not cut | n/a |

送り状種類 is `0` (発払い, p.1). 発行枚数 is `1` (p.2). 出荷予定日 is the export day's JST date.
