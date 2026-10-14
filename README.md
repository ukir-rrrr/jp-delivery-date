# 配達日時指定 + 送り状CSV

日本の Shopify 加盟店向けアプリです。カートで配達希望日・時間帯を選び、ヤマト運輸 B2クラウド、佐川急便 e-飛伝III、日本郵便 ゆうプリR 向けの送り状CSVを書き出します。Shopify Plus は不要です。

管理画面は **Polaris web components** と **App Bridge** です（React Polaris / Mantine は使いません）。日付エンジンと CSV アダプタは `src/domain/` の純関数で、Shopify SDK を import しません。

承認済み設計は [docs/architecture.md](docs/architecture.md) です。

## 現在の状態（W1 スキャフォールド）

公式の [React Router アプリテンプレート](https://github.com/Shopify/shopify-app-template-react-router)（TypeScript、Prisma セッション）を土台に、ディレクトリと画面の骨格だけを置いています。最短日エンジンの本実装、カートブロックの動作、設定の保存、実CSVは以降の週です。

## 既知の制限: Buy Now / エクスプレス決済

**「今すぐ購入」や Shop Pay などのエクスプレス決済はカートを経由しません。** そのため配達希望日・時間帯は保存されません。送り状CSVでは「日時指定なし」になり、書き出し前に行内で日付・時間帯を入力する必要があります（入力はメモリ上のみで、注文には書き戻しません）。

テーマ側のダイナミックチェックアウトボタンを非表示にすると、通常のカート経由に誘導できます。

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
| `npm run build` | 本番ビルド |

## ディレクトリ

```
app/routes/            管理画面（セットアップ / 設定 / CSV / エクスポート）と webhook
src/domain/            純ドメイン（Shopify / Prisma / IO 禁止）
  calendar/            LocalDate（JST YYYY-MM-DD）、営業日カレンダー
  delivery/            時間帯、47都道府県、earliestDate()
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

`read_orders` と `read_products`。`read_all_orders` は要求しません。アプリ所有の商品メタフィールド書き込みに `write_products` が要るかは未検証です。
