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
 * 3) 実行（VERIFY_HOST は対象のセッションが載るドメイン/オリジン。例: asana.com）:
 *    成功判定は保存場所非依存: cookie / localStorage / IndexedDB のいずれかに痕跡があれば OK。
 *    Firebase 等トークンを IndexedDB に置くアプリ（indexedDB:true で採取）もこれで拾える。
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

// Playwright の storageState() 戻り値型は origins[].indexedDB を公開していない
// （`indexedDB: true` は採取オプションとしては型にあるが、返り値の型には未反映・1.61 時点）。
// 実体は indexedDB:true で採取すると origins[] に indexedDB（IndexedDB データベース配列）が入る。
// 成功判定では DB 名だけ見れば足りるので、最小限の形で読み出すための補助型を置く。
type IndexedDBDatabaseLike = { name?: string };
const indexedDbOf = (origin: unknown): IndexedDBDatabaseLike[] =>
  (origin as { indexedDB?: IndexedDBDatabaseLike[] }).indexedDB ?? [];

(async () => {
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0];
  if (!context) {
    console.error('✗ コンテキストが見つかりません。debug Chrome が起動しているか確認してください。');
    process.exit(1);
  }

  // 検証用にも IndexedDB を含めて読む（A3: 認証痕跡は cookie/localStorage/IndexedDB のどこにあってもよい）。
  const state = await context.storageState({ indexedDB: true });

  // VERIFY_HOST に緩く一致（includes）する痕跡を、保存場所別に集計する。
  //   cookies        : domain が VERIFY_HOST を含む
  //   localStorage   : origin が VERIFY_HOST を含む origin の localStorage 項目
  //   indexedDB      : 同 origin の IndexedDB データベース配列（indexedDB:true 採取時のみ存在）
  const host = VERIFY_HOST;
  const cookieHits = host ? state.cookies.filter((c) => c.domain.includes(host)) : [];
  const matchedOrigins = host ? state.origins.filter((o) => o.origin.includes(host)) : [];
  const lsHits = matchedOrigins.flatMap((o) => o.localStorage ?? []);
  const idbDbs = matchedOrigins.flatMap((o) => indexedDbOf(o));
  const idbNames = idbDbs.map((db) => db.name).filter((n): n is string => !!n);

  if (host) {
    // A3: 3種いずれかが非空なら成功。1件も無ければログイン済みセッション無しとして失敗。
    const traces = cookieHits.length + lsHits.length + idbDbs.length;
    if (traces === 0) {
      console.error(
        `✗ ${host} のログイン済みセッションが見つかりません（cookie/localStorage/IndexedDB すべて0件）。` +
          `その Chrome で対象にログイン済みか確認してください。`,
      );
      await browser.close();
      process.exit(1);
    }
  }

  await context.storageState({ path: OUT, indexedDB: true });

  // 保存場所別の内訳サマリ。IndexedDB は DB 名（例: firebaseLocalStorageDb）も併記する。
  const idbSummary = idbNames.length ? `${idbDbs.length} (${idbNames.join(', ')})` : String(idbDbs.length);
  const summary = host
    ? `${host} → cookies: ${cookieHits.length} / localStorage: ${lsHits.length} / indexedDB: ${idbSummary}`
    : `total → cookies: ${state.cookies.length} / origins: ${state.origins.length}`;
  console.log(`✅ storageState を保存: ${OUT}（${summary}）`);
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(`✗ 失敗: ${e?.message ?? e}`);
  process.exit(1);
});
