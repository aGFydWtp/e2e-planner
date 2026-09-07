import { test as base, expect } from '@playwright/test';
import type { PlaywrightTestOptions } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * worker ごとに別アカウントの storageState を当てる fixture（Playwright 公式の
 * 「one account per parallel worker」パターン）。
 *
 * 使い方:
 *   spec の import を `@playwright/test` から本ファイルに切り替えるだけ:
 *     import { test, expect } from '../fixtures/test';
 *   .env（または CI の変数）に E2E_USER_POOL を `mail:pass,mail:pass,...` の形で置く。
 *
 * 動き:
 *   - E2E_USER_POOL があれば `test.info().parallelIndex`（同時に走る worker の 0 始まり連番）で
 *     アカウントを割り当て、`e2e/.auth/user-<i>.json` が無ければ form ログインして保存する
 *     （ログイン手順・ロケータは auth.setup.ts と同じ。画面が違うなら両方を同時に直す）。
 *   - E2E_USER_POOL が無ければ project が設定した storageState（既定 STORAGE_STATE）にそのまま
 *     フォールバックする。既存の単一 state 運用と互換で、import を切り替えるだけでは挙動が変わらない。
 *
 * 前提と制約:
 *   - プールのアカウントは**同一ロール**（同じ画面・同じ権限）にする。ロール差は project で分ける。
 *   - form モード専用（E2E_AUTH_MODE=form）。prebuilt-state（SSO 等）は自動ログインできないので、
 *     ロール別に採取した state を project で分ける。form 以外でプールを設定すると fixture 初期化時に落とす。
 *   - アカウント数が並列度の上限。E2E_WORKERS をプール数より大きくすると、超過した worker の fixture 初期化時に落とす。
 *   - E2E_USER_POOL の各項目は `mail:pass`。`,` と `:` の前後の空白は両辺とも取り除く（パスワードの前後に
 *     空白が必要なアカウントは使えない）。末尾カンマは許容しない（空項目としてエラーになる）。
 *   - describe 単位の `test.use({ storageState: ... })`（未ログイン開始の describe 等）は本 fixture より
 *     優先されるので、ログインフロー検証はこれまで通り書ける。
 *   - 生成した user-<i>.json は再利用される。セッション失効時は e2e/.auth/ を消して作り直す。
 */

// playwright.config.ts / auth.setup.ts と同じ定義（プール未設定時のフォールバック先）。
const STORAGE_STATE = process.env.E2E_STORAGE_STATE ?? 'e2e/.auth/user.json';

// worker 別 state の保存先。STORAGE_STATE と別ディレクトリにしない（.gitignore の e2e/.auth/ で一緒に除外する）。
const POOL_STATE_DIR = 'e2e/.auth';

type Account = { user: string; pass: string };

// `mail:pass,mail:pass` を分解する。パスワードに ':' が含まれても最初の ':' だけで区切る。
function parseUserPool(raw: string | undefined): Account[] {
  if (!raw || raw.trim() === '') return [];
  return raw.split(',').map((entry, i) => {
    const sep = entry.indexOf(':');
    if (sep <= 0 || sep === entry.length - 1) {
      throw new Error(`E2E_USER_POOL の ${i + 1} 番目が "mail:pass" 形式ではありません`);
    }
    return { user: entry.slice(0, sep).trim(), pass: entry.slice(sep + 1).trim() };
  });
}

type WorkerFixtures = {
  workerStorageState: PlaywrightTestOptions['storageState'];
};

export const test = base.extend<{}, WorkerFixtures>({
  workerStorageState: [
    async ({ browser }, use, workerInfo) => {
      const pool = parseUserPool(process.env.E2E_USER_POOL);
      // worker-scoped fixture では test.info() ではなく第3引数の WorkerInfo から parallelIndex / project を取る
      // （test.info() は「テスト実行中」専用の API で、worker fixture の初期化中に使える保証が無い）。
      const info = workerInfo;

      if (pool.length > 0 && (process.env.E2E_AUTH_MODE ?? 'form') !== 'form') {
        throw new Error(
          `E2E_USER_POOL は E2E_AUTH_MODE=form 専用です（現在: ${process.env.E2E_AUTH_MODE}）。` +
            'prebuilt-state / none ではプールを外し、ロール別に採取した state を project で分けてください。'
        );
      }

      if (pool.length === 0) {
        // プール未設定: project の storageState をそのまま使う（none モードの空 state もここで通る）。
        await use(info.project.use.storageState ?? STORAGE_STATE);
        return;
      }

      const id = info.parallelIndex;
      if (id >= pool.length) {
        throw new Error(
          `並列 worker 数（parallelIndex=${id}）が E2E_USER_POOL のアカウント数（${pool.length}）を超えています。` +
            'E2E_WORKERS をアカウント数以下にするか、プールにアカウントを足してください。'
        );
      }
      const account = pool[id];
      const fileName = path.resolve(POOL_STATE_DIR, `user-${id}.json`);

      if (fs.existsSync(fileName)) {
        await use(fileName);
        return;
      }

      // 未ログインの context を新規に開いてログインする。`browser.newPage()` は project の `use` を
      // 引き継がないので、baseURL / locale / timezoneId は明示的に渡す（相対 goto と文言 assert のため）。
      const { baseURL, locale, timezoneId } = info.project.use;
      const page = await browser.newPage({ baseURL, locale, timezoneId, storageState: undefined });
      try {
        await page.goto('/login');
        await page.getByLabel('メールアドレス').fill(account.user);
        await page.getByLabel('パスワード').fill(account.pass);
        await page.getByRole('button', { name: 'ログイン' }).click();

        // auth.setup.ts と同じく「URL 遷移」と「ログイン後にしか出ない要素」で確定してから保存する。
        await expect(page).toHaveURL(/\/dashboard/);
        await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();

        fs.mkdirSync(path.dirname(fileName), { recursive: true });
        await page.context().storageState({ path: fileName, indexedDB: true });
      } finally {
        await page.close();
      }
      await use(fileName);
    },
    { scope: 'worker' },
  ],

  // project の storageState を worker 別の state で上書きする。
  storageState: async ({ workerStorageState }, use) => {
    await use(workerStorageState);
  },
});

export { expect };
