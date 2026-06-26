# e2e-planner

WebアプリのE2Eテストシナリオを生成する **Claude Code プラグイン**。
到達範囲の地図化 → シナリオ仕様化 → Playwright コード生成 → 実行・証跡収集の **4段ワークフロー**を、承認ゲート付きで進める。**Playwright 主軸**。

調査レポート（Playwright planner/generator/healer、screen transition / state graph、WebJudge の中間状態評価、Stagehand/Browser Use の観測→行動→検証）を実務ワークフローに落とし込んだもの。

## 構成

| コンポーネント | 種別 | 役割 |
|----------------|------|------|
| `/e2e-planner:e2e-plan <feature>` | command | オーケストレーター。Step1〜4を承認ゲート付きで進め、末尾で Step5（audit）を自動実行 |
| `/e2e-planner:e2e-audit` | command | 横断 audit。スイート全体をスキャンして `e2e/index.md` を再生成（単独実行可） |
| `e2e-map` | skill | Step1 到達範囲の地図化 → 遷移マップ（Markdown） |
| `e2e-spec` | skill | Step2 シナリオ仕様化 → Markdown plan（観測点つき・`coverage` メタつき） |
| `e2e-codegen` | skill | Step3 Playwright `.spec.ts` 生成（Coverage タグ＋横断 `tag` 付与） |
| `e2e-run` | skill | Step4 実行・trace/video/screenshot 収集・失敗6分類 |
| `e2e-audit` | skill | Step5 feature 横断の coverage 不足を算出 → `e2e/index.md` 生成（テストは再実行しない） |

各 skill は単独でも `/e2e-planner:e2e-map` のように呼べる（修復ループで Step4 だけ再実行、横断確認に `/e2e-planner:e2e-audit` だけ実行、など）。

### リポジトリ構造

```
e2e-planner/
├── .claude-plugin/             # プラグイン / マーケットプレイス manifest
│   ├── plugin.json             #   プラグイン定義（name/version/keywords）
│   └── marketplace.json        #   マーケットプレイス定義
├── commands/
│   ├── e2e-plan.md             # オーケストレーター command（Step1〜4を承認ゲート付きで進め、末尾で Step5 audit を自動実行）
│   └── e2e-audit.md            # 横断 audit command（e2e/index.md 再生成・単独実行可）
├── skills/                     # ワークフローの本体（各 Step = 1 skill）
│   ├── e2e-map/SKILL.md        #   Step1 到達範囲の地図化
│   ├── e2e-spec/SKILL.md       #   Step2 シナリオ仕様化
│   ├── e2e-codegen/SKILL.md    #   Step3 Playwright spec 生成
│   ├── e2e-run/SKILL.md        #   Step4 実行・証跡収集・失敗6分類
│   └── e2e-audit/SKILL.md      #   Step5 横断 coverage 集計 → e2e/index.md
├── scaffold/                   # 対象プロジェクトへコピーする雛形一式（${CLAUDE_PLUGIN_ROOT}/scaffold/ から参照）
│   ├── playwright.config.ts    #   証跡設定・認証 project 構成済み
│   ├── package.snippet.json    #   package.json にマージする scripts
│   ├── .env.example / .gitignore
│   ├── e2e/auth.setup.ts       #   form ログイン → storageState 保存
│   ├── e2e/{plans,tests,reports}/  # 成果物の配置先（.gitkeep）
│   └── scripts/                #   SSO 用 state 採取スクリプト（save-state-cdp.ts ほか）
├── examples/                   # 参考実装（login の plan / setup / spec）
├── claudedocs/                 # 開発アーティファクト（プラグイン動作には不要・下記の配布注記を参照）
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
├── plans/<feature>.md                  # Step1 遷移マップ + Step2 シナリオ仕様（coverage メタつき）
├── tests/<feature>.spec.ts             # Step3 Playwright spec
├── reports/<feature>-<YYYYMMDD-HHmm>.md # Step4 失敗分類表
├── .report/                            # Playwright HTML レポート
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
pnpm add -D @playwright/test && pnpm exec playwright install
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

- `auth.setup.ts` が env（`E2E_USER`/`E2E_PASS`）で form ログインし `e2e/.auth/user.json` を保存する。
- `scaffold/playwright.config.ts` は **setup project ＋ `dependencies:['setup']` ＋ `storageState`** 構成済み。
- **`.env` と `e2e/.auth/` は絶対コミットしない**（ログイン済みセッション＝秘密情報）。`.gitignore` に登録される。
- **採取は cookie / localStorage / IndexedDB の3種すべてを自動カバー**する（`storageState({ indexedDB: true })` 常時 ON）。Firebase など認証トークンを **IndexedDB**（`firebaseLocalStorageDb`）に置くアプリも、特別なモードを足さず form 自動採取・CDP 手動採取いずれでも採れる。復元も `storageState:` 指定だけで自動（自前注入は不要）。
- **Playwright は 1.51 以上が必須**（IndexedDB 採取 `indexedDB: true` が 1.51 で追加されたため）。`scaffold/package.snippet.json` は `@playwright/test ^1.51.0` を指定する。

#### 認証モード（`E2E_AUTH_MODE`）

`playwright.config.ts` は `E2E_AUTH_MODE`（既定 `form`）で projects 構成を切り替える。`.env`（または実行時の環境変数）で指定する:

| モード | setup project | storageState | dependencies | 用途 |
|--------|---------------|--------------|--------------|------|
| `form`（既定） | あり | `e2e/.auth/user.json` | `['setup']` | form ログインを `auth.setup.ts` が自動化して state を生成 |
| `prebuilt-state` | なし | `e2e/.auth/user.json` | なし | **SSO/OTP/2FA** 等で手動採取（後述の CDP 方式）した state を使う |
| `none` | なし | 空（`{cookies:[],origins:[]}`） | なし | 認証不要なアプリ |

SSO 等で form 自動化できないアプリは `E2E_AUTH_MODE=prebuilt-state` にし、下記の `save-state-cdp.ts` で採取した `e2e/.auth/user.json` を使う。

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
E2E_STATE_OUT="e2e/.auth/user.json" \
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
- **コード化（Step3）は Step2 の確定方針に従うだけ。** 勝手に `test.skip` で黙らせない。自己完結シナリオは setup/teardown を **UI 経路（純 E2E）**で生成し、teardown は best-effort・作成データは timestamp 付きユニーク名。

## 設計上の固定方針（レポート準拠）

- **Step2 基本7観点**: happy path / validation error / permission差分 / 戻る / 再読込 / 途中離脱 / ネットワーク遅延 を最低1件ずつ
- **各シナリオ必須項目**: 開始状態・操作・中間観測点・終了条件・除外事項（破壊的・自己完結シナリオは teardown も）＋横断 audit 用 `coverage` メタ（class/role/status）
- **ロケータ**: role/text/testid 優先、CSS/XPath は最後の手段、`waitForTimeout` 禁止
- **Step4 失敗6分類**: ロケータ破損 / 待機不足 / 前提データ不整合 / 期待値誤り / 視覚baseline未作成 / 環境依存
- **VRT baseline の初回未生成は不具合扱いにしない**

### 横断 coverage（`coverage` メタ ＋ 派生 `index.md`）

feature 横断の coverage matrix を**維持台帳に持たず派生で出す**。同じ事実を複数箇所で同期させると drift するため、**正本は plan**・spec はタグで指す・audit は突合するだけ、という既存方針の延長。

- **`coverage` メタ（plan が正本）**: 各シナリオに `class` / `role` / `status` の3フィールドを持たせる（Step2 / e2e-spec）。`route`・`risk` は足さない（route は開始状態に URL が既にある／risk は主観で drift）。
  - **class**（基本7観点の slug）: `happy` / `validation` / `permission` / `back` / `reload` / `abandon` / `network`
  - **role**（`storageState` 名に対応する slug）: `guest` / `user` / `admin` など
  - **status**（4値）: `active`（生成対象）/ `excluded`（明示除外）/ `needs_review`（承認前・有効に数えない＝既存「要確認（無人除外）」と同一視）/ `covered_elsewhere`（別 feature で検証済み・新規）
- **spec タグ（mirror）**: Step3（e2e-codegen）が `[S<n> / map#<m>]`（plan↔spec の S/map 突合・既存）に加え、Playwright ネイティブ `tag: ['@feature:<slug>', '@class:<slug>', '@role:<slug>']`（class/role の横断集計・実行時 `--grep`・新規）を付与する。`annotations` API は使わない（`tag` に一本化）。
- **派生 `index.md`**: `e2e-audit`（Step5）が `plans/ tests/ reports/` をスキャンして feature 一覧・class×gap・role×gap・優先 gap 一覧を `e2e/index.md` に**毎回上書き生成**する。e2e-run の Coverage Matrix（1 feature 内）の横断版。テストは再実行しない（reports の feature ごと最新を `last_run`/`last_status` としてパース）。

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
