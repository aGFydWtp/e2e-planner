# 4. 対象アプリ固有の実装・CI/インフラ計装・主観的スコアをスコープ外とする

Date: 2026-09-07
Deciders: Haruki Eguchi（ユーザー）/ Claude Code `/dev`

## Status

Accepted

## Context and Problem Statement

Playwright E2E 運用の一般知見には、データの DB 直投入・Factory・スキーマ検証による precheck・
リリース軸での project 分割・impact map による影響範囲解決・CI パイプライン定義・
インフラ側の計装・テスト成熟度の採点など、多くの推奨事項が含まれる。今回の取り込みで
「何を採らないか」を明示しておかないと、後続の改善で汎用プラグインの前提が崩れる恐れがあった。

e2e-planner は対象 Web アプリに依存しない汎用プラグインで、DB / API / CI の実体を持たない。

## Considered Options

- **知見を網羅的に取り込む**: DB 直投入・Factory・precheck の実装、release 軸の project、
  impact-map resolver、CI yaml、インフラ計装、成熟度スコアまで scaffold / skill に含める
- **プラグインが実体を持てるものだけ取り込み、残りを明示的にスコープ外にする**

## Decision Outcome

選んだのは **プラグインが実体を持てるものだけ取り込み、残りを明示的にスコープ外にする**。

スコープ外と決めたもの:

- **DB 直投入 / Factory / スキーマ検証による precheck の実装**: 対象アプリのスキーマ・ORM・
  API に依存し、汎用プラグインは実体を持てない。plan の `data.setup=db|api` と
  `e2e/fixtures/<feature>.fixture.ts` の入口までを生成し、投入処理はプロジェクト側に委ねる。
  precheck は plan の必須項目「開始状態の確認（PRE）」と `[precheck]` 失敗の機械分類までに留める
- **release 軸での project 分割**: リリース単位の運用はプロジェクトごとに異なる。project は
  auth mode × light/heavy の分岐だけに留める
- **impact-map resolver**: e2e-map / e2e-record に任意節「実装対応（impact map の種）」を
  残すだけで、変更ファイルから影響シナリオを解決する仕組みは作らない
- **CI yaml / インフラ計装**: `playwright.config.ts` を CI に載せやすい形（`TF_BUILD` 判定・
  JUnit・`E2E_STORAGE_STATE`・worker 別アカウント fixture）にするまでで、パイプライン定義や
  監視側の計装は書かない
- **主観的な成熟度スコア**: audit は grep で確定できる件数（メタ未付与・`@guessed` 残数・
  heavy 件数・spec 健全性表）のみ集計し、採点は入れない

理由: いずれも対象アプリまたは運用組織に依存し、汎用物として出荷すると「動かない既定値」か
「特定スタックの前提」になる。スコープ外にして候補として PR に記すほうが、後続で必要になった
プロジェクトが自分の前提で足せる。

### Consequences

- Good, because プラグインが対象アプリ非依存のまま保たれ、scaffold を入れるだけで動く既定
  （UI 経路・UI teardown）が残る
- Good, because audit の出力が再現可能な件数だけになり、人による採点のぶれが混入しない
- Bad, because `api` / `db` 経路を選んだプロジェクトは fixture の実体を自前で書く必要があり、
  plan で経路を確定してもすぐには走らない
- Bad, because impact map の「種」だけを残すため、変更に対する影響シナリオの特定は当面
  人の作業になる

## Links

- 関連 plan: `claudedocs/plans/e2e-hardening-plan.md`（Boundaries / Scope）
- 関連 spec: なし（`.kiro/` 未使用）
- 関連 ADR: [1. データ準備経路と実行制御軸の plan メタ化](0001-plan-data-and-exec-metadata-decided-at-step2.md)、
  [2. retries 0 と retain-on-failure](0002-ci-retries-zero-and-trace-retain-on-failure.md)
