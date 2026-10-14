import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>配達日時指定 + 送り状CSV</h1>
        <p className={styles.text}>
          カートで配達希望日・時間帯を選び、ヤマト・佐川・ゆうプリR の送り状CSVを書き出します。
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>ショップドメイン</span>
              <input className={styles.input} type="text" name="shop" />
              <span>例: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              ログイン
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>カートで日付指定。</strong>
            OS 2.0 のアプリブロックとドロワー用埋め込み。テーマのコードは編集しません。
          </li>
          <li>
            <strong>キャリア別CSV。</strong>
            ヤマト B2クラウド、佐川 e-飛伝III、ゆうプリR。バイト単位のゴールデンテストで検証します。
          </li>
          <li>
            <strong>Buy Now は対象外。</strong>
            今すぐ購入・エクスプレス決済はカートを経由しないため、希望日は保存されません。
          </li>
        </ul>
      </div>
    </div>
  );
}
