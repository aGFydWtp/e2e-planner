# e2e-hardening: E2E 運用知見（並列化・待機戦略・データ独立性・手順トレーサビリティ）を plan 書式・skill 規約・scaffold に反映する

調査レポート（セッション scratchpad）: 参考記事の推奨事項と本プラグインの突き合わせ結果を3系統のサブエージェントで集約したもの。
**制約: プラグインは汎用物。出荷物（skills/ scaffold/ examples/ commands/ README.md）に参考記事の製品名・固有スタック（特定 BaaS/ゲートウェイ名等）・記事 URL・個別プロジェクトの画面文言を書かない。** 一般的な技術名（Playwright / Azure Pipelines / JUnit / IndexedDB 等）は可。

## Goal

- 待機戦略の抜け（同期 read+静的 expect の禁止 / 再取得後に表示が変わらないレース / busy 出現→消滅の2段待ち）を e2e-codegen に焼き込む。
- **データ準備経路（ui/api/db）を plan の必須項目にし、Step2 で HITL 確認する。** 作成/削除 UI 自体が検証対象なら `ui` で確定（質問しない）。検証対象でない前提データは承認ゲート①の一括提示表で経路を人に確定させる。
- 観測点に ID を振り `test.step` に mirror する（plan↔trace の手順粒度トレーサビリティ）。
- 実行制御軸 `exec=light|heavy` を coverage メタに足し、`@heavy` タグと light/heavy project に接続する。
- precheck（開始状態の確認）を plan 項目化し、`[precheck]` 失敗を run が機械分類する。
- scaffold を Azure Pipelines に載せやすい形にする（`TF_BUILD` 判定・JUnit・retries=0・trace retain-on-failure・storageState パス env 化・worker 別アカウント fixture・timeout 明示）。CI yaml は書かない。
- audit に grep で確定できる spec 健全性チェックを足す（主観採点は入れない）。

## Clarifications

質問ゼロ。理由: ユーザーがデータ準備経路の方針（plan 必須項目化＋検証対象でない場合の HITL）と「他の提案も採用」「汎用物として個別プロジェクト情報を含めない」を会話で明示済み。残る判断（語彙・既定値）は既存規約から決まる。
- version フィールドは上流コミット d7c5f6b で廃止済み（commit SHA ベース配信）→ 版数更新は行わない。
- 上流 d7c5f6b が `workers: CI ? 1` の理由（ファイル間で外部データストアを共有する構成への安全側）を config コメントに追加済み → CI 既定 1 は維持し、`E2E_WORKERS` で上書き可にするだけ。

## Existing Structure

- plan が正本。spec はタグ（`[S<n> / map#<m>]`・`@feature/@class/@role`）で plan を指し、run/audit は突合するだけ（README「横断 coverage」）。
- Step2 が方針を決め Step3 は従うだけ（e2e-spec:23-55、e2e-codegen:87）。破壊的シナリオは一括提示表で「自己完結/除外」を決める。
- coverage メタは `- **coverage**: class= / role= / status=` の1行（e2e-spec:102-134）。audit は3軸のみ集計。
- 収束ループは spec の行単位に `// @guessed` を付け外しする（e2e-codegen）。run は `grep @guessed e2e/tests/<feature>.spec.ts`。
- scaffold: setup project + role 別 project、`E2E_AUTH_MODE` 分岐、reporter list+html、retries CI?2:0、trace on-first-retry、workers CI?1。

## Data Shape

**plan（e2e/plans/<feature>.md）に追加する機械可読フィールド（語彙固定）:**

```markdown
- **coverage**: class=`happy` / role=`user` / status=`active` / exec=`light`
- **data**: setup=`ui` / own=`self` / teardown=`ui`
```

| フィールド | 語彙 | 意味 |
|---|---|---|
| `exec` | `light`（既定）/ `heavy` | `heavy` = 想定 60s 超・重い非同期/ファイル往復・共有データへの書き込みで直列必須。判定根拠を除外事項の隣に1行書く |
| `data.setup` | `ui` / `api` / `db` / `seed` / `none` | 前提データの準備経路。`seed`=固定シードを読むだけ。`none`=前提データ不要 |
| `data.own` | `self` / `shared` | `self`=本シナリオが作る。`shared`=既存データを読む。`shared` に**書き込む**場合は理由を書く（並列衝突候補→`exec=heavy`） |
| `data.teardown` | `ui` / `api` / `db` / `none` | 後始末経路。非破壊は `none` |

**HITL 規則（e2e-spec）:** 作成/削除の UI 経路自体がシナリオの検証対象（価値フローに含まれる）なら `ui` で確定し質問しない。検証対象でない前提データ（削除シナリオの削除対象・一覧 N 件・permission 対向データ等）は、破壊的シナリオの一括提示表に「準備経路 / teardown 経路」列を足して承認ゲート①で人に確定させる。既定の提案値は Step1「投入手段」が有るなら `api`/`db`、無ければ `ui`。無人オーサリングでは `ui` のまま除外事項に「データ経路 要確認」と残す。

**観測点 ID:** 操作 `O<k>`（既存の番号付き列）、中間観測点 `CP<k>`（採番必須）、終了条件 `END`、開始状態の確認 `PRE`（新規必須項目「開始状態の確認（precheck）」）。spec は `test.step('S<n>-PRE …')` / `('S<n>-O<k> …')` / `('S<n>-CP<k> …')` / `('S<n>-END …')` で区切る。

**e2e-map/e2e-record の追加行（スキーマ同一維持）:**
- ヘッダー `> 環境変数: E2E_BASE_URL, E2E_AUTH_MODE=<値>, <ロール別 USER/PASS>, <api/db 投入用があれば>`
- 前提データ/環境 `- 投入手段: <テスト用 API | DB 接続 | seed スクリプト | アカウント発行 API | なし | 未確認>`
- ロール一覧に「ロールごとのテストアカウント数」「同一アカウント同時操作で壊れる状態」
- 任意節 `### 実装対応（任意・impact map の種）` `| map# | ルートパス | 主要コンポーネント / ソースパス |`（入力源にコードが無ければ節ごと省略）

**spec タグ:** 既存3系統に加え `exec=heavy` のときだけ `@heavy` を tag に mirror（light はタグ無し・`grepInvert` で分ける）。

**scaffold 設定値:**
- `const isCI = !!(process.env.CI || process.env.TF_BUILD)`
- `retries: Number(process.env.E2E_RETRIES ?? 0)`、`workers: process.env.E2E_WORKERS ? Number(...) : (isCI ? 1 : undefined)`
- reporter: list + html + `junit`（`e2e/.report/junit.xml`、isCI 時）+ blob（コメント例・shard 時）
- `trace: process.env.E2E_TRACE ?? 'retain-on-failure'`、`video: process.env.E2E_VIDEO ?? 'retain-on-failure'`
- `timeout: 60_000`、`expect.timeout: 10_000`
- projects: `chromium`（`grepInvert: /@heavy/`）+ `chromium-heavy`（`grep: /@heavy/`, `fullyParallel: false`, `timeout: 180_000`）を各 auth mode 分岐に
- `STORAGE_STATE = process.env.E2E_STORAGE_STATE ?? 'e2e/.auth/user.json'`（config / auth.setup / codegen の teardown 例で共有）
- `e2e/fixtures/test.ts`: worker-scoped fixture。`E2E_USER_POOL`（`mail:pass,mail:pass`）があれば `parallelIndex` でアカウント割当し `e2e/.auth/user-<i>.json` を遅延生成。無ければ既定 storageState にフォールバック

## Organizing Structure

生成物の層は **spec（必須）＋ pages（破壊的・自己完結シナリオを含む feature では必須、他は任意）＋ fixtures / selectors（任意）**（多層 POM は採らない）: `e2e/tests/<feature>.spec.ts`（test/step/assert）、`e2e/pages/<feature>.page.ts`（入口 `open()`・ロード完了ゲート `waitLoaded()`・teardown 入口・`rowByName()`・操作。teardown が別 context から本文と同じ入口/ゲートを使うため破壊的 feature で必須）、`e2e/fixtures/<feature>.fixture.ts`（api/db 経路の seed/teardown）、`e2e/selectors/<feature>.ts`（data-testid がある場合のみ）。`data.teardown` は「失敗時にも走る回収経路」で、本文の UI 削除が検証対象でも `setup=api` なら `teardown=api`（冪等 DELETE・404 許容）。serial 免除の判定は `own=self` かつ `setup∈{api,db}` だけで閉じる（レビュー1周目で確定）。spec のロケータ直書きは禁止しない（`@guessed` 行単位収束と衝突）が、2テスト以上で使うロケータ・ゲート・teardown 入口は pages へ。api 経路の seed/teardown は `e2e/fixtures/<feature>.fixture.ts`。

## Boundaries

- プラグインは DB/API 実装を持たない。`api`/`db` 経路の実体はプロジェクト側（`request` fixture / 提供スクリプト）。
- Step2 が経路と exec を決め、Step3 は従う（既存の責務分担を維持）。
- audit は exec/data を gap 集計に使わない（穴ではない）。index.md に heavy 件数列と「spec 健全性」表を足すだけ。
- CI yaml・impact-map resolver・インフラ計装は書かない。

## Considered Designs

**A. plan に `data`/`exec` フィールドを足し Step2 で HITL 確定、Step3 は従う（採用）**
- smallest change: 中。5 skill の書式を触るが既存の coverage 1行方式に相乗り。
- reader load: 低。plan を読めば経路・負荷が分かる。
- invalid state: `own=shared` かつ書き込みは理由必須＋heavy で表現可能。
- boundary: Step2 決定 / Step3 追従の既存境界を維持。
- rollback: 行を消せば旧書式に戻る。audit は未付与を「メタ未付与」扱いで吸収。

**B. plan は変えず、codegen が生成時に「UI 準備が検証対象でない」と判断したら都度質問（最小変更案）**
- smallest change: 小（codegen のみ）。
- 却下理由: 「Step2 が決め Step3 は従う」境界を壊す。無人オーサリング（承認ゲート①で一括確認）に乗らない。plan 正本方針に反し audit/run から経路が見えない。

**exec 軸: A' coverage の第4フィールド（採用）vs B' spec タグのみ**
- B' は plan 正本方針に反し、承認ゲート①で負荷分類をレビューできないため却下。

contested = false（ユーザーが A を会話で選択済み。B との拮抗なし）。

## Chosen Design

A + A'。上記 Data Shape / Organizing Structure のとおり。

## Scope

担当分割（ファイル所有を重ねない）:
1. **scaffold + examples**: `scaffold/playwright.config.ts`, `scaffold/e2e/auth.setup.ts`, `scaffold/e2e/fixtures/test.ts`（新規）, `scaffold/package.snippet.json`, `scaffold/.env.example`, `scaffold/.gitignore`, `examples/login.spec.ts`, `examples/login.setup.ts`, `examples/login.plan.md`
2. **codegen + run**: `skills/e2e-codegen/SKILL.md`, `skills/e2e-run/SKILL.md`
3. **map + spec + record + audit + command**: `skills/e2e-map/SKILL.md`, `skills/e2e-spec/SKILL.md`, `skills/e2e-record/SKILL.md`, `skills/e2e-audit/SKILL.md`, `commands/e2e-plan.md`
4. **README.md**: 1〜3 の後にメインループが更新（配置規約・認証・破壊的シナリオ行・固定方針・CI 載せやすさ節）

スコープ外（PR に候補として記す）: impact-map resolver、CI yaml、Playwright Docker タグ運用の自動化。

## Verification

- automated: scratchpad に一時プロジェクトを作り `@playwright/test` + `typescript` を入れて `tsc --noEmit` で scaffold/*.ts・examples/*.ts・fixtures を型検査（package.json がリポジトリに無いため）。
- static: 語彙の横断整合を grep で確認（`exec=`, `data`: setup/own/teardown, `CP<k>`, `PRE`, `@heavy`, `[precheck]`, `E2E_STORAGE_STATE` が spec/codegen/run/audit/scaffold/README で同じ語）。固有名詞混入の grep（製品名・固有スタック名・記事 URL）。
- matching surface: skill 本文は Claude Code が読む prompt であり、実 Web アプリを対象にした E2E 実走はこの PR では行わない（実行不能: 対象アプリなし）。手動確認手順を PR に書く。
