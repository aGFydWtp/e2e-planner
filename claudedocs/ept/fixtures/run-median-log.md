# run-median-log（録画した playwright test 実行ログ）

> このファイルは e2e-run の EPT 評価 fixture。executor には「実行した結果のログ＋trace/error 抜粋」としてそのまま手渡す。
> 実 Playwright は回さない設定。executor は本ログだけを根拠に **6分類・修正先ルーティング**を行う。
> 仕込み（混在）: ロケータ破損1・待機不足1・VRT baseline 初回未生成1。分類名はログには書かれていない。

---

## feature

feature-name: `expense`（form 認証アプリ。spec は `e2e/tests/expense.spec.ts`）
実行コマンド: `npx playwright test e2e/tests/expense.spec.ts`
実行日時: 2026-06-26 14:10
証跡出力: HTML レポート=`e2e/.report` / 生証跡=`e2e/.artifacts`

## コンソール出力

```
Running 6 tests using 4 workers

  ✓  1 [chromium] › expense.spec.ts:12:5 › S1 ログイン成功 (1.4s)
  ✓  2 [chromium] › expense.spec.ts:24:5 › S2 申請一覧が表示される (1.1s)
  ✘  3 [chromium] › expense.spec.ts:40:5 › S3 新規申請を提出できる (31.2s)
  ✘  4 [chromium] › expense.spec.ts:70:5 › S4 必須未入力で提出するとエラー (2.3s)
  ✘  5 [chromium] › expense.spec.ts:95:5 › S5 ダッシュボードの視覚比較 (0.9s)
  ✓  6 [chromium] › expense.spec.ts:110:5 › S6 セッション切れでログインへ戻る (1.2s)

  3 failed, 3 passed (36.0s)
```

## 失敗 1: S3 新規申請を提出できる

```
  3) expense.spec.ts:40:5 › S3 新規申請を提出できる ──────────────────────

    Error: locator.click: Timeout 30000ms exceeded.
    Call log:
      - waiting for getByRole('button', { name: '提出する' })
      -   locator resolved to 0 elements

      at expense.spec.ts:58:48

      56 |   await page.getByLabel('費目').selectOption('交通費');
      57 |   await page.getByLabel('金額').fill('1200');
    > 58 |   await page.getByRole('button', { name: '提出する' }).click();
         |                                                ^
```

trace 抜粋（`e2e/.artifacts/S3-提出/trace.zip`）: フォーム画面の実 DOM 上のボタンラベルは「**提出**」（"する" は付かない）。spec 側のラベル指定が実体とズレている。画面遷移・前提データ・API はいずれも正常で、要素特定だけが外れている。

screenshot: `e2e/.artifacts/S3-提出/test-failed-1.png`（フォームは正しく表示・ボタンは「提出」で存在）

## 失敗 2: S4 必須未入力で提出するとエラー

```
  4) expense.spec.ts:70:5 › S4 必須未入力で提出するとエラー ───────────────

    Error: expect(received).toBeVisible()
    Call log:
      - expect.toBeVisible with timeout 5000ms
      - waiting for getByText('金額は必須です')

      at expense.spec.ts:84:42

      82 |   await page.getByRole('button', { name: '提出' }).click();
      83 |   // バリデーションエラーを確認
    > 84 |   await expect(page.getByText('金額は必須です')).toBeVisible({ timeout: 1000 });
         |                                          ^
```

trace 抜粋（`e2e/.artifacts/S4-必須/trace.zip`）: 「提出」クリック直後に `timeout:1000` で即 assert している。実際にはバリデーション API（`POST /api/expenses/validate`）の応答後にエラーメッセージが描画され、trace 上では **約1.6s 後にメッセージ DOM が出現**している（タイムライン参照）。エラー文言・ロケータ自体は正しい。

## 失敗 3: S5 ダッシュボードの視覚比較

```
  5) expense.spec.ts:95:5 › S5 ダッシュボードの視覚比較 ───────────────────

    Error: A snapshot doesn't exist at
      e2e/tests/expense.spec.ts-snapshots/dashboard-chromium-darwin.png.

    Note: writing actual snapshot. Re-run to compare.

      at expense.spec.ts:103:33

     103 |   await expect(page).toHaveScreenshot('dashboard.png');
         |                                 ^
```

（baseline ディレクトリには `dashboard-chromium-darwin.png` が存在しない。今回が初回実行。）
