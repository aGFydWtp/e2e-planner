import { test, expect, type Page } from '@playwright/test';
// worker ごとに別アカウントを使う（E2E_USER_POOL）なら上の import を
//   import { test, expect } from '../fixtures/test';
// に切り替える（scaffold/e2e/fixtures/test.ts）。それ以外は変更不要。

// plan: e2e/plans/login.md
// この例は examples/login.plan.md / examples/login.setup.ts に対応する参考実装。
//
// 規約（e2e-codegen が生成する spec と同じ形）:
//   - test タイトル末尾に `[S<n> / map#<m>]`（run の Coverage Matrix が plan と突合する）
//   - `tag: ['@feature:<slug>', '@class:<slug>', '@role:<slug>']`（audit の横断集計。plan の coverage の mirror）。
//     plan の exec=heavy のときだけ '@heavy' を足す（この feature は全件 light なので付けない）
//   - 本文を `test.step('S<n>-PRE …')`（開始状態の確認）/ `('S<n>-O<k> …')`（操作）/
//     `('S<n>-CP<k> …')`（中間観測点）/ `('S<n>-END …')`（終了条件）で区切る。
//     ID は plan と同じ採番。trace / HTML レポートで plan の手順単位に追える。
//   - PRE の assert 失敗メッセージには `[precheck]` を付ける（run が「前提データ不整合」へ機械分類する）。
//
// 認証の方針（重要）:
//   - 既定では playwright.config.ts の project が storageState（config の STORAGE_STATE。パスは spec に書かない）を当てるため、
//     全テストは「ログイン済み」で開始する（login.setup.ts が事前に作る）。
//   - ログインフロー自体の検証（成功/検証エラー/認証失敗）は "未ログイン" が前提なので、
//     下の describe で test.use({ storageState: { cookies: [], origins: [] } }) を当てて
//     project の state を打ち消す。
//   - それ以外（ダッシュボードなど）は state を前提に goto から直接書く。ログイン操作は踏まない。

const FEATURE = '@feature:login';

// ── ログインフロー検証（未ログイン開始。project の storageState を打ち消す）─────────────
test.describe('login flow (guest)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // 開始状態の確認（PRE）。未ログインでログインフォームが出ていることを確定させてから操作に入る。
  // state の失効・リダイレクト先の変更などの環境側失敗を、ここで [precheck] として1件に畳む。
  async function precheckLoginForm(page: Page, id: string) {
    await test.step(`${id}-PRE 未ログインで /login を開くとログインフォームが表示される`, async () => {
      await page.goto('/login');
      await expect(page, '[precheck] /login に留まらない（state が残っている可能性）').toHaveURL(/\/login/);
      await expect(page.getByRole('button', { name: 'ログイン' }), '[precheck] ログインフォームが表示されない').toBeVisible();
    });
  }

  // S1. ログイン成功（happy path） / 遷移マップ #1,#2 / coverage: class=happy role=guest exec=light
  test('logs in with valid credentials [S1 / map#1,#2]', { tag: [FEATURE, '@class:happy', '@role:guest'] }, async ({ page }) => {
    await precheckLoginForm(page, 'S1');

    await test.step('S1-O1 メールアドレスを入力', async () => {
      await page.getByLabel('メールアドレス').fill('user@example.com');
    });
    await test.step('S1-O2 パスワードを入力', async () => {
      await page.getByLabel('パスワード').fill('password');
    });

    // 操作前に応答待ちを仕掛ける（押下後に仕掛けると応答が先に返って取りこぼす）。
    const loginResponse = page.waitForResponse((r) => r.url().includes('/api/login') && r.request().method() === 'POST');
    await test.step('S1-O3 「ログイン」を押下', async () => {
      await page.getByRole('button', { name: 'ログイン' }).click();
    });

    await test.step('S1-CP1 POST /api/login が成功応答を返す', async () => {
      const res = await loginResponse;
      expect(res.ok()).toBe(true);
    });
    await test.step('S1-END /dashboard へ遷移し、見出しとユーザー名が表示される', async () => {
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
      await expect(page.getByText('user@example.com')).toBeVisible();
    });
  });

  // S2. 必須項目未入力（validation error） / 遷移マップ #4 / coverage: class=validation role=guest exec=light
  test('shows validation error when fields are empty [S2 / map#4]', { tag: [FEATURE, '@class:validation', '@role:guest'] }, async ({ page }) => {
    await precheckLoginForm(page, 'S2');

    // 「API が呼ばれない」は否定アサートなので、単独では「まだ呼ばれていない」と区別できない。
    // route で呼び出しを記録し、END の陽性ランドマーク（検証メッセージ表示）を待った後に件数を見る。
    let loginCalls = 0;
    await page.route('**/api/login', async (route) => {
      loginCalls += 1;
      await route.continue();
    });

    await test.step('S2-O1 空のまま「ログイン」を押下', async () => {
      await page.getByRole('button', { name: 'ログイン' }).click();
    });
    await test.step('S2-END 「メールアドレスを入力してください」が表示され /login に留まる', async () => {
      await expect(page.getByText('メールアドレスを入力してください')).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
    });
    await test.step('S2-CP1 /api/login は呼ばれない（クライアント検証で止まる）', async () => {
      expect(loginCalls).toBe(0);
    });
  });

  // S3. 不正な認証（permission/認証失敗） / 遷移マップ #3 / coverage: class=permission role=guest exec=light
  test('shows auth error on invalid credentials [S3 / map#3]', { tag: [FEATURE, '@class:permission', '@role:guest'] }, async ({ page }) => {
    await precheckLoginForm(page, 'S3');

    await test.step('S3-O1 有効なメールアドレスと不正なパスワードを入力', async () => {
      await page.getByLabel('メールアドレス').fill('user@example.com');
      await page.getByLabel('パスワード').fill('wrong-password');
    });

    const loginResponse = page.waitForResponse((r) => r.url().includes('/api/login') && r.request().method() === 'POST');
    await test.step('S3-O2 「ログイン」を押下', async () => {
      await page.getByRole('button', { name: 'ログイン' }).click();
    });

    await test.step('S3-CP1 POST /api/login が 401 を返す', async () => {
      expect((await loginResponse).status()).toBe(401);
    });
    await test.step('S3-END エラーメッセージが表示され /login に留まる', async () => {
      await expect(page.getByText('メールアドレスまたはパスワードが違います')).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
    });
  });

  // S7. ネットワーク遅延（happy path の遅延版） / 遷移マップ #2 / coverage: class=network role=guest exec=light
  test('shows loading while login request is in flight [S7 / map#2]', { tag: [FEATURE, '@class:network', '@role:guest'] }, async ({ page }) => {
    // 固定 sleep（setTimeout(3000) 等）で遅延を作らない。応答を「ローディング表示を観測し終えるまで」
    // 保留し、観測が済んだら release() で解放する。待ち時間は観測に必要な分だけになり、
    // 遅い CI でも「3s では足りずローディングを取りこぼす」「3s 分まるごと待つ」のどちらも起きない。
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/login', async (route) => {
      await gate;
      await route.continue();
    });

    await precheckLoginForm(page, 'S7');

    await test.step('S7-O1 有効な認証情報を入力', async () => {
      await page.getByLabel('メールアドレス').fill('user@example.com');
      await page.getByLabel('パスワード').fill('password');
    });
    const submit = page.getByRole('button', { name: 'ログイン' });
    await test.step('S7-O2 「ログイン」を押下', async () => {
      await submit.click();
    });

    try {
      await test.step('S7-CP1 応答までローディング表示が出続け、ボタンは二重押下不可', async () => {
        await expect(page.getByRole('progressbar')).toBeVisible();
        await expect(submit).toBeDisabled();
      });
    } finally {
      // ローディング中に固定待機を挟まない。観測できた時点（assert が失敗した場合も）で応答を解放し、
      // route ハンドラを保留したまま残さない。
      release();
    }
    await test.step('S7-END 応答後 /dashboard へ遷移し、ローディングが消える', async () => {
      await expect(page).toHaveURL(/\/dashboard/);
      // 陽性ランドマーク（見出し）を先に待ってから、ローディングの消滅（否定アサート）を見る。
      await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
      await expect(page.getByRole('progressbar')).toBeHidden();
    });
  });
});

// ── 認証前提のテスト（storageState=user で開始。ログイン操作を踏まない）───────────────
test.describe('dashboard (authenticated as user)', () => {
  // 開始状態の確認（PRE）。state が有効でダッシュボードが見えることを確定させる。
  // state 失効時は全テストがここで同じ [precheck] メッセージで落ちる（アプリのバグと切り分けやすい）。
  async function precheckDashboard(page: Page, id: string) {
    await test.step(`${id}-PRE storageState=user で /dashboard が表示される`, async () => {
      await page.goto('/dashboard');
      await expect(page, '[precheck] /dashboard に留まらない（storageState が失効している可能性）').toHaveURL(/\/dashboard/);
      await expect(page.getByRole('heading', { name: 'ダッシュボード' }), '[precheck] ダッシュボード見出しが表示されない').toBeVisible();
    });
  }

  // S5. 再読込（セッション保持） / 遷移マップ #2 / coverage: class=reload role=user exec=light
  test('keeps session after reload [S5 / map#2]', { tag: [FEATURE, '@class:reload', '@role:user'] }, async ({ page }) => {
    await precheckDashboard(page, 'S5');

    // 再読込の前後で画面は「同じ表示」になる。何もしないと reload 直後の古い DOM/キャッシュに対して
    // matcher が即成立し、セッション復元を検証したことにならない。復元 API の応答待ちを
    // reload の**前**に仕掛け、応答を確定させてから END を見る。
    const session = page.waitForResponse((r) => r.url().includes('/api/me') && r.ok());
    await test.step('S5-O1 ページをリロード', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
    });
    await test.step('S5-CP1 GET /api/me が成功応答を返す（セッション復元）', async () => {
      await session;
    });
    await test.step('S5-END ログイン状態が保持され /dashboard が表示される', async () => {
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
      await expect(page.getByText('user@example.com')).toBeVisible();
    });
  });

  // S8. 権限差分（user に管理メニュー非表示） / 遷移マップ #5 / coverage: class=permission role=user exec=light
  //   admin 側は admin ロールの state を用意し（config の role 別 project・パスは env で一元化）、その project で対の検証を書く。
  test('hides admin menu for a normal user [S8 / map#5]', { tag: [FEATURE, '@class:permission', '@role:user'] }, async ({ page }) => {
    await precheckDashboard(page, 'S8');

    await test.step('S8-O1 ダッシュボードのナビゲーションを確認', async () => {
      await expect(page.getByRole('navigation')).toBeVisible();
    });
    await test.step('S8-CP1 ユーザー名が表示される（描画完了の陽性ランドマーク）', async () => {
      // 「管理メニューが無い」は否定アサート。「ロード中で 0 個」と区別するため、
      // 同時に描画されるはずのユーザー名を先に待つ。
      await expect(page.getByText('user@example.com')).toBeVisible();
    });
    await test.step('S8-END 「管理メニュー」リンクが表示されない', async () => {
      await expect(page.getByRole('link', { name: '管理メニュー' })).toBeHidden();
    });
  });
});
