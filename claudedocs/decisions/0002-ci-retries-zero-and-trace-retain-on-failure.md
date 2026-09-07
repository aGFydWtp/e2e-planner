# 2. scaffold の retries を CI でも 0、trace を retain-on-failure にする

Date: 2026-09-07
Deciders: Haruki Eguchi（ユーザー）/ Claude Code `/dev`

## Status

Accepted

## Context and Problem Statement

scaffold の `playwright.config.ts` は従来 `retries: CI ? 2 : 0`、`trace: 'on-first-retry'` という
Playwright 公式テンプレートに近い既定値だった。今回、scaffold を CI（Azure Pipelines を想定。
`TF_BUILD` 判定・JUnit reporter）に載せやすい形へ変更するにあたり、retry と trace の既定値を
どうするか決める必要があった。

この判断は e2e-run の Step4（失敗の機械分類と flaky 診断）および、破壊的シナリオの
runId ベースの後始末設計と直接干渉する。

## Considered Options

- **旧既定の維持**: CI で `retries: 2`、`trace: 'on-first-retry'`
- **retries 0 + retain-on-failure**: `retries: Number(process.env.E2E_RETRIES ?? 0)`、
  `trace: process.env.E2E_TRACE ?? 'retain-on-failure'`（video も同様）。env で上書き可

## Decision Outcome

選んだのは **retries 0 + retain-on-failure**。

理由:

- retry は flaky を隠す。JUnit 上は pass として報告されるため、CI の結果だけを見る運用では
  不安定なテストが検知されないまま蓄積する。本プラグインでは flaky は e2e-run Step4 の
  「無修正で 3 回再評価」で診断する設計なので、Playwright 側の自動 retry と役割が重複し、
  かつ診断を妨げる
- 破壊的シナリオは runId 付きのデータを作って回収する。自動 retry が走ると初回試行分が
  別 runId の残骸として残り、teardown の対象から外れる
- `on-first-retry` は retries 0 だと永久に trace が採れない。失敗時の trace を確実に残すには
  `retain-on-failure` が必要
- `E2E_RETRIES` / `E2E_TRACE` で上書きできるので、retry を必要とするプロジェクトは
  env だけで旧挙動に戻せる

### Consequences

- Good, because CI の pass/fail が flaky を含めて正直になり、Step4 の診断フローと整合する
- Good, because 破壊的シナリオの残骸が runId 単位で追跡でき、teardown の範囲が閉じる
- Good, because 失敗時に必ず trace が残り、plan の観測点 ID（`test.step`）と突き合わせられる
- Bad, because 環境起因の一時的な失敗（ネットワーク等）でも即 fail になる。retry で
  吸収したい場合は `E2E_RETRIES` を明示する運用コストを負う
- Bad, because `retain-on-failure` は失敗ごとに trace / video を保存するため、失敗が多い
  段階ではアーティファクト量が増える

## Links

- 関連 plan: `claudedocs/plans/e2e-hardening-plan.md`（Data Shape「scaffold 設定値」）
- 関連 spec: なし（`.kiro/` 未使用）
