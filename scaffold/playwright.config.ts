import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// .env があれば読む。無くても CI 等の実環境変数で動く（防御的ロード）。
// 順序重要: ここで .env を読んでから下の E2E_AUTH_MODE / E2E_BASE_URL を参照する。
loadEnv();

/**
 * e2e-planner scaffold の推奨設定。
 * - 証跡（trace/video/screenshot）を失敗時に確実に残す
 * - 中間状態を評価できるよう trace を on-first-retry で取得
 * - VRT（toHaveScreenshot）の差分しきい値を控えめに設定
 * baseURL は環境変数 E2E_BASE_URL で上書きする。
 */

// 認証モードで projects 構成を切り替える（E2E_AUTH_MODE、既定 'form'）。
//   form           : setup project が form ログイン → storageState を自動生成（dependencies:['setup']）
//   prebuilt-state : SSO/OTP 等で手動採取した e2e/.auth/user.json を使う（setup を組まない・dependencies 空）
//   none           : 認証不要（storageState を持たない）
const authMode = process.env.E2E_AUTH_MODE ?? 'form';

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
    // ① 認証セットアップ。form モードのときだけ組む。テスト本体より先に1回走り、
    //    storageState を e2e/.auth/ に保存する。
    //    prebuilt-state（SSO/OTP 等で手動採取した user.json を使う）/ none（認証不要）では
    //    setup を組まない（前者は採取済みの state、後者は state を持たない）。
    // testDir は本体テスト用に ./e2e/tests を指すため、setup はここで testDir を ./e2e に上書きする。
    // （auth.setup.ts は e2e/ 直下に置く想定。上書きしないと testDir 外で setup が発見されず form モードが動かない。）
    ...(authMode === 'form' ? [{ name: 'setup', testDir: './e2e', testMatch: /auth\.setup\.ts/ }] : []),

    // ② 認証済みテスト（user ロール）。
    //    form/prebuilt-state は state を前提に開始し、none は空 state で開始する。
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // ログイン済みセッションを焼き付けた state を全テストの開始状態にする。
        // → 各テストでログイン操作を踏まない（ログインフロー検証だけは別扱い、下記参照）。
        // 採取側が indexedDB:true で保存した state は IndexedDB snapshot を含みうる。
        // ここで storageState を指定するだけで cookie/localStorage/IndexedDB すべて自動復元される
        // （Firebase Auth 等の IndexedDB トークンも復元。addInitScript 等の自前注入は不要・Playwright 1.51+）。
        // none モードのみ state を持たない（空の cookies/origins で開始）。
        storageState: authMode === 'none' ? { cookies: [], origins: [] } : 'e2e/.auth/user.json',
      },
      // form のみ setup の完了を待つ。prebuilt-state は手動採取済み、none は state 不要なので依存しない。
      dependencies: authMode === 'form' ? ['setup'] : [],
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
