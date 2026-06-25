import { test, expect } from '@playwright/test';

// plan: e2e/plans/login.md
// この例は examples/login.plan.md / examples/login.setup.ts に対応する参考実装。
//
// 認証の方針（重要）:
//   - 既定では playwright.config.ts の project が storageState: 'e2e/.auth/user.json' を当てるため、
//     全テストは「ログイン済み」で開始する（login.setup.ts が事前に作る）。
//   - ログインフロー自体の検証（成功/検証エラー/認証失敗）は "未ログイン" が前提なので、
//     下の describe で test.use({ storageState: { cookies: [], origins: [] } }) を当てて
//     project の state を打ち消す。
//   - それ以外（ダッシュボードなど）は state を前提に goto から直接書く。ログイン操作は踏まない。

// ── ログインフロー検証（未ログイン開始。project の storageState を打ち消す）─────────────
test.describe('login flow (guest)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // S1. ログイン成功（ログインフローの happy path）
  test('logs in with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('メールアドレス').fill('user@example.com');
    await page.getByLabel('パスワード').fill('password');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page).toHaveURL(/\/dashboard/);                       // 終了条件
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
  });

  // S2. 必須項目未入力（validation error）
  test('shows validation error when fields are empty', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page.getByText('メールアドレスを入力してください')).toBeVisible();
  });

  // S3. 不正な認証（認証失敗 401）
  test('shows auth error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('メールアドレス').fill('user@example.com');
    await page.getByLabel('パスワード').fill('wrong-password');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page.getByText('メールアドレスまたはパスワードが違います')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  // S7. ネットワーク遅延（ログインフローの遅延版）
  test('shows loading while login request is in flight', async ({ page }) => {
    await page.route('**/api/login', async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });
    await page.goto('/login');
    await page.getByLabel('メールアドレス').fill('user@example.com');
    await page.getByLabel('パスワード').fill('password');
    const submit = page.getByRole('button', { name: 'ログイン' });
    await submit.click();
    // 中間観測点: ローディング表示・二重押下不可
    await expect(page.getByRole('progressbar')).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

// ── 認証前提のテスト（storageState=user で開始。ログイン操作を踏まない）───────────────
test.describe('dashboard (authenticated as user)', () => {
  // S5. 再読込（セッション保持）— state 前提なので goto から直接書ける
  test('keeps session after reload', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
  });

  // S8. permission差分（一般ユーザーには管理メニューが出ない）
  //   admin 側は e2e/.auth/admin.json を作り、別 project（storageState=admin）で対の検証を書く。
  test('hides admin menu for a normal user', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('user@example.com')).toBeVisible();
    await expect(page.getByRole('link', { name: '管理メニュー' })).toBeHidden();
  });
});
