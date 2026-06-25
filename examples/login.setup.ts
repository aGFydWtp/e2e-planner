import { test as setup, expect } from '@playwright/test';

/**
 * 参考例: 認証セットアップ（setup project）。
 * scaffold/e2e/auth.setup.ts と同じ役割。テスト本体の前に1回走り、
 * ログイン済みの storageState を e2e/.auth/user.json に保存する。
 * 認証情報は env（E2E_USER / E2E_PASS）で渡す。
 *
 * playwright.config.ts 側で次の projects 構成を前提にする:
 *   { name: 'setup', testMatch: /.*\.setup\.ts/ }
 *   { name: 'chromium', use: { storageState: 'e2e/.auth/user.json' }, dependencies: ['setup'] }
 */

const USER = process.env.E2E_USER ?? 'user@example.com';
const PASS = process.env.E2E_PASS ?? 'password';

setup('authenticate as user', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(USER);
  await page.getByLabel('パスワード').fill(PASS);
  await page.getByRole('button', { name: 'ログイン' }).click();

  // ログイン確定を待ってから state を保存する（未確定セッションを焼き付けない）。
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();

  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
