---
description: WebアプリのE2Eシナリオ生成ワークフロー（到達範囲の地図化→シナリオ仕様化→Playwrightコード生成→実行・証跡収集）を承認ゲート付きで進めるオーケストレーター
argument-hint: <feature-name> [対象URL / PRDパス / seed test / 録画JSONパス(ChromeDevTools Recorder) など]
---

# E2E シナリオ生成オーケストレーター

対象機能: **$1**
補足コンテキスト（任意）: $ARGUMENTS

この4段ワークフロー（地図化→仕様化→**コード生成＋収束ループ**→実行）を順に進め、Step1（地図化）は**探索起点（`e2e-map`・既定）/ 録画起点（`e2e-record`）を入力に応じて切り替える**（下記「Step1 のモード判定」）。**末尾で Step5（横断 audit）を自動実行**する。**Step2後とStep4後は必ず停止してユーザー承認を取る**。承認なしに次へ進んではならない。Step5（audit）は派生物 `e2e/index.md` の再生成なので承認ゲートを挟まない。各Stepは対応するskillに委譲する。

> **Step3 が収束ループまで担う。** 憶測込みの spec はまず通らない前提で、Step3 が実画面探索（chrome-devtools / Playwright MCP）しながら自律で通るまで潰し、**通らない残差（残 `@guessed`）だけ Step4 が分類する**。認証確立・人間タスクも Step3 の収束ループ入口へ前倒しした（旧 Step4 直前の手動 state 採取は Step3 へ移設）。Step4 は確定版の証跡化・残差分類・Coverage Matrix・flaky 再評価に純化され、実行修正ループは持たない。

## feature-name の slug 化（ファイル名規約）

`$1` をファイル名に使う前に、次の規則で **slug 化**する。成果物パス `e2e/plans/<slug>.md` / `e2e/tests/<slug>.spec.ts` / `e2e/reports/<slug>-<...>.md` はこの slug 化後の名前を使う。**元の表示名は plan の title（`# E2E Plan: <表示名>`）にそのまま保持**する。

- **URL が入力された場合は最後の path セグメントを採用**（例: `https://app.example.com/projects/checkout` → `checkout`）。クエリ/フラグメントは捨てる。
- **空白 → `-`**。
- **`/ : ? # &` 等の path/URL 予約文字・記号 → `-`**。
- **連続する `-` は1つに圧縮**し、**先頭・末尾の `-` は除去**する。
- **日本語はそのまま許可**（ファイル名に使う）。英数字・`-`・日本語以外の記号類だけを `-` に倒す。

> 例: `ログイン / Sign-in?ref=top` → `ログイン-Sign-in-ref-top`。`チェックアウト フロー` → `チェックアウト-フロー`。

## 進め方

### Step1 のモード判定（map / record）

Step1 には**探索起点（`e2e-map`・既定）**と**録画起点（`e2e-record`）**の2つの入口がある。どちらも成果物は `e2e/plans/<slug>.md`（e2e-map 体裁の「遷移マップ」＋「未確定（Step2 進行判定）」4項目）で、**Step2 以降の流れ・承認ゲートは全モード共通**。次の順で判定する:

1. `$ARGUMENTS` に**実在する `.json` ファイルパス**が含まれ、その中身が ChromeDevTools Recorder のエクスポート（`title` と `steps[]` を持つ）なら **録画起点（`e2e-record`）**。
2. ユーザーが「録画から」「e2e-record で」等と明示していれば **録画起点**（録画JSONパスが引数に無ければ所在をユーザーに確認する）。
3. どちらにも該当しなければ **探索起点（`e2e-map`）**。
4. 判定が曖昧な場合（`.json` はあるが Recorder 形式でない・録画と URL の両方が渡された等）は**推測で決め打ちせず** `AskUserQuestion` でモードを確認する。

### Step1 →（条件付き停止）→ Step2

1. モード判定に従い、対象機能 `$1` の **遷移マップ付き plan** を起こす。

   **1a. 探索起点（既定）— `e2e-map` skill を起動する。**
   - **冒頭で既存 `e2e/index.md`（横断スナップショット）を読む**（無ければ `e2e/plans/*.md` をスキャン）。既に他 feature で検証済みの経路は重複作成せず、未検証の経路を優先する。index.md は Step5 の `e2e-audit` が生成する派生物で、ここでは**読むだけ**。
   - 入力源は「あるものを使う」優先順位: ① PRD/仕様ドキュメント ② 実サイト探索（chrome-devtools MCP優先 / playwright MCPフォールバック）③ 既存 seed test/コード。
   - 成果物: `e2e/plans/<slug>.md` の「遷移マップ」セクション。
   - **コードは書かない。未確認領域は「未確認」と明記する。**

   **1b. 録画起点 — `e2e-record` skill を起動する。**
   - 録画JSON（判定1のパス）を種に、ノイズ除去→意味ステップ化→セレクタ選定→価値フロー/後始末の人間ラベル付け→一括意図確認（成功の定義WHAT・`E2E_AUTH_MODE`・実行ロール等）を経て、**e2e-map と同体裁**の plan を生成する。詳細は skill 本文に従う。
   - 既存 `e2e/index.md` を冒頭で読む点は 1a と同じ。**コードは書かない・ライブ探索はしない。**
   - 録画固有の申し送り（**要修復セレクタ・未確定オラクルHOW**）は plan に残り、**Step3（e2e-codegen）の収束ループが実画面探索で解決する**——録画起点のための追加ステップは不要で、既存の Step3 がそのまま受ける。
   - **permission（別ロール/ログアウト）は録画1本の視野外**として plan に申し送られる。Step2（e2e-spec）は自身の規則に従って permission 観点の扱い（該当なし明記・別シナリオ化など）を判断する。

   **▌Step2 進行判定（条件付き停止）**: Step1（e2e-map / e2e-record いずれのモードでも）の出力する「未確定（Step2 進行判定）」セクションを確認する。**4項目（中心価値・認証方式・対象ロール・画面確認手段）のいずれかに「未確定」が残る場合は、Step2 に進まず停止し、ユーザーに確認を取る**（推測で埋めて先に進まない）。4項目すべて確定済みなら、続けて Step2 を連続実行してよい。
   > teardown 可否（破壊的シナリオの自己完結/除外）はこの判定に**含めない**。それは Step2（e2e-spec）の自己完結/除外ゲート＋承認ゲート①で諮る。

2. 4項目が確定したら **`e2e-spec` skill** を起動し、遷移マップからシナリオ仕様を起こす。
   - 成果物: 同じ `e2e/plans/<slug>.md` の「シナリオ仕様」セクション（Markdown plan）。
   - 基本7観点（happy path / validation error / permission差分 / 戻る操作 / 再読込 / 途中離脱 / ネットワーク遅延）を最低1件ずつ。
   - 各シナリオに「開始状態・操作・中間観測点・終了条件・除外事項」を必須で持たせる。
   - 各シナリオに **`data`（前提データの準備/後始末経路 `setup`/`own`/`teardown`）・`exec`（`light`/`heavy`）・開始状態の確認（precheck・`PRE`）・中間観測点の `CP<k>` 採番**を持たせる（語彙は e2e-spec 参照。Step3 が `test.step` と `@heavy` に mirror する）。

### ▌承認ゲート①（plan レビュー）

`e2e/plans/<slug>.md` を要約提示し、**ユーザーのレビュー・修正・承認を待つ**。破壊的シナリオの自己完結/除外に加え、**検証対象でない前提データの準備経路（`ui`/`api`/`db`）と teardown 経路もここで確定する**（一括提示表の「準備経路 / teardown 経路」列。作成/削除 UI 自体が検証対象の行は `ui` 確定で質問しない）。

> 「この plan で Step3（コード生成）に進んでよいか確認してください。修正があれば指示してください。」

承認が出るまで Step3 に進まない。

### Step3（承認後・収束ループまで）

3. **`e2e-codegen` skill** を起動し、承認済み plan を Playwright spec へ変換し、**実画面を探索しながら通るまで収束させる**（静的生成 → 認証確立 → 収束ループ）。
   - 成果物: `e2e/tests/<slug>.spec.ts`（収束済み＋残差は残 `@guessed` 付きで残る）。
   - ロケータは role/text/testid 優先、CSS/XPath は最後の手段。非同期は web-first assertion で待つ。実画面未観測の行は `// @guessed` を付与。
   - 視覚差分が重要なシナリオには `toHaveScreenshot()` 併用候補をコメントで提案。
   - **セットアップ未了なら Step3 が自動で（一行告知して）依存インストール・scaffold 配置・既知の非シークレット `.env` 値生成まで実行する**（承認ゲートは足さない）。
   - **認証確立と人間タスク（state 採取・資格情報投入）は Step3 の「収束ループ入口」で `E2E_AUTH_MODE` 分岐により一度だけ行う**（`prebuilt-state`=CDP state 採取 / `form`=`.env` 投入依頼 / `none`=即ループ）。**「Step3 は人間タスクゼロ」原則はここで意図的に放棄する。**
   - **収束ループ**: 初回フルラン → 落ちたテストだけを1本=1サブエージェント（直列）で chrome-devtools 診断 → Playwright MCP 検証 → spec 最小修正 → 実走、を **test ごと最大 N=3** 巡。green で `@guessed` を外し確定、N 尽きは残差化、(c) 計画漏れ/前提データ不整合は attempt 非消費で plan・map／seed・env へ差し戻す。**バックストップ上限（既定 = テスト数 × 3）** で累計暴走を防ぐ。

### Step4

4. **`e2e-run` skill** を起動し、**収束済みスイートをフレッシュに1回実行して証跡を収集し、残差だけを分類する**（実行修正ループは持たない）。
   - **認証は Step3 で確立済み。Step4 は原則ノータスク**（`prebuilt-state` の state が失効していた場合のみ CDP 再採取）。
   - `pnpm exec playwright test e2e/tests/<slug>.spec.ts` を実行（証跡は収束後の確定版で取得）。
   - **残差（残 `@guessed` の失敗）だけ**を6分類（ロケータ破損 / 待機不足 / 前提データ不整合 / 期待値誤り / 視覚baseline未作成 / 環境依存）。収束済みは分類対象外。
   - **`[precheck]` 付きの失敗（`S<n>-PRE` step）は「前提データ不整合」へ機械分類**し、同一原因の全赤を1件に畳む（アプリ不具合と環境側の不備を切り分ける）。
   - **retries は CI でも 0 が既定**（`E2E_RETRIES` で明示上書きのみ）。flaky は retry で吸収せず、無修正3回の再評価で診断して Step3 へ戻す。
   - Coverage Matrix（plan↔spec↔結果突合）を作る。重要シナリオは**同一条件・無修正で3回**の flaky 再評価（収束ループの N=3 とは別物）。
   - 成果物: `e2e/reports/<slug>-<YYYYMMDD-HHmm>.md`（Coverage Matrix + 残差分類表 + trace/video/screenshot へのパス）。
   - **VRT baseline の初回未生成は不具合扱いにしない。**

### ▌承認ゲート②（残差の扱い方針）

残差分類表を提示し、**残差の処遇（EPT/プロンプト改善行き / plan・map 差し戻し / seed・env 差し戻し）をユーザーに承認させる**。Step4 はその場で spec を直して通し直さない（spec 修正は Step3 収束ループの仕事）。**全テストが収束していれば残差ゼロで、このゲートは実質スルー。**

> 「残差の分類と処遇方針はこの通りです。どこへ差し戻す／何に記録するか確認してください。」

### Step5（自動・承認ゲート不要）

5. **`e2e-audit` skill** を起動し、`e2e/index.md`（横断スナップショット）を再生成する。
   - Step4（run）でレポートが出揃った直後に**自動実行**する。`plans/ tests/ reports/` をスキャンして feature 横断の coverage 不足を算出し、`e2e/index.md` を上書きする。**テストは再実行しない。**
   - **spec 健全性（静的チェック）も index.md に出す**（`waitForTimeout` / `networkidle` / 残 `@guessed` / `expect(await` / `S<n>-PRE` 無し等、grep で確定できる件数のみ。段階評価は付けない）。
   - **Step4 の実行が失敗してもスキップせず常に実行**する（その feature の `last_status=failed` を index.md に反映する）。承認ゲート②（修正方針）の結果とは独立で、修正の前後どちらでも構わない（index.md は派生物なので承認を挟まない）。
   - これは Step1 の `e2e-map` が読む `e2e/index.md` の出口にあたる（入口=Step1 / 出口=Step5 で循環するが、毎回再生成するので drift しない）。

## 注意

- セットアップ未了（`playwright.config.ts` や `e2e/` が無い）の場合、`e2e-codegen`（Step3）が `${CLAUDE_PLUGIN_ROOT}/scaffold/` から**自動でコピー・インストールする**（一行告知して実行・承認ゲートは挟まない）。既知の非シークレット `.env` 値（`E2E_BASE_URL`/`E2E_AUTH_MODE`）まで Step3 が書き、シークレット投入と state 採取は **Step3 の収束ループ入口**で `E2E_AUTH_MODE` 分岐により人間へ依頼する（旧・Step4 直前から前倒し移設）。
- Step5（`e2e-audit` による `e2e/index.md` 再生成）はワークフローの一部として**自動実行**される（上記）。横断 coverage の確認は単独 `/e2e-planner:e2e-audit` でも行える。
- 漏れ分析の抽象化・prompt/skill への昇格はこのワークフローの範囲外（手動）。`e2e/index.md` の優先 gap 一覧と `e2e/reports/` の蓄積を見て手動で行う。
