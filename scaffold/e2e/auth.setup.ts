import { test as setup, expect } from '@playwright/test';

/**
 * 認証セットアップ（setup project）。
 * テスト本体の前に1回だけ走り、ログイン済みの storageState を `e2e/.auth/` に保存する。
 * 各テストはこの state を前提に開始するため、テスト内でログイン操作を踏まない。
 *
 * 認証情報は環境変数で渡す（.env.example 参照、実値の .env はコミットしない）。
 *   E2E_USER=...  E2E_PASS=...
 * デフォルト値は持たない（未設定のまま実在しない資格情報でログインを試みて誤検知するのを防ぐため）。
 * 未設定なら setup 本体の先頭で fail-fast する（下記）。
 *
 * ── ロールを増やすとき ───────────────────────────────────────────
 * 管理者など別ロールが必要なら、もう1つ setup を足して別ファイルに保存する:
 *   setup('authenticate as admin', async ({ page }) => {
 *     ... admin で同じ手順 ...
 *     await page.context().storageState({ path: 'e2e/.auth/admin.json', indexedDB: true });
 *   });
 * playwright.config.ts の projects に role ごとの storageState を割り当てる。
 *
 * ── SSO / OTP / 2FA で form 自動化できない場合 ────────────────────
 * このファイルでは自動化しない。手動で1回ログインして state を取り出すか、
 * API ログイン（request.post でトークン取得 → state 注入）に置き換える。手順は README 参照。
 * その場合は playwright.config.ts を E2E_AUTH_MODE=prebuilt-state で動かす
 * （setup project を組まず、手動採取した storageState をそのまま使う）。
 *
 * ── worker ごとに別アカウントを使うとき ──────────────────────────
 * 並列 worker が同一アカウントを同時操作すると壊れる状態（カート・下書き・単一セッション等）が
 * あるなら、E2E_USER_POOL を設定して spec の import を e2e/fixtures/test.ts に切り替える。
 * その場合も本 setup は既定 state（プール未設定時のフォールバック）を作るので残しておく。
 */

// 保存先は playwright.config.ts の STORAGE_STATE と同じ定義（env で差し替え可）。
// config 側の project が読むパスと必ず一致させる（片方だけ変えると setup が作った state を誰も読まない）。
const STORAGE_STATE = process.env.E2E_STORAGE_STATE ?? 'e2e/.auth/user.json';

setup('authenticate as user', async ({ page }) => {
  const USER = process.env.E2E_USER;
  const PASS = process.env.E2E_PASS;
  if (!USER || !PASS) {
    throw new Error(
      'form 認証モードでは E2E_USER / E2E_PASS が必須です（.env.example 参照）。' +
        '未ログイン導線のみ検証するなら playwright.config.ts の chromium-guest project を' +
        '有効化（コメント解除）してから --project=chromium-guest、' +
        'SSO/OTP 環境なら E2E_AUTH_MODE=prebuilt-state を使用してください。'
    );
  }

  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(USER);
  await page.getByLabel('パスワード').fill(PASS);
  await page.getByRole('button', { name: 'ログイン' }).click();

  // ログイン完了を「URL遷移」と「ログイン後にしか出ない要素」で確認してから state を保存する。
  // ここを待たずに保存すると、未確定のセッションを焼き付けてしまう。
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();

  // indexedDB:true で cookie/localStorage に加え IndexedDB スナップショットも採取する。
  // Firebase Auth など認証トークンを IndexedDB に置くアプリでも、ここで採取できる
  // （Playwright 1.51+。復元は playwright.config の storageState 指定だけで自動）。
  await page.context().storageState({ path: STORAGE_STATE, indexedDB: true });
});
