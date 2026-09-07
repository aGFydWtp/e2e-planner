import { test as setup, expect } from '@playwright/test';

/**
 * 参考例: 認証セットアップ（setup project）。
 * scaffold/e2e/auth.setup.ts と同じ役割。テスト本体の前に1回走り、
 * ログイン済みの storageState を STORAGE_STATE（既定 e2e/.auth/user.json）に保存する。
 * 認証情報は env（E2E_USER / E2E_PASS）で渡す。デフォルト値は持たない
 * （未設定のまま実在しない資格情報でログインを試みて誤検知するのを防ぐため）。
 * 未設定なら setup 本体の先頭で fail-fast する（下記）。
 *
 * playwright.config.ts 側で次の projects 構成を前提にする（scaffold/playwright.config.ts の実値）:
 *   const STORAGE_STATE = process.env.E2E_STORAGE_STATE ?? 'e2e/.auth/user.json';
 *   testDir: './e2e/tests'
 *   projects: [
 *     // testDir を ./e2e に上書きしないと、tests/ の外にあるこのファイルが発見されない
 *     { name: 'setup', testDir: './e2e', testMatch: /auth\.setup\.ts/ },
 *     { name: 'chromium', use: { storageState: STORAGE_STATE }, dependencies: ['setup'], grepInvert: /@heavy/ },
 *     { name: 'chromium-heavy', use: { storageState: STORAGE_STATE }, dependencies: ['setup'], grep: /@heavy/, fullyParallel: false, timeout: 180_000 },
 *   ]
 * このファイルは e2e/auth.setup.ts として置く（testMatch に合わせてファイル名を変える）。
 */

// playwright.config.ts の STORAGE_STATE と同じ定義。config 側の project が読むパスと必ず一致させる。
const STORAGE_STATE = process.env.E2E_STORAGE_STATE ?? 'e2e/.auth/user.json';

setup('authenticate as user', async ({ page }) => {
  const USER = process.env.E2E_USER;
  const PASS = process.env.E2E_PASS;
  if (!USER || !PASS) {
    throw new Error(
      'この setup には E2E_USER / E2E_PASS が必須です（.env.example 参照）。' +
        'この例の config（ヘッダーコメント参照）は setup を無条件に実行するため、' +
        '認証をスキップしたい場合は環境変数ではなく config 側の変更が必要です' +
        '（未ログイン導線専用 project や E2E_AUTH_MODE 切り替えの構成例は ' +
        'scaffold/playwright.config.ts を参照）。'
    );
  }

  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(USER);
  await page.getByLabel('パスワード').fill(PASS);
  await page.getByRole('button', { name: 'ログイン' }).click();

  // ログイン確定を待ってから state を保存する（未確定セッションを焼き付けない）。
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();

  // indexedDB:true で IndexedDB スナップショットも採取（Firebase Auth 等に対応・Playwright 1.51+）。
  await page.context().storageState({ path: STORAGE_STATE, indexedDB: true });
});
