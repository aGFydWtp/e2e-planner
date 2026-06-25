import { chromium } from '@playwright/test';

/**
 * SSO アプリ向け storageState 採取（connectOverCDP 版 / SSO ではこちらが既定）。
 *
 * なぜこれが必要か:
 *   - もう一方の save-storage-state.ts は launchPersistentContext でプロファイル“コピー”を開くが、
 *     Chrome の Cookie は OS の鍵ストア（macOS は Keychain の Chrome Safe Storage）で暗号化されており、
 *     別プロセス/別キーチェーンで開くと復号鍵が違って **Cookie 値が壊れ**、ログイン画面に戻される。
 *     → SSO サイトではコピー方式は原理的に機能しない。
 *   - 解決: 既に対象へログイン済みの“生きている”実 Chrome に CDP で接続し、
 *     復号済みのセッションをそのまま storageState として書き出す（鍵ズレが起きない）。
 *
 * ── 使い方 ───────────────────────────────────────────────────────────
 * 1) debug ポート付きの実 Chrome を1つ起動（既存の Chrome は閉じておく）:
 *      # macOS。Chrome 111+ は --remote-allow-origins が必須。zsh では * をクオートする。
 *      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *        --remote-debugging-port=9222 --remote-allow-origins='*' \
 *        --user-data-dir=/tmp/e2e-cdp-profile &
 * 2) その窓で対象アプリに普通にログインする（webdriver 制御ではないので bot 検知に当たらない）。
 * 3) 実行（VERIFY_HOST は対象のセッションCookieのドメイン。例: asana.com）:
 *      E2E_CDP_URL="http://localhost:9222" \
 *      E2E_STATE_OUT="e2e/.auth/user.json" \
 *      E2E_VERIFY_HOST="example.com" \
 *      npx tsx scripts/save-state-cdp.ts
 *
 * ロールごとに E2E_STATE_OUT を変えて複数回実行する（user.json, admin.json …）。
 * 生成した state と .env は **コミットしない**（scaffold/.gitignore 参照）。
 * 注意: chrome-devtools MCP の Chrome は --remote-debugging-pipe（TCPポート無し）なので接続不可。
 *       上記のとおり専用の debug Chrome を別に立てること。
 */

const CDP = process.env.E2E_CDP_URL ?? 'http://localhost:9222';
const OUT = process.env.E2E_STATE_OUT ?? 'e2e/.auth/user.json';
const VERIFY_HOST = process.env.E2E_VERIFY_HOST; // 例: 'asana.com'

(async () => {
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0];
  if (!context) {
    console.error('✗ コンテキストが見つかりません。debug Chrome が起動しているか確認してください。');
    process.exit(1);
  }

  const state = await context.storageState();
  if (VERIFY_HOST) {
    const hits = state.cookies.filter((c) => c.domain.includes(VERIFY_HOST));
    if (hits.length === 0) {
      console.error(`✗ ${VERIFY_HOST} の Cookie が0件。その Chrome で対象にログイン済みか確認してください。`);
      await browser.close();
      process.exit(1);
    }
  }

  await context.storageState({ path: OUT });
  const summary = VERIFY_HOST
    ? `${VERIFY_HOST} cookies: ${state.cookies.filter((c) => c.domain.includes(VERIFY_HOST)).length} / total: ${state.cookies.length}`
    : `total cookies: ${state.cookies.length}`;
  console.log(`✅ storageState を保存: ${OUT}（${summary}）`);
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(`✗ 失敗: ${e?.message ?? e}`);
  process.exit(1);
});
