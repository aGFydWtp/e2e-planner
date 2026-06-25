---
description: WebアプリのE2Eシナリオ生成ワークフロー（到達範囲の地図化→シナリオ仕様化→Playwrightコード生成→実行・証跡収集）を承認ゲート付きで進めるオーケストレーター
argument-hint: <feature-name> [対象URL / PRDパス / seed test など]
---

# E2E シナリオ生成オーケストレーター

対象機能: **$1**
補足コンテキスト（任意）: $ARGUMENTS

この4段ワークフローを順に進める。**Step2後とStep4後は必ず停止してユーザー承認を取る**。承認なしに次へ進んではならない。各Stepは対応するskillに委譲する。

## 進め方

### Step1 → Step2（連続実行・停止なし）

1. **`e2e-map` skill** を起動し、対象機能 `$1` の到達範囲を地図化する。
   - 入力源は「あるものを使う」優先順位: ① PRD/仕様ドキュメント ② 実サイト探索（chrome-devtools MCP優先 / playwright MCPフォールバック）③ 既存 seed test/コード。
   - 成果物: `e2e/plans/$1.md` の「遷移マップ」セクション。
   - **コードは書かない。未確認領域は「未確認」と明記する。**

2. 続けて **`e2e-spec` skill** を起動し、遷移マップからシナリオ仕様を起こす。
   - 成果物: 同じ `e2e/plans/$1.md` の「シナリオ仕様」セクション（Markdown plan）。
   - 7網羅クラス（happy path / validation error / permission差分 / 戻る操作 / 再読込 / 途中離脱 / ネットワーク遅延）を最低1件ずつ。
   - 各シナリオに「開始状態・操作・中間観測点・終了条件・除外事項」を必須で持たせる。

### ▌承認ゲート①（plan レビュー）

`e2e/plans/$1.md` を要約提示し、**ユーザーのレビュー・修正・承認を待つ**。

> 「この plan で Step3（コード生成）に進んでよいか確認してください。修正があれば指示してください。」

承認が出るまで Step3 に進まない。

### Step3（承認後）

3. **`e2e-codegen` skill** を起動し、承認済み plan を Playwright spec へ変換する。
   - 成果物: `e2e/tests/$1.spec.ts`。
   - ロケータは role/text/testid 優先、CSS/XPath は最後の手段。非同期は web-first assertion で待つ。
   - 視覚差分が重要なシナリオには `toHaveScreenshot()` 併用候補をコメントで提案。

### Step4

4. **`e2e-run` skill** を起動し、生成した spec を実行して証跡を収集する。
   - `npx playwright test e2e/tests/$1.spec.ts` を実行。
   - 失敗を6分類（ロケータ破損 / 待機不足 / 前提データ不整合 / 期待値誤り / 視覚baseline未作成 / 環境依存）。
   - 成果物: `e2e/reports/$1-<YYYYMMDD-HHmm>.md`（失敗分類表 + trace/video/screenshot へのパス）。
   - **VRT baseline の初回未生成は不具合扱いにしない。**

### ▌承認ゲート②（修正方針）

失敗分類表を提示し、**修正方針をユーザーに承認させてから**最小差分で修正する。healer を暴走させない。

> 「失敗の分類はこの通りです。どの修正を適用してよいか確認してください。」

## 注意

- セットアップ未了（`playwright.config.ts` や `e2e/` が無い）の場合、`e2e-codegen` / `e2e-run` skill が `${CLAUDE_PLUGIN_ROOT}/scaffold/` から雛形をコピーする手順を案内する。
- Step5（漏れ分析の抽象化・prompt昇格）はこのワークフローの範囲外（手動）。`e2e/reports/` の蓄積を見て手動で行う。
