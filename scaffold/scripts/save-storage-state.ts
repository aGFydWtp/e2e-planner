import { chromium } from '@playwright/test';
import * as readline from 'node:readline';

/**
 * SSO / OTP / 2FA など、auth.setup.ts の自動ログインが通らないアプリ向けの storageState 採取スクリプト。
 *
 * 要点: **新規ログインしない**。既にログイン済みの実 Chrome プロフィールを persistent context で
 * 開くだけなので、ログインフローを踏まず（＝SSO の bot 検知に当たらず）にセッションを取り出せる。
 *
 * ── 使い方 ───────────────────────────────────────────────────────────
 * 1) プロフィールのロックを避けるため、Chrome を一旦終了してからコピーする（コピー推奨）:
 *      cp -R "$HOME/Library/Application Support/Google/Chrome" /tmp/chrome-e2e-profile   # macOS
 *      # Linux:   ~/.config/google-chrome
 *      # Windows: %LOCALAPPDATA%\Google\Chrome\User Data
 * 2) 対象アプリにそのプロフィールでログイン済みであること（コピー元が未ログインなら先にログインしておく）。
 * 3) 実行:
 *      E2E_STATE_URL="https://app.example.com/home" \
 *      E2E_STATE_OUT="e2e/.auth/user.json" \
 *      E2E_CHROME_PROFILE="/tmp/chrome-e2e-profile" \
 *      pnpm exec tsx scripts/save-storage-state.ts
 * 4) 開いたウィンドウでログイン済み画面が出ていることを確認し、ターミナルで Enter → state 保存。
 *
 * ロールごとに E2E_STATE_OUT を変えて複数回実行する（e2e/.auth/user.json, admin.json …）。
 * 生成した state と .env は **コミットしない**（scaffold/.gitignore 参照）。
 */

const URL = process.env.E2E_STATE_URL;
const OUT = process.env.E2E_STATE_OUT ?? 'e2e/.auth/user.json';
const PROFILE = process.env.E2E_CHROME_PROFILE;
const PROFILE_DIR = process.env.E2E_CHROME_PROFILE_DIR ?? 'Default';

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!URL) fail('E2E_STATE_URL を指定してください（ログイン済みを確認する対象URL）。');
if (!PROFILE) fail('E2E_CHROME_PROFILE を指定してください（実Chromeプロフィールのコピー先パス）。');

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: false,
    args: [`--profile-directory=${PROFILE_DIR}`],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  console.log('\n▶ 開いたウィンドウで「ログイン済みの画面」が出ているか確認してください。');
  console.log('  もしログイン画面なら、このプロフィールは未ログインです（コピー元でログインし直す）。');
  await new Promise<void>((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\n表示OKなら Enter で state を保存します… ', () => {
      rl.close();
      resolve();
    });
  });

  // indexedDB:true で IndexedDB スナップショットも採取（Firebase Auth 等に対応・Playwright 1.51+）。
  await context.storageState({ path: OUT, indexedDB: true });
  console.log(`\n✅ storageState を保存しました: ${OUT}`);
  await context.close();
  process.exit(0);
})().catch((e) => fail(`保存に失敗: ${e?.message ?? e}`));
