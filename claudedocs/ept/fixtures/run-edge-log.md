# run-edge-log（録画した playwright test 実行ログ・破壊的/SSO）

> このファイルは e2e-run の EPT 評価 fixture。executor には「実行した結果のログ＋trace/error 抜粋」としてそのまま手渡す。
> 実 Playwright は回さない。executor は本ログだけを根拠に **6分類・修正先ルーティング**を行う。分類名・修正先はログには書かれていない。
> 仕込み: (1) storageState 失効で全赤（Run A）。(2) 再認証後の Run B で、teardown 末尾 toHaveCount(0) 失敗 / .click().catch のフック hang で describe ブロック全滅 / plan 未記載の規約同意インタースティシャルによる失敗、が混在。

---

## feature

feature-name: `board`（SSO=Okta 認証のタスクボード。spec は `e2e/tests/board.spec.ts`）
実行コマンド: `npx playwright test e2e/tests/board.spec.ts`
証跡出力: HTML レポート=`e2e/.report` / 生証跡=`e2e/.artifacts`
storageState: `e2e/.auth/member.json`（auth.setup.ts が実ログイン済みブラウザから connectOverCDP で採取する想定）

---

## Run A（2026-06-26 09:02）

```
Running 6 tests using 4 workers

  ✘  1 [chromium] › board.spec.ts:14:5 › S1 ボード一覧が表示される (6.0s)
  ✘  2 [chromium] › board.spec.ts:28:5 › S2 タスクを完了にできる (6.1s)
  ✘  3 [chromium] › board.spec.ts:42:5 › S3 タスクを作成→削除（自己完結） (6.2s)
  ✘  4 [chromium] › board.spec.ts:80:5 › S4 戻る操作でボードに戻る (6.0s)
  ✘  5 [chromium] › board.spec.ts:95:5 › S5 再読込後も一覧が保たれる (6.1s)
  ✘  6 [chromium] › board.spec.ts:110:5 › S6 ボード読込中のローディング (6.0s)

  6 failed (12.4s)
```

全 test 共通の失敗:

```
    Error: expect(page).toHaveURL(expected)
    Expected pattern: /\/board/
    Received string:  "https://collab.okta.com/oauth2/v1/authorize?client_id=..."

      at e2e/tests/board.spec.ts:16:24
```

trace 抜粋（`e2e/.artifacts/S1/trace.zip`）: 各 test の `page.goto('/board')` 直後に **Okta ログイン画面へリダイレクト**されている。`e2e/.auth/member.json` の cookie が期限切れで、storageState がセッションとして成立していない。spec のロケータ・assert ロジック自体は実行に到達していない（最初の goto で全て弾かれている）。auth.setup.ts は今回の実行前に走っていない。

---

## Run B（同日 10:40 / 実ログイン済みブラウザから storageState を採取し直して再実行）

```
Running 6 tests using 4 workers

  ✓  1 [chromium] › board.spec.ts:14:5 › S1 ボード一覧が表示される (2.1s)
  ✘  2 [chromium] › board.spec.ts:28:5 › S2 タスクを完了にできる (32.5s)
  ✘  3 [chromium] › board.spec.ts:42:5 › S3 タスクを作成→削除（自己完結） (5.4s)
  ✓  4 [chromium] › board.spec.ts:80:5 › S4 戻る操作でボードに戻る (2.3s)
  ✓  5 [chromium] › board.spec.ts:95:5 › S5 再読込後も一覧が保たれる (2.0s)
  ✘  6 [chromium] › board.spec.ts:110:5 › S6 ボード読込中のローディング (33.1s)

  3 failed, 3 passed (40.2s)
```

### Run B 失敗 2: S2 タスクを完了にできる（32.5s）

```
  2) board.spec.ts:28:5 › S2 タスクを完了にできる ──────────────────────

    Test timeout of 30000ms exceeded while running "beforeEach" hook.

      26 | test.beforeEach(async ({ page }) => {
      27 |   await page.goto('/board');
    > 28 |   await page.getByRole('button', { name: 'お知らせを閉じる' }).click().catch(() => {});
         |                                                                  ^
      29 |   await page.getByRole('button', { name: '今日のタスク' }).click();
```

trace 抜粋（`e2e/.artifacts/S2/trace.zip`）: beforeEach の `.click().catch(() => {})` で「お知らせを閉じる」バナーを閉じようとしているが、**バナーは表示されているのにオーバーレイが actionability を満たさず**（別要素が重なりクリック不能）、`.click()` が 30s ぶら下がってから握りつぶされ、hook 全体が timeout。S2 本体には到達していない。同じ beforeEach を共有する S6 も同様に巻き込まれている（下記）。

### Run B 失敗 6: S6 ボード読込中のローディング（33.1s）

```
  6) board.spec.ts:110:5 › S6 ボード読込中のローディング ──────────────────

    Test timeout of 30000ms exceeded while running "beforeEach" hook.
      （S2 と同一の beforeEach。'お知らせを閉じる' の .click().catch で 30s hang）
```

### Run B 失敗 3: S3 タスクを作成→削除（自己完結）

```
  3) board.spec.ts:42:5 › S3 タスクを作成→削除（自己完結） ─────────────────

    1) 本体 test: passed（作成→削除クリックまで緑）
    2) afterEach（teardown 検証）で失敗:

    Error: expect(locator).toHaveCount(expected)
      Expected: 0
      Received: 1

      at e2e/tests/board.spec.ts:74:55

      70 | test.afterEach(async () => {
      71 |   const ctx = await browser.newContext({ storageState: 'e2e/.auth/member.json' });
      72 |   const p = await ctx.newPage();
      73 |   await p.goto('/board');
    > 74 |   await expect(p.getByText(uniqueName)).toHaveCount(0); // 作成名が消えたことの検証
         |                                          ^
```

コンソールに以下の警告も出力:

```
  [teardown] cleanup click failed (best-effort): locator.click: Timeout
    waiting for getByRole('menuitem', { name: '削除' })
```

trace 抜粋（`e2e/.artifacts/S3/trace.zip`）: 本体は「作成→行メニュー→削除クリック」まで緑だったが、afterEach で認証済み newContext から開き直して件数を数えると、作成した `task-20260626-1041`（ユニーク名）が **まだ 1 件残っている**。teardown の削除クリック（best-effort）はログ上「`menuitem '削除'` が出ず Timeout」で発火しておらず、警告に留まったまま残骸が消えていない。前提データ（seed）や storageState は正常（S1/S4/S5 は緑）。

### Run B 補足ログ（探索/状態遷移に関する観測）

```
- 別環境（staging-2）で同 spec を回すと、S1 の goto 直後に "利用規約に同意してください" の
  全画面モーダルが表示され、'同意する' を押さないとボードに進めない。
  plan（遷移マップ）にこのインタースティシャル状態は記載が無く、spec も同意操作を踏んでいないため
  S1 がこの環境では一覧到達前に停止する。Run A/B の本番相当環境では当該モーダルは出ない。
```

### 再評価メモ

```
- Run A→Run B で結果が変わったのは storageState の鮮度が原因（再採取で S1/S4/S5 が赤→緑）。
- S2/S6 の beforeEach hang は Run A/B とも再現（環境差なし）。
- S3 の toHaveCount(1) 残骸は Run B で初観測（Run A は goto で全赤のため未到達）。
```
