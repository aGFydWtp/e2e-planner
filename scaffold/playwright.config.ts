import { defineConfig, devices } from '@playwright/test';

/**
 * e2e-planner scaffold の推奨設定。
 * - 証跡（trace/video/screenshot）を失敗時に確実に残す
 * - 中間状態を評価できるよう trace を on-first-retry で取得
 * - VRT（toHaveScreenshot）の差分しきい値を控えめに設定
 * baseURL は環境変数 E2E_BASE_URL で上書きする。
 */
export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/.artifacts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e/.report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    // ロケール/タイムゾーンは必ず固定する。探索環境（実サイト探索時のブラウザ）と
    // 実行環境（headless, 既定 en-US/UTC）がズレると、ローカライズ文言や日付の
    // assert が「環境依存」で落ちる。対象アプリの想定ロケールに合わせること。
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // 重い SPA（Asana 等）では goto/reload の既定 `load` 待ちが長く timeout しやすい。
    // 個々の goto/reload では `{ waitUntil: 'domcontentloaded' }` を指定し、描画後の
    // web-first assertion で待つこと（読み込み完了の判定は assertion 側に寄せる）。
    // navigationTimeout は安全側の上限。固定待機の代わりにはしない。
    navigationTimeout: 30_000,
  },
  expect: {
    // 視覚回帰: アンチエイリアス等の微差を許容しつつ崩れは検出
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  projects: [
    // ① 認証セットアップ。テスト本体より先に1回走り、storageState を e2e/.auth/ に保存する。
    //    認証不要なアプリなら、この project と下の dependencies を丸ごと削除してよい。
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    // ② 認証済みテスト（user ロール）。setup の出力した state を前提に開始する。
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // ログイン済みセッションを焼き付けた state を全テストの開始状態にする。
        // → 各テストでログイン操作を踏まない（ログインフロー検証だけは別扱い、下記参照）。
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // ③ 未ログイン状態を検証するテスト（ログイン画面・検証エラー・権限なしリダイレクト等）。
    //    state を持たない project に分け、ファイル名末尾を *.guest.spec.ts 等で振り分ける。
    // {
    //   name: 'chromium-guest',
    //   testMatch: /.*\.guest\.spec\.ts/,
    //   use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
    // },

    // ── admin など別ロールを足すとき ─────────────────────────────
    // auth.setup.ts に admin 用 setup を追加して e2e/.auth/admin.json を保存し、ここに project を足す:
    // { name: 'chromium-admin', use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/admin.json' }, dependencies: ['setup'] },

    // 視覚補完やクロスブラウザが必要なら追加（同様に storageState/dependencies を付ける）:
    // { name: 'firefox', use: { ...devices['Desktop Firefox'], storageState: 'e2e/.auth/user.json' }, dependencies: ['setup'] },
  ],
});
