import { test as setup, expect } from '@playwright/test';

/**
 * 認証セットアップ（setup project）。
 * テスト本体の前に1回だけ走り、ログイン済みの storageState を `e2e/.auth/` に保存する。
 * 各テストはこの state を前提に開始するため、テスト内でログイン操作を踏まない。
 *
 * 認証情報は環境変数で渡す（.env.example 参照、実値の .env はコミットしない）。
 *   E2E_USER=...  E2E_PASS=...
 *
 * ── ロールを増やすとき ───────────────────────────────────────────
 * 管理者など別ロールが必要なら、もう1つ setup を足して別ファイルに保存する:
 *   setup('authenticate as admin', async ({ page }) => {
 *     ... admin で同じ手順 ...
 *     await page.context().storageState({ path: 'e2e/.auth/admin.json' });
 *   });
 * playwright.config.ts の projects に role ごとの storageState を割り当てる。
 *
 * ── SSO / OTP / 2FA で form 自動化できない場合 ────────────────────
 * このファイルでは自動化しない。手動で1回ログインして state を取り出すか、
 * API ログイン（request.post でトークン取得 → state 注入）に置き換える。手順は README 参照。
 */

const USER = process.env.E2E_USER ?? 'user@example.com';
const PASS = process.env.E2E_PASS ?? 'password';
const STORAGE_STATE = 'e2e/.auth/user.json';

setup('authenticate as user', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(USER);
  await page.getByLabel('パスワード').fill(PASS);
  await page.getByRole('button', { name: 'ログイン' }).click();

  // ログイン完了を「URL遷移」と「ログイン後にしか出ない要素」で確認してから state を保存する。
  // ここを待たずに保存すると、未確定のセッションを焼き付けてしまう。
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
