# e2e-planner

WebアプリのE2Eテストシナリオを生成する **Claude Code プラグイン**。
到達範囲の地図化 → シナリオ仕様化 → Playwright コード生成 → 実行・証跡収集の **4段ワークフロー**を、承認ゲート付きで進める。**Playwright 主軸**。Step1 は探索起点（`e2e-map`・既定）と録画起点（`e2e-record`・ChromeDevTools Recorder の録画JSONを種にする）を**オーケストレーターが入力に応じて自動で切り替える**（録画JSONパスを渡せば録画起点）。

調査レポート（Playwright planner/generator/healer、screen transition / state graph、WebJudge の中間状態評価、Stagehand/Browser Use の観測→行動→検証）を実務ワークフローに落とし込んだもの。

## 構成

| コンポーネント | 種別 | 役割 |
|----------------|------|------|
| `/e2e-planner:e2e-plan <feature>` | command | オーケストレーター。Step1〜4を承認ゲート付きで進め、末尾で Step5（audit）を自動実行。Step1 は map/record を入力で自動切替（録画JSONパスを渡せば録画起点） |
| `/e2e-planner:e2e-audit` | command | 横断 audit。スイート全体をスキャンして `e2e/index.md` を再生成（単独実行可） |
| `e2e-map` | skill | Step1 到達範囲の地図化 → 遷移マップ（Markdown） |
| `e2e-record` | skill | **代替 Step1**（録画起点）。録画JSONを正規化し価値フロー/後始末を人間確認 → e2e-map と同体裁の plan。録画はヒントで正解ではない。単独なら `/e2e-planner:e2e-record <feature> <録画JSON>` で plan だけ作って止められる |
| `e2e-spec` | skill | Step2 シナリオ仕様化 → Markdown plan（観測点 ID つき・`coverage` / `data` メタつき・データ準備経路を HITL 確定） |
| `e2e-codegen` | skill | Step3 Playwright `.spec.ts` 生成（Coverage タグ＋横断 `tag` 付与・`test.step` で観測点 ID を mirror） |
| `e2e-run` | skill | Step4 実行・trace/video/screenshot 収集・失敗6分類 |
| `e2e-audit` | skill | Step5 feature 横断の coverage 不足を算出 → `e2e/index.md` 生成（テストは再実行しない） |

各 skill は単独でも `/e2e-planner:e2e-map` のように呼べる（修復ループで Step4 だけ再実行、横断確認に `/e2e-planner:e2e-audit` だけ実行、など）。

### リポジトリ構造

```
e2e-planner/
├── .claude-plugin/             # プラグイン / マーケットプレイス manifest
│   ├── plugin.json             #   プラグイン定義（name/keywords）
│   └── marketplace.json        #   マーケットプレイス定義
├── commands/
│   ├── e2e-plan.md             # オーケストレーター command（Step1〜4を承認ゲート付きで進め、末尾で Step5 audit を自動実行）
│   └── e2e-audit.md            # 横断 audit command（e2e/index.md 再生成・単独実行可）
├── skills/                     # ワークフローの本体（各 Step = 1 skill）
│   ├── e2e-map/SKILL.md        #   Step1 到達範囲の地図化
│   ├── e2e-record/SKILL.md     #   代替 Step1 録画起点（Recorder JSON 正規化 → e2e-map 同体裁 plan）
│   ├── e2e-spec/SKILL.md       #   Step2 シナリオ仕様化
│   ├── e2e-codegen/SKILL.md    #   Step3 Playwright spec 生成
│   ├── e2e-run/SKILL.md        #   Step4 実行・証跡収集・失敗6分類
│   └── e2e-audit/SKILL.md      #   Step5 横断 coverage 集計 → e2e/index.md
├── scaffold/                   # 対象プロジェクトへコピーする雛形一式（${CLAUDE_PLUGIN_ROOT}/scaffold/ から参照）
│   ├── playwright.config.ts    #   証跡設定・認証 project 構成済み
│   ├── package.snippet.json    #   package.json にマージする scripts
│   ├── .env.example / .gitignore
│   ├── e2e/auth.setup.ts       #   form ログイン → storageState 保存
│   ├── e2e/fixtures/test.ts    #   worker 別アカウント割当 fixture（E2E_USER_POOL・任意）
│   ├── e2e/{plans,tests,reports}/  # 成果物の配置先（.gitkeep）
│   └── scripts/                #   SSO 用 state 採取スクリプト（save-state-cdp.ts ほか）
├── examples/                   # 参考実装（login の plan / setup / spec）
├── claudedocs/                 # 開発アーティファクト（プラグイン動作には不要・下記の配布注記を参照）
│   ├── plans/                  #   変更単位の設計 plan（実装時の判断記録）
│   ├── decisions/              #   ADR（将来へ影響する設計判断の記録）
│   └── ept/                    #   品質改善（EPT）の記録
│       ├── *-eval.md           #     4スキルの反復ログ・収束判定
│       ├── fixtures/           #     eval の採点入力（median/edge）
│       ├── pattern-ledger.md   #     失敗パターン台帳（スキル横断）
│       ├── map-run-ept-plan.md #     map/run の EPT 実施プラン
│       └── live-smoke-notes.md #     収束後ライブ smoke の所見（fixture 妥当性確認）
└── README.md
```

> `skills/` `scaffold/` `examples/` `commands/` `.claude-plugin/` が**配布対象（出荷物）**。`claudedocs/` は品質改善の作業記録・監査証跡で、プラグインの動作には不要。

### 成果物の配置規約

```
e2e/
├── index.md                            # Step5 横断 coverage スナップショット（e2e-audit が毎回上書き生成・手書き不可）
├── plans/<feature>.md                  # Step1 遷移マップ + Step2 シナリオ仕様（coverage / data メタつき）
├── tests/<feature>.spec.ts             # Step3 Playwright spec（test.step で plan の観測点 ID を刻む）
├── pages/<feature>.page.ts             # Step3 入口・ロード完了ゲート・teardown 入口（破壊的シナリオを含む feature では必須・他は任意）
├── fixtures/<feature>.fixture.ts       # Step3 api/db 経路の seed/teardown（plan の data が api/db のときのみ）
├── selectors/<feature>.ts              # Step3 data-testid 定数（アプリに testid があるときのみ）
├── reports/<feature>-<YYYYMMDD-HHmm>.md # Step4 失敗分類表
├── .report/                            # Playwright HTML レポート（CI では junit.xml も同居）
└── .artifacts/                         # trace/video/screenshot
```

> `e2e/index.md` は `plans/ tests/ reports/` からの**派生スナップショット**で、`e2e-audit` が毎回まるごと再生成する（維持台帳ではない）。手書きで編集しない。生成物なので scaffold には置かない。

### 進行モデル

```
/e2e-planner:e2e-plan checkout
  Step1 e2e-map  ┐ 連続（冒頭で e2e/index.md を読む＝重複回避）
  Step2 e2e-spec ┘
  ── ▌承認ゲート①（plan レビュー・修正・承認）
  Step3 e2e-codegen
  Step4 e2e-run（pnpm exec playwright test → 証跡 → 失敗6分類）
  ── ▌承認ゲート②（修正方針の承認）
  Step5 e2e-audit（自動・承認ゲート不要 / e2e/index.md 再生成・テスト再実行なし）
```

`e2e/index.md` は Step1（入口・読む）と Step5（出口・書く）で循環するが、毎回 plans/tests/reports から再生成するので drift しない。横断 coverage だけ見たいときは `/e2e-planner:e2e-audit` を単独実行する。

## 導入

### 1. プラグインをインストール

このリポジトリをマーケットプレイスとして追加し、プラグインを入れる:

```
/plugin marketplace add <this-repo-url-or-path>
/plugin install e2e-planner@e2e-planner-marketplace
```

ローカルパスでも追加できる:

```
/plugin marketplace add /path/to/e2e-planner
```

### 2. 対象プロジェクトをセットアップ（初回のみ）

`e2e-codegen` / `e2e-run` が初回に案内するが、手動なら:

```bash
cp "${CLAUDE_PLUGIN_ROOT}/scaffold/playwright.config.ts" ./playwright.config.ts
mkdir -p e2e/tests e2e/plans e2e/reports
pnpm add -D @playwright/test && pnpm exec playwright install --with-deps chromium   # CI の Linux エージェントでは --with-deps でブラウザ依存ライブラリも入れる
# scaffold/package.snippet.json の scripts を package.json にマージ
```

> プラグインはインストール時に cache へコピーされる。scaffold は `${CLAUDE_PLUGIN_ROOT}/scaffold/` から参照すること（リポジトリの相対パスではない）。

### 3. 使う

```
/e2e-planner:e2e-plan <feature> [対象URL / PRDパス / seed test]
```

## 認証が必要なアプリ

**方針: 認証は「前提条件」がデフォルト。** ログイン済みの状態（storageState）を1回作って各テストの開始状態に当て、テスト内でログイン操作を踏まない。ログインフロー自体の検証だけを未ログイン開始の専用シナリオに隔離する。

### セットアップ

```bash
cp "${CLAUDE_PLUGIN_ROOT}/scaffold/e2e/auth.setup.ts" ./e2e/auth.setup.ts
cp "${CLAUDE_PLUGIN_ROOT}/scaffold/.env.example" ./.env.example   # → cp .env.example .env して実値を入れる
cat "${CLAUDE_PLUGIN_ROOT}/scaffold/.gitignore"                   # 既存 .gitignore にマージ
```

- `auth.setup.ts` が env（`E2E_USER`/`E2E_PASS`）で form ログインし `E2E_STORAGE_STATE`（既定 `e2e/.auth/user.json`）に保存する。**state のパスは config / setup / fixture / 生成 spec のすべてがこの env を見る**（spec に直書きしない。CI では Secure File 等から展開したパスを渡す）。
- `scaffold/playwright.config.ts` は **setup project ＋ `dependencies:['setup']` ＋ `storageState`** 構成済み。認証済み project は light（`chromium`）/ heavy（`chromium-heavy`・`@heavy` タグのみ・非並列・180s）の2つに展開される。
- **並列 worker が同一アカウントを同時操作すると壊れる状態**（単一セッション化・ユーザー単位の下書き/カート/設定）があるアプリは、`E2E_USER_POOL`（`mail:pass,mail:pass,…`・同一ロール・**form モード専用**）を設定し、spec の import を `e2e/fixtures/test.ts` に切り替えると worker ごとに別アカウントの state を当てる（アカウント数が並列度の上限）。プール未設定なら従来の単一 state にフォールバックする。
- **`.env` と `e2e/.auth/` は絶対コミットしない**（ログイン済みセッション＝秘密情報）。`.gitignore` に登録される。
- **採取は cookie / localStorage / IndexedDB の3種すべてを自動カバー**する（`storageState({ indexedDB: true })` 常時 ON）。Firebase など認証トークンを **IndexedDB**（`firebaseLocalStorageDb`）に置くアプリも、特別なモードを足さず form 自動採取・CDP 手動採取いずれでも採れる。復元も `storageState:` 指定だけで自動（自前注入は不要）。
- **Playwright は 1.51 以上が必須**（IndexedDB 採取 `indexedDB: true` が 1.51 で追加されたため）。`scaffold/package.snippet.json` は `@playwright/test ^1.51.0` を指定する。

#### 認証モード（`E2E_AUTH_MODE`）

`playwright.config.ts` は `E2E_AUTH_MODE`（既定 `form`）で projects 構成を切り替える。`.env`（または実行時の環境変数）で指定する:

| モード | setup project | storageState | dependencies | 用途 |
|--------|---------------|--------------|--------------|------|
| `form`（既定） | あり | `E2E_STORAGE_STATE`（既定 `e2e/.auth/user.json`） | `['setup']` | form ログインを `auth.setup.ts` が自動化して state を生成 |
| `prebuilt-state` | なし | `E2E_STORAGE_STATE`（既定 `e2e/.auth/user.json`） | なし | **SSO/OTP/2FA** 等で手動採取（後述の CDP 方式）した state を使う |
| `none` | なし | 空（`{cookies:[],origins:[]}`） | なし | 認証不要なアプリ |

SSO 等で form 自動化できないアプリは `E2E_AUTH_MODE=prebuilt-state` にし、下記の `save-state-cdp.ts` で採取した state（`E2E_STATE_OUT` の出力先＝config が読む `E2E_STORAGE_STATE`）を使う。

### ロール（権限差分）

`auth.setup.ts` に role ごとの setup を足して `e2e/.auth/<role>.json` を保存し、config に role 別 project（`storageState` 指定）を足す。未ログイン検証は state を持たない project（`*.guest.spec.ts` 等）で実行する。雛形にコメント例あり。参考実装は [`examples/login.setup.ts`](examples/login.setup.ts) / [`examples/login.spec.ts`](examples/login.spec.ts)。

### SSO / OTP / 2FA（form 自動化できない場合）

`auth.setup.ts` の自動ログインは効かない（SSO は自動化ブラウザのログインを bot 検知で弾く）。**新規ログインせず、既にログイン済みの実ブラウザのセッションを `connectOverCDP` で取り出す**のが正解。同梱スクリプト `save-state-cdp.ts` を使う:

```bash
cp -r "${CLAUDE_PLUGIN_ROOT}/scaffold/scripts" ./scripts
pnpm add -D tsx   # スクリプト実行に必要
# 1) debug ポート付きの実 Chrome を起動（既存 Chrome は閉じる。Chrome 111+ は --remote-allow-origins 必須、zsh では * をクオート）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --remote-allow-origins='*' \
  --user-data-dir=/tmp/e2e-cdp-profile &
# 2) その窓で対象アプリに普通にログイン（webdriver 制御外なので bot 検知に当たらない）
# 3) 生きたセッションを storageState として吸い出す
E2E_CDP_URL="http://localhost:9222" \
E2E_STATE_OUT="e2e/.auth/user.json" \      # config が読む E2E_STORAGE_STATE と同じ値にする（CI で別パスに展開するなら両方を揃える）
E2E_VERIFY_HOST="app.example.com" \
pnpm exec tsx scripts/save-state-cdp.ts
```

ロールごとに `E2E_STATE_OUT` を変えて複数回実行する。API ログインが可能ならそちら（`request.post` でトークン取得→state 注入）でもよい。

> **採取の成功判定は Cookie だけを見ない。** `E2E_VERIFY_HOST` を指定すると、その host に紐づく **cookie / localStorage / IndexedDB のいずれか**に痕跡があれば成功とみなす（3種すべて空のときだけ「ログイン済みセッション無し」で失敗）。これにより Cookie を使わず IndexedDB にトークンを置く Firebase 等のアプリでも正しく成功判定できる。出力は保存場所別の内訳（例: `cookies: 0 / localStorage: 1 / indexedDB: 1 (firebaseLocalStorageDb)`）。

> **プロファイルをコピーする方式（`save-storage-state.ts`）は SSO では機能しない。** Chrome の Cookie は OS の鍵ストア（macOS Keychain の Chrome Safe Storage）で暗号化されており、別プロセスで開くと復号鍵が違って Cookie 値が壊れ、ログイン画面に戻される。上記の CDP 接続方式が確実（実ブラウザの SSO セッションから有効な state を採取し、認証側テストが pass することを実証済み）。`save-storage-state.ts` は OS 鍵ストアを使わない環境向けの参考に留める。

- どの方式かは Step1（`e2e-map`）の認証方式判定で先に確定させること。
- **state 採取は利用者の手元環境で行う作業**。CI/エージェントは資格情報ストアに触れないため、SSO の state を代理生成できない。

## 入力源の優先順位（Step1）

「あるものを使う」縮退設計:
1. **PRD/仕様ドキュメント**（あれば読む）
2. **実サイト探索** — **chrome-devtools MCP を優先**（軽量）、無ければ playwright MCP
3. **既存 seed test / コード**

いずれも無ければユーザーに提示を求める。**推測で画面を捏造しない／未確認は「未確認」と明記。**

## 破壊的シナリオの扱い（価値フロー起点）

- **出発点は「そのプロダクトを価値たらしめている中心フロー」。** 画面の棚卸しではなく価値を生むシナリオ起点で立てる（Step1）。
- **破壊的かどうかは経路の属性にすぎない。** 作成/更新/削除/送信/課金/メール/通知（永続的状態変更＋外部副作用）は Step1 の遷移表に**属性として記録するだけ**。
- **自己完結（setup→検証→teardown）が既定、除外はオプトアウト。** 価値シナリオは既定で自己完結作成し、ユーザーが「作らないで」と言ったときだけ除外（Step2）。結果的に破壊的なシナリオがあれば**一括提示で「自己完結/除外」を一度に確認**するだけ。
- **無人オーサリング時**（その場で確認できない新規作成）は破壊的シナリオを除外し「要確認」と明示。検証済みの破壊的テスト（teardown 付き）は CI 実行可。
- **不可逆な副作用**（課金・実メール・外部通知など teardown 不能）は人がいても除外 or 明示的合意で慎重に。
- **前提データの準備経路（`ui` / `api` / `db`）も Step2 で確定する。** 作成/削除の UI 自体が検証対象なら `ui` で確定して質問しない。**検証対象でない前提データ**（削除対象・一覧に必要な N 件・permission の対向データ）は、一括提示表の「準備経路 / teardown 経路」列で承認ゲート①のときに人が確定する（既定の提案は Step1 の「投入手段」が有れば `api`/`db`、無ければ `ui`）。結果は各シナリオの `data` 行（`setup` / `own` / `teardown`）に写す。
- **コード化（Step3）は Step2 の確定方針に従うだけ。** 勝手に `test.skip` で黙らせない。自己完結シナリオは plan の `data` 経路どおりに setup/teardown を生成する（`ui` は実際の操作経路、`api` は `request` fixture、`db` はプロジェクト提供スクリプト。プラグインは DB/API 実装を持たない）。作成データは可視プレフィックス＋実行ID のユニーク名、teardown の末尾で「消えたこと」を必ず検証する。

## 設計上の固定方針（レポート準拠）

- **Step2 基本7観点**: happy path / validation error / permission差分 / 戻る / 再読込 / 途中離脱 / ネットワーク遅延 を最低1件ずつ
- **各シナリオ必須項目**: 開始状態・開始状態の確認（precheck・`PRE`）・操作（`O<k>`）・中間観測点（`CP<k>` 採番）・終了条件（`END`）・除外事項（破壊的・自己完結シナリオは teardown も）＋横断 audit 用 `coverage` メタ（class/role/status/exec）＋前提データの `data` メタ（setup/own/teardown）
- **観測点 ID は plan↔trace の契約**: Step3 が `test.step('S<n>-PRE …')` / `('S<n>-O<k> …')` / `('S<n>-CP<k> …')` / `('S<n>-END …')` に mirror し、Step4 の Coverage Matrix が step 名で機械突合する。先頭の `S<n>-PRE` は `[precheck]` 付きメッセージで前提を assert し、Step4 はその失敗を「前提データ不整合」へ機械分類する
- **待機戦略**: `waitForTimeout` / `networkidle` 禁止、同期 read（`count()`/`innerText()`）＋静的 expect 禁止（web-first matcher へ）、否定アサートの前に陽性ランドマーク、「操作後も同じ表示」の検証は再取得完了を先に確定（操作前に `waitForResponse`）、silent success は busy の出現→消滅を2段で待つ
- **retries は CI でも 0**: flaky は retry で吸収せず、Step4 の無修正3回（`--repeat-each 3`）で診断して Step3 へ戻す
- **ロケータ**: role/text/testid 優先、CSS/XPath は最後の手段、`waitForTimeout` 禁止
- **Step4 失敗6分類**: ロケータ破損 / 待機不足 / 前提データ不整合 / 期待値誤り / 視覚baseline未作成 / 環境依存
- **VRT baseline の初回未生成は不具合扱いにしない**

### 横断 coverage（`coverage` メタ ＋ 派生 `index.md`）

feature 横断の coverage matrix を**維持台帳に持たず派生で出す**。同じ事実を複数箇所で同期させると drift するため、**正本は plan**・spec はタグで指す・audit は突合するだけ、という既存方針の延長。

- **`coverage` メタ（plan が正本）**: 各シナリオに `class` / `role` / `status` / `exec` の4フィールドを持たせる（Step2 / e2e-spec）。`route`・`risk` は足さない（route は開始状態に URL が既にある／risk は主観で drift）。
  - **exec**（実行制御・既定 `light`）: `heavy`（想定 60s 超・重い非同期/ファイル往復・共有データへの書き込みで直列必須）のときだけ Step3 が `@heavy` タグを付け、`chromium-heavy` project（非並列・180s）で走る。audit は gap に数えない（index.md に件数列を出すだけ）
  - **class**（基本7観点の slug）: `happy` / `validation` / `permission` / `back` / `reload` / `abandon` / `network`
  - **role**（`storageState` 名に対応する slug）: `guest` / `user` / `admin` など
  - **status**（4値）: `active`（生成対象）/ `excluded`（明示除外）/ `needs_review`（承認前・有効に数えない＝既存「要確認（無人除外）」と同一視）/ `covered_elsewhere`（別 feature で検証済み・新規）
- **spec タグ（mirror）**: Step3（e2e-codegen）が `[S<n> / map#<m>]`（plan↔spec の S/map 突合・既存）に加え、Playwright ネイティブ `tag: ['@feature:<slug>', '@class:<slug>', '@role:<slug>']`（class/role の横断集計・実行時 `--grep`・新規）を付与する。`annotations` API は使わない（`tag` に一本化）。
  - タグは実行時フィルタにもそのまま効く: `pnpm e2e -- --grep '@class:happy'`（価値フローだけ）/ `--grep '@class:network'`（ネットワーク観点だけ）/ `--grep '@feature:<slug>'`（機能単位）/ `--grep-invert` で除外。よく使う `e2e:happy` / `e2e:network` は `scaffold/package.snippet.json` に登録済み。
- **派生 `index.md`**: `e2e-audit`（Step5）が `plans/ tests/ reports/` をスキャンして feature 一覧・class×gap・role×gap・優先 gap 一覧・**spec 健全性**（`waitForTimeout` / `networkidle` / 残 `@guessed` / `expect(await` / `S<n>-PRE` 無し等、grep で確定できる件数のみ・段階評価なし）を `e2e/index.md` に**毎回上書き生成**する。e2e-run の Coverage Matrix（1 feature 内）の横断版。テストは再実行しない（reports の feature ごと最新を `last_run`/`last_status` としてパース）。

## CI に載せやすい形（Azure Pipelines 想定・yaml 自体は範囲外）

生成物と scaffold は、後から CI に載せるときに手を入れずに済む形にしてある。パイプライン定義そのものはこのプラグインの範囲外。

- **CI 判定**: `playwright.config.ts` は `CI` に加えて Azure Pipelines の予定義変数 `TF_BUILD` を見る（`forbidOnly` / `workers` / JUnit 出力の分岐）。
- **結果の機械可読化**: CI では `e2e/.report/junit.xml` を出す（`PublishTestResults@2` の JUnit 形式）。HTML レポートも同じ `e2e/.report` に出るので、そのディレクトリごと成果物にすれば証跡付きレポートと集計の両方が残る。shard するなら blob reporter（config にコメント例）と `e2e:merge` で1つにまとめる。
- **retries は 0 のまま**: retry の pass は JUnit 上も成功に見えるので flaky が隠れる。`E2E_RETRIES` で明示的に上げない限り再試行しない。
- **証跡**: `trace` / `video` は `retain-on-failure` が既定（retries 0 でも失敗時に必ず残る）。監査用途は `E2E_TRACE=on E2E_VIDEO=on`。
- **認証**: form は `E2E_USER` / `E2E_PASS` を変数グループに置く。SSO 等の `prebuilt-state` は手元で採取した state を Secure File として登録し、展開先パスを `E2E_STORAGE_STATE` で渡す（CI では採取しない）。
- **並列度**: `E2E_WORKERS` で上書きする。上げる前提は plan の `data.own=self`（隔離データ）と `E2E_USER_POOL`（worker 別アカウント）。
- **ジョブ分割**: `--project=chromium` / `--project=chromium-heavy`（`e2e:light` / `e2e:heavy`）、`--grep '@feature:<slug>'` / `'@class:<slug>'` でそのまま分けられる。plan の任意節「実装対応」に map# とソースパスの対応を残しておくと、変更ファイルから対象 feature を絞る材料になる。
- **VRT**: baseline は CI と同じ OS・同じブラウザ版で生成する（snapshot 名に OS サフィックスが付く）。日本語 UI は CI 側に CJK フォントが要る。
- **plan に環境変数一覧**: Step1 の plan ヘッダーに必要な環境変数を1行書くので、変数グループの定義が plan から読める。

## 拡張フック点（本体には組み込まない）

- **視覚補完**: DOM で拾えない色・強調・レイアウト・`<canvas>`・iframe は、Playwright VRT（`toHaveScreenshot` / `toMatchAriaSnapshot`）か **Midscene**（`aiAssert`/`aiQuery`）に寄せる。`aiAssert` 単独は幻覚リスクがあるため通常アサーションと併用。
- **探索補完**: 自律探索を厚くしたい場合は **Stagehand**（`observe→act→extract`）や **Browser Use** の知見を Step1 の planner プロンプトへ還元する。
- **BDD**: BDD文化のチームは Markdown plan を正本に Gherkin `.feature` を派生生成（TestZeus Hercules 等）。

## スコープ外

漏れ分析の抽象化・prompt/skill への昇格は手動。`e2e/index.md` の優先 gap 一覧と `e2e/reports/` の蓄積を見て、繰り返す失敗分類を planner/codegen/run の方針へ反映する。（横断 coverage の集計＝`e2e-audit`/Step5 はワークフローに組み込み済みで、ここでいう手動作業はその先の prompt 昇格を指す。）

## 検証状況

- **スキル本文の品質**: 4スキルを [empirical-prompt-tuning（EPT）](https://github.com/mizchi/skills/blob/main/meta/empirical-prompt-tuning/SKILL-ja.md) で改善し**全て収束済み**。判断・分類レイヤー（map の地図化判断、run の失敗6分類など）を recorded fixture で隔離し、白紙の subagent に再現させてスコアした（記録は `claudedocs/ept/`）。
- **fixture の現実妥当性**: 収束後のライブ smoke（chrome-devtools/playwright での実探索・実 `playwright test`）で、fixture の出力形式が実環境と乖離していないことを確認（`claudedocs/ept/live-smoke-notes.md`）。
- **未実施**: プラグイン全体（command → Step1〜4）を実プロジェクトに通した end-to-end の通し実行・証跡収集。マニフェスト/frontmatter は `/plugin validate` で確認すること。
