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
 * 3) 実行（VERIFY_HOST は対象のセッションが載るホスト名。ポートを使う開発環境では
 *    `localhost:3000` のようにポートまで含めて指定する（省略すると別ポートの別アプリまで
 *    一致してしまう）。例: app.example.com）:
 *    成功判定は保存場所非依存: cookie / localStorage / IndexedDB のいずれかに痕跡があれば OK。
 *    Firebase 等トークンを IndexedDB に置くアプリ（indexedDB:true で採取）もこれで拾える。
 *      E2E_CDP_URL="http://localhost:9222" \
 *      E2E_STATE_OUT="e2e/.auth/user.json" \
 *      E2E_VERIFY_HOST="example.com" \
 *      pnpm exec tsx scripts/save-state-cdp.ts
 *
 * ロールごとに E2E_STATE_OUT を変えて複数回実行する（user.json, admin.json …）。
 * 生成した state と .env は **コミットしない**（scaffold/.gitignore 参照）。
 * 注意: chrome-devtools MCP の Chrome は --remote-debugging-pipe（TCPポート無し）なので接続不可。
 *       上記のとおり専用の debug Chrome を別に立てること。
 *
 * VERIFY_HOST の一致判定はホスト名（＋任意でポート）の正規化＋境界付き比較で行う
 * （`includes` による別ドメイン誤マッチ（例: notexample.com が example.com にヒット）を防ぐ）。
 * ポートを比較に含めるのは、同一 Chrome で別ポートの別アプリを開いている開発環境で
 * ポート違いのタブ/originまで誤って一致させないため（cookie の domain 属性にはポートが
 * 乗らないため cookie 判定だけはポートを無視する。詳細は cookieDomainMatches 参照）。
 */

const CDP = process.env.E2E_CDP_URL ?? 'http://localhost:9222';
const OUT = process.env.E2E_STATE_OUT ?? 'e2e/.auth/user.json';
const VERIFY_HOST_RAW = process.env.E2E_VERIFY_HOST; // 例: 'app.example.com' や 'localhost:3000'

// URL から "hostname" または "hostname:port"（非標準 port 指定時のみ）を取り出す。
// :80/:443 は常に落とす: URL はスキーム既定ポートだけを落とすため（http://x:80 → 'x' だが
// https://x:80 → 'x:80'）、schemeless な VERIFY_HOST に https:// を仮付与する normalizeHost と
// 実ページ URL とでポートの残り方がズレて永遠に一致しなくなる。両側で常に落として揃える。
const DEFAULT_PORTS = new Set(['80', '443']);
const urlHost = (url: string): string | null => {
  try {
    const u = new URL(url);
    if (!u.hostname) return null;
    return u.port && !DEFAULT_PORTS.has(u.port) ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    return null;
  }
};

// ホスト文字列（URL でもよい）を urlHost と同じ形へ正規化する。
// スキームが無い入力（例: 'app.example.com'）は https:// を仮付与して URL として解釈する。
// 空白のみ等、URL として解釈不能な入力は空文字を返す（呼び出し側で fail-open させない）。
const normalizeHost = (input: string): string => {
  const raw = input.trim().toLowerCase();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
  return urlHost(withScheme) ?? '';
};

// host が target 自身か、target のサブドメインであれば一致（ポートを含む文字列同士の比較）。
const hostMatches = (host: string, target: string): boolean =>
  host === target || host.endsWith(`.${target}`);

// cookie が target（VERIFY_HOST・ポート除去済み）のセッション痕跡かどうかの判定。
// タブ/origin 判定（hostMatches: target 自身か target のサブドメイン）と同じ範囲をまず認める:
// target=example.com のとき app.example.com の cookie も痕跡として数える（タブは一致するのに
// cookie だけ数えない、という食い違いを避ける）。localhost 等の単一ラベルホストも
// 完全一致（hostMatches）で普通に通る。
// これに加えて、先頭 `.` 付きの「ドメインcookie」は RFC 6265 上サブドメインにも送出されるため、
// target が domain のサブドメインである場合も痕跡と認める。host-only cookie（先頭 `.` なし・
// Playwright の storageState では `.` なしで格納される）は親ドメインからサブドメインへは
// 送出されないので、この方向では一致させない。
// ドメインcookie側のラベル数が1（例: '.com' のような広すぎる値）だと誤って広範囲に一致しうる
// ため、サフィックス一致には最低2ラベルを要求するガードを入れる。
// 注意: 完全な public suffix list 対応は行っていない（軽量スクリプトのため）。Firebase Hosting
// 等の共有サフィックス（web.app / firebaseapp.com / vercel.app / github.io 等）配下では、
// 無関係な別アプリのcookieを誤って「対象の痕跡」として拾うリスクが残る。より安全にするには
// E2E_VERIFY_HOST をアプリ固有のフルホスト名（例: myapp.web.app ではなく実際に使う正確な
// ホスト名）で指定すること。
const cookieDomainMatches = (rawDomain: string, target: string): boolean => {
  const isDomainCookie = rawDomain.startsWith('.');
  const domain = rawDomain.toLowerCase().replace(/^\./, '');
  if (!domain) return false;
  if (hostMatches(domain, target)) return true;
  if (!isDomainCookie) return false;
  if (domain.split('.').length < 2) return false;
  return target.endsWith(`.${domain}`);
};

const VERIFY_HOST = VERIFY_HOST_RAW ? normalizeHost(VERIFY_HOST_RAW) : undefined;
if (VERIFY_HOST_RAW && !VERIFY_HOST) {
  console.error(
    `✗ E2E_VERIFY_HOST="${VERIFY_HOST_RAW}" を解釈できません。ホスト名（例: app.example.com）か ` +
      `URL（例: https://app.example.com）、必要ならポート付き（例: localhost:3000）で指定してください。` +
      `解釈できない値のまま検証をスキップする（fail-open）のを避けるため、ここで終了します。`,
  );
  process.exit(1);
}

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

  // 採取前に対象ページを reload して Playwright にフレームを観測させる（重要）。
  //   connectOverCDP は「接続後に Playwright が観測したナビゲーション」の origin しか
  //   storageState の localStorage/IndexedDB 収集対象にしない。接続前から開いていたタブは
  //   対象外になり origins=0 になる（cookie は CDP 経由で全件取れるため混同しやすい）。
  //   → 対象タブを一度 reload すれば Playwright が認識し、IndexedDB(firebaseLocalStorageDb 等)まで掬える。
  const isReloadable = (url: string) => /^https?:\/\//.test(url); // about:blank / devtools:// は除外
  const targets = context
    .pages()
    .filter((p) => isReloadable(p.url()))
    .filter((p) => {
      if (!VERIFY_HOST) return true;
      const host = urlHost(p.url());
      return host ? hostMatches(host, VERIFY_HOST) : false;
    });
  for (const p of targets) {
    // Firebase 等はハイドレーション後に IndexedDB を書くため networkidle まで待つ。
    // 遅いページで networkidle がタイムアウトしても採取自体は試せるよう load にフォールバック。
    await p.reload({ waitUntil: 'networkidle' }).catch(() => p.reload({ waitUntil: 'load' }).catch(() => {}));
  }
  if (VERIFY_HOST && targets.length === 0) {
    console.error(
      `✗ ${VERIFY_HOST} を開いているタブが debug Chrome に見つかりません。` +
        `その窓で対象ページを開き、ログイン済みの状態にしてから再実行してください。`,
    );
    await browser.close();
    process.exit(1);
  }

  // 検証用にも IndexedDB を含めて読む（A3: 認証痕跡は cookie/localStorage/IndexedDB のどこにあってもよい）。
  const state = await context.storageState({ indexedDB: true });

  // VERIFY_HOST に正規化済みホスト名で一致（境界付き比較）する痕跡を、保存場所別に集計する。
  //   cookies        : domain が VERIFY_HOST とドメインマッチする（RFC 6265・先頭 . の親ドメインcookie考慮）。
  //                    cookie の domain 属性にはポートが乗らないため、ここだけ VERIFY_HOST からポートを除いて比較する。
  //   localStorage   : origin の hostname（＋ポート）が VERIFY_HOST と一致 or サブドメインである
  //   indexedDB      : 同 origin の IndexedDB データベース配列（indexedDB:true 採取時のみ存在）
  const host = VERIFY_HOST;
  const cookieHits = host
    ? state.cookies.filter((c) => cookieDomainMatches(c.domain, host.replace(/:\d+$/, '')))
    : [];
  const matchedOrigins = host
    ? state.origins.filter((o) => {
        const oHost = urlHost(o.origin);
        return oHost ? hostMatches(oHost, host) : false;
      })
    : [];
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
