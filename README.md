# 配達日時指定 + 送り状CSV

日本の Shopify 加盟店向けアプリです。カートで配達希望日・時間帯を選び、ヤマト運輸 B2クラウド、佐川急便 e-飛伝III、日本郵便 ゆうプリR 向けの送り状CSVを書き出します。Shopify Plus は不要です。

管理画面は **Polaris web components** と **App Bridge** です（React Polaris / Mantine は使いません）。日付エンジンと CSV アダプタは `src/domain/` の純関数で、Shopify SDK を import しません。

承認済み設計は [docs/architecture.md](docs/architecture.md) です。

## 現在の状態（W2: 最短日とカート）

最短日エンジン（`src/domain/delivery/earliest-date.ts`）と、テーマアプリ拡張のカートブロック / カートドロワー埋め込みが入っています。エンジンは `now` を外から受け取る純関数で、`reasons[]` に計算過程を返します。ストアフロントの `delivery-engine.js` は同じモジュールを Vite で束ねたものです。

計算順は次のとおりです。

1. カットオフ（JST）。その時刻以降は翌日から出荷を数える
2. カート内商品のリードタイムの最大値（出荷営業日）
3. 都道府県ごとの加算（暦日）。都道府県が不明なら、設定された地域日数の最大
4. 休業曜日・祝日・年始（12/29–1/3）に当たった配達日は、次の出荷できる日へ進める

設定の保存、注文一覧、実CSVはまだです。設定メタフィールドが無いあいだ、カートは初期値（日曜休み、カットオフ 15:00、年始プリセット、地域 2 日）で計算します。

## 既知の制限: Buy Now / エクスプレス決済

**「今すぐ購入」や Shop Pay などのエクスプレス決済はカートを経由しません。** カートブロックもドロワー埋め込みも、これらのボタンには届きません。配達希望日・時間帯は保存されず、送り状CSVでは「日時指定なし」になります。書き出し前に行内で日付・時間帯を入力します（入力はメモリ上のみで、注文には書き戻しません）。

商品ページにブロックを置いて line item properties で受ける方式は、ダイナミックチェックアウトボタンがそれを残すか未検証のため入れていません。

テーマ側のダイナミックチェックアウトボタンを非表示にすると、通常のカート経由に誘導できます。テーマエディタでブロックを開くと、同じ注意が表示されます。

## 必要なもの（人が用意）

このリポジトリには Partner アプリも開発ストアも含まれていません。ローカルで動かすには次が必要です。

1. [Shopify Partners](https://www.shopify.com/partners) アカウント
2. 開発ストア（OS 2.0 テーマ。Dawn など）
3. Partner Dashboard で作成したアプリ（この CLI からは作成しません）
4. アプリの Client ID / Secret（`.env` に入れる。リポジトリにはコミットしない）
5. 本番で氏名・住所・電話を出すには、保護された顧客データ（PCD）レベル2の申請。開発ストアでは不要です

請求（billing）の設定もこのスキャフォールドでは行いません。

## セットアップ

Node.js 22.15 以上。

```bash
cp .env.example .env
# .env に SHOPIFY_API_KEY / SHOPIFY_API_SECRET / SHOPIFY_APP_URL を記入
npm install
npx prisma migrate dev
```

Shopify CLI を入れ、Partner アプリにリンクしてから開発サーバーを起動します。

```bash
npm install -g @shopify/cli
npm run config:link
npm run dev
```

`shopify app dev` がトンネル URL を `SHOPIFY_APP_URL` に書き、埋め込み管理画面を開きます。アプリのインストールは開発ストアに対して CLI が案内します。このリポジトリの CI やエージェントはストアへのインストールを行いません。

## よく使うコマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー（Shopify CLI） |
| `npm run typecheck` | React Router の型生成 + `tsc` |
| `npm run lint` | ESLint |
| `npm test` | Vitest（ドメインの単体テスト） |
| `npm run build` | 拡張のエンジン束ね + 本番ビルド |
| `npm run build:extension` | カート拡張の `delivery-engine.js` だけ再生成 |

## ディレクトリ

```
app/routes/            管理画面（セットアップ / 設定 / CSV / エクスポート）と webhook
src/domain/            純ドメイン（Shopify / Prisma / IO 禁止）
  calendar/            LocalDate（JST YYYY-MM-DD）、営業日カレンダー
  delivery/            時間帯、47都道府県、earliestDate()、選択の検証
src/storefront/        カートUIの純関数（日付候補と cart attributes）
  order/               NormalizedOrder、note attributes のパース
  address/             住所分割、JIS チェック
  carriers/            Yamato / Sagawa / Yu-Print R アダプタ
  encoding/            RFC 4180 CSV、エンコード
src/infra/             GraphQL ラッパ、zod メタフィールド codec
extensions/delivery-cart-block/   カートのアプリブロック + ドロワー埋め込み
tests/golden/          キャリア別ゴールデンCSV（W4 以降）
docs/architecture.md   承認済みアーキテクチャ
```

セッションと出力ログ（注文ID・キャリアのみ。PII なし）は Prisma（既定は SQLite）です。

## スコープ

`read_orders`、`read_products`、`write_products`。`read_all_orders` は要求しません。商品メタフィールドの保存には `write_products` が必要です。
