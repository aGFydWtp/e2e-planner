import { defineConfig, devices } from '@playwright/test';
import type { PlaywrightTestConfig, ReporterDescription } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// .env があれば読む。無くても CI 等の実環境変数で動く（防御的ロード）。
// 順序重要: ここで .env を読んでから下の E2E_AUTH_MODE / E2E_BASE_URL を参照する。
loadEnv();

/**
 * e2e-planner scaffold の推奨設定。
 * - 証跡（trace/video/screenshot）を失敗時に確実に残す（retries=0 でも採れる retain-on-failure）
 * - VRT（toHaveScreenshot）の差分しきい値を控えめに設定
 * - light/heavy の 2 project に分け、重いシナリオだけ長い timeout・直列で回す
 * baseURL は環境変数 E2E_BASE_URL で上書きする。
 *
 * 実行時に env で変えられる値（.env.example 参照）:
 *   E2E_RETRIES / E2E_WORKERS / E2E_TRACE / E2E_VIDEO / E2E_STORAGE_STATE / E2E_USER_POOL
 */

// CI 判定。GitHub Actions 等は `CI=true` を立てるが、Azure Pipelines は `CI` を立てず
// `TF_BUILD=True` を立てる。yaml 側で CI を明示すれば片方で足りるが、両方見る方が安全。
const isCI = !!(process.env.CI || process.env.TF_BUILD);

// 認証モードで projects 構成を切り替える（E2E_AUTH_MODE、既定 'form'）。
//   form           : setup project が form ログイン → storageState を自動生成（dependencies:['setup']）
//   prebuilt-state : SSO/OTP 等で手動採取した storageState を使う（setup を組まない・dependencies 空）
//   none           : 認証不要（storageState を持たない）
const authMode = process.env.E2E_AUTH_MODE ?? 'form';

// user ロールの storageState パス。config / auth.setup.ts / fixtures/test.ts / codegen の teardown 例で共有する
// 唯一の定義。直書きを散らさない（admin project が user の state で消しに行く事故を防ぐ）。
// CI では Secure File 等から展開した state のパスを E2E_STORAGE_STATE で渡す
// （prebuilt-state モードを CI で動かす経路。setup を組まずに採取済みの state を当てる）。
const STORAGE_STATE = process.env.E2E_STORAGE_STATE ?? 'e2e/.auth/user.json';

// ── env → Playwright の文字列 union へ型安全に絞り込むヘルパ ──────────────────
// `process.env.X as any` で流し込むと typo（例 'retain-on-failre'）が実行時まで気づけないので、
// 許容値の配列で検証し、外れていれば起動時に落とす。
function envChoice<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const match = allowed.find((a) => a === value);
  if (match === undefined) throw new Error(`${name}=${value} は不正です。許容値: ${allowed.join(' | ')}`);
  return match;
}

// 数値 env（E2E_RETRIES / E2E_WORKERS）も同様に検証する。`Number('foo')` は NaN になって
// Playwright に静かに渡るので、0 以上の整数以外は起動時に落とす。
function envInt(name: string, fallback: number | undefined): number | undefined {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name}=${value} は不正です。0 以上の整数を指定してください`);
  return n;
}

// trace の既定は retain-on-failure。`on-first-retry` は retries=0（下記）だと永久に発火しないので既定にしない。
// 監査用途で全件残したいときは E2E_TRACE=on（容量が増えるので恒常運用は非推奨）。
const trace = envChoice('E2E_TRACE', ['off', 'on', 'retain-on-failure', 'on-first-retry', 'on-all-retries', 'retain-on-first-failure'] as const, 'retain-on-failure');
// video も同様。検証記録として動画を常時残す運用なら E2E_VIDEO=on に切り替える。
const video = envChoice('E2E_VIDEO', ['off', 'on', 'retain-on-failure', 'on-first-retry'] as const, 'retain-on-failure');

// ── reporter ──────────────────────────────────────────────────────────────
const reporter: ReporterDescription[] = [
  ['list'],
  ['html', { outputFolder: 'e2e/.report', open: 'never' }],
];
if (isCI) {
  // Azure Pipelines の PublishTestResults@2（testResultsFormat: JUnit）が読む形式。
  // HTML と同じ e2e/.report 配下に置き、そのディレクトリごと PublishPipelineArtifact すれば
  // JUnit 集計と証跡付き HTML の両方が1回で残る。
  reporter.push(['junit', { outputFile: 'e2e/.report/junit.xml' }]);
}
// shard 運用（--shard=1/3 等で複数ジョブに分ける）時は blob reporter を足し、
// 全ジョブの e2e/.blob/ を集めて `npm run e2e:merge`（playwright merge-reports）で1つの HTML/JUnit にまとめる:
//   if (isCI) reporter.push(['blob', { outputDir: 'e2e/.blob' }]);

// ── light / heavy の 2 project 化 ───────────────────────────────────────────
// plan の `exec=heavy`（想定 60s 超・重い非同期/ファイル往復・共有データへの書き込み）を
// codegen が `@heavy` タグに mirror する。light はタグ無しなので grepInvert で分ける。
//   chromium       : @heavy 以外。既定 timeout（60s）・fullyParallel
//   chromium-heavy : @heavy のみ。timeout 180s・同一ファイル内は直列（fullyParallel:false）
// `--project=chromium` / `--project=chromium-heavy`（package.snippet.json の e2e:light / e2e:heavy）で
// 別ジョブに分けられる。heavy をファイル間でも直列にしたいなら workers（下記）を 1 にする。
type Project = NonNullable<PlaywrightTestConfig['projects']>[number];
function withLoadProfiles(base: Project): Project[] {
  return [
    { ...base, grepInvert: /@heavy/ },
    { ...base, name: `${base.name}-heavy`, grep: /@heavy/, fullyParallel: false, timeout: 180_000 },
  ];
}

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/.artifacts',
  // 注意: `describe.serial`（破壊的シナリオの describe に付与）はあくまで同一ファイル内の競合しか防げない。
  // 複数の spec ファイルが同一の外部データストア（DB/Firestore 等）を破壊的に共有編集する構成では、
  // ファイル間・worker 間でも競合が起きうる。
  // その対処として `fullyParallel: false` への変更**だけでは防げない**——`fullyParallel` が止めるのは
  // 同一ファイル内テストの並列化だけで、別ファイル同士は workers が複数なら並行実行されたまま
  // （fullyParallel:false でも 2 つの spec ファイルが worker 0/1 で同時実行されることを実測済み）。
  // ファイル間の競合を止めるには worker 自体を 1 にする: 下の `workers` を常に `1` にする
  // （CI/ローカル分岐をやめる）か、実行時に `--workers=1` を付ける。CI は既定 `workers: 1` なので
  // この問題が起きるのはローカル実行時のみ。ローカルの並列実行を全面的に手放したくない場合は、
  // 競合する spec 群だけを別 project に分けたうえで、その project を `--workers=1` 付きの
  // 別コマンドで実行する（project 分割自体には直列化の効果がない——別 project 同士も複数 worker で
  // 並行実行される。project 単位の `workers: 1` 指定は Playwright 1.52 以降で使え、
  // package.snippet.json の最低バージョン 1.51 では使えない）。
  // **この変更は codegen が自動判断で行わない。** 複数 spec ファイルが同一の外部可変状態を共有するか
  // どうかはプロジェクト固有のアーキテクチャ判断であり、プロジェクト設定者（人間）が明示的に決める。
  fullyParallel: true,
  forbidOnly: isCI,
  // CI でも retries 0 が既定。retry は flaky を隠す（JUnit 集計上は成功に見える）うえ、
  // 破壊的テストの初回試行分が別 runId の残骸として残る。flaky の診断は retry で吸収せず、
  // e2e-run の「同一条件・無修正で3回」再評価で行い、Step3 の収束ループへ戻す。
  // どうしても必要なら E2E_RETRIES で明示的に上げる。
  retries: envInt('E2E_RETRIES', 0),
  // CI 既定 1 は上の注記（ファイル間で外部データストアを共有する構成への安全側）のため。
  // 隔離データ（plan の data.own=self）と worker 別アカウント（E2E_USER_POOL、fixtures/test.ts）が揃えば
  // E2E_WORKERS で上げてよい（アカウント数が並列度の上限）。
  workers: envInt('E2E_WORKERS', isCI ? 1 : undefined),
  reporter,
  // テスト1件の上限。CI エージェントは手元より遅い（共有ランナー・コールドキャッシュ）ので、
  // Playwright 既定の 30s は CI で最初に落ちる原因になる。heavy project は withLoadProfiles で 180s に上書き。
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    // ロケール/タイムゾーンは必ず固定する。探索環境（実サイト探索時のブラウザ）と
    // 実行環境（headless, 既定 en-US/UTC）がズレると、ローカライズ文言や日付の
    // assert が「環境依存」で落ちる。対象アプリの想定ロケールに合わせること。
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace,
    video,
    screenshot: 'only-on-failure',
    // 重い SPA では goto/reload の既定 `load` 待ちが長く timeout しやすい。
    // 個々の goto/reload では `{ waitUntil: 'domcontentloaded' }` を指定し、描画後の
    // web-first assertion で待つこと（読み込み完了の判定は assertion 側に寄せる）。
    // navigationTimeout は安全側の上限。固定待機の代わりにはしない。
    navigationTimeout: 30_000,
  },
  expect: {
    // web-first assertion の待ち上限（既定 5s）。CI の応答遅延で落ちる典型なので余裕を持たせる。
    // これ以上必要な箇所は個別に `{ timeout }` を渡す（全体をさらに伸ばすと失敗の発見が遅れる）。
    timeout: 10_000,
    // 視覚回帰: アンチエイリアス等の微差を許容しつつ崩れは検出。
    // baseline は CI と同じ OS で生成する（snapshot 名に OS サフィックスが付き、OS が違えば別物として扱われる）。
    // 手元が macOS で CI が Linux なら、CI と同じ Playwright Docker イメージで `--update-snapshots` を回す。
    // 日本語 UI は CI 側に CJK フォントが無いと豆腐（□）になり全件差分になるので、フォント導入を先に済ませる。
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  // 対象アプリを Playwright から起動する場合の雛形。ローカルでは起動済みサーバーを再利用し、
  // CI では毎回起動する（reuseExistingServer: !isCI）。
  // webServer: {
  //   command: 'npm run dev',
  //   url: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
  //   reuseExistingServer: !isCI,
  //   timeout: 120_000,
  // },
  projects: [
    // ① 認証セットアップ。form モードのときだけ組む。テスト本体より先に1回走り、
    //    storageState を STORAGE_STATE（既定 e2e/.auth/user.json）に保存する。
    //    prebuilt-state（SSO/OTP 等で手動採取した state を使う）/ none（認証不要）では
    //    setup を組まない（前者は採取済みの state、後者は state を持たない）。
    // testDir は本体テスト用に ./e2e/tests を指すため、setup はここで testDir を ./e2e に上書きする。
    // （auth.setup.ts は e2e/ 直下に置く想定。上書きしないと testDir 外で setup が発見されず form モードが動かない。）
    ...(authMode === 'form' ? [{ name: 'setup', testDir: './e2e', testMatch: /auth\.setup\.ts/ }] : []),

    // ② 認証済みテスト（user ロール）。light（chromium）/ heavy（chromium-heavy）の2 project に展開される。
    //    form/prebuilt-state は state を前提に開始し、none は空 state で開始する。
    ...withLoadProfiles({
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // ログイン済みセッションを焼き付けた state を全テストの開始状態にする。
        // → 各テストでログイン操作を踏まない（ログインフロー検証だけは別扱い、下記参照）。
        // 採取側が indexedDB:true で保存した state は IndexedDB snapshot を含みうる。
        // ここで storageState を指定するだけで cookie/localStorage/IndexedDB すべて自動復元される
        // （Firebase Auth 等の IndexedDB トークンも復元。addInitScript 等の自前注入は不要・Playwright 1.51+）。
        // none モードのみ state を持たない（空の cookies/origins で開始）。
        // worker 別アカウント（E2E_USER_POOL）を使う spec は fixtures/test.ts 側でこの値を上書きする。
        storageState: authMode === 'none' ? { cookies: [], origins: [] } : STORAGE_STATE,
      },
      // form のみ setup の完了を待つ。prebuilt-state は手動採取済み、none は state 不要なので依存しない。
      dependencies: authMode === 'form' ? ['setup'] : [],
    }),

    // ③ 未ログイン状態を検証するテスト（ログイン画面・検証エラー・権限なしリダイレクト等）。
    //    state を持たない project に分け、ファイル名末尾を *.guest.spec.ts 等で振り分ける。
    // ...withLoadProfiles({
    //   name: 'chromium-guest',
    //   testMatch: /.*\.guest\.spec\.ts/,
    //   use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
    // }),

    // ── admin など別ロールを足すとき ─────────────────────────────
    // auth.setup.ts に admin 用 setup を追加して e2e/.auth/admin.json を保存し、ここに project を足す
    // （パスは E2E_ADMIN_STORAGE_STATE 等の env にして STORAGE_STATE と同じ方針で一元化する）:
    // ...withLoadProfiles({ name: 'chromium-admin', use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/admin.json' }, dependencies: ['setup'] }),

    // 視覚補完やクロスブラウザが必要なら追加（同様に storageState/dependencies を付ける）:
    // ...withLoadProfiles({ name: 'firefox', use: { ...devices['Desktop Firefox'], storageState: STORAGE_STATE }, dependencies: ['setup'] }),
  ],
});
