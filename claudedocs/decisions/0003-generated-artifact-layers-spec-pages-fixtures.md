# 3. 生成物の層を spec（必須）＋ pages（破壊的 feature で必須）＋ fixtures / selectors（任意）に限定する

Date: 2026-09-07
Deciders: Haruki Eguchi（ユーザー）/ Claude Code `/dev`

## Status

Accepted

## Context and Problem Statement

e2e-codegen が生成するファイルの層構成を決める必要があった。Playwright E2E 運用の一般知見では
Page Object Model（POM）を多層化し、spec からの `page.locator` 直書きを禁止する構成が
広く推奨される。一方、本プラグインの収束ループは spec の**行単位**に `// @guessed` を付け外しし、
e2e-run が `grep @guessed e2e/tests/<feature>.spec.ts` で未確定ロケータを数える設計になっている。

また、破壊的シナリオの teardown は別 context から本文と同じ入口・ロード完了ゲートを使う必要が
あり、これをどこに置くかも決める必要があった。

## Considered Options

- **多層 POM**: pages / components / flows 等に分け、spec からの `page.locator` を全面禁止する
- **spec + pages + fixtures/selectors**: `e2e/tests/<feature>.spec.ts`（test/step/assert・必須）、
  `e2e/pages/<feature>.page.ts`（入口 `open()`・ロード完了ゲート `waitLoaded()`・teardown 入口・
  `rowByName()`・操作。破壊的・自己完結シナリオを含む feature では必須、他は任意）、
  `e2e/fixtures/<feature>.fixture.ts`（api/db 経路の seed/teardown・任意）、
  `e2e/selectors/<feature>.ts`（data-testid がある場合のみ・任意）。spec のロケータ直書きは
  禁止しないが、2 テスト以上で使うロケータ・ゲート・teardown 入口は pages へ寄せる

## Decision Outcome

選んだのは **spec + pages + fixtures/selectors**。

理由:

- 多層 POM と `page.locator` 全面禁止は、`@guessed` の行単位収束ループと衝突する。ロケータが
  全て pages 側に隠れると、spec の grep で未確定箇所を数える運用が成り立たず、収束の判定単位を
  作り直すことになる
- teardown が別 context から本文と同じ `open()` / `waitLoaded()` を使う要件は、pages 1 層で
  満たせる。破壊的 feature で pages を必須にすれば十分で、それ以上の層は生成物の読み手負荷を
  増やすだけになる
- 観測点 ID（`PRE` / `O<k>` / `CP<k>` / `END`）を `test.step` に mirror する設計は spec 側に
  手順の粒度が見える前提であり、spec が薄すぎる構成とは相性が悪い

### Consequences

- Good, because 既存の `@guessed` 収束ループと e2e-run の grep 判定をそのまま維持できる
- Good, because 破壊的シナリオの teardown が本文と同じ入口・ゲートを共有し、別 context からの
  回収が安定する
- Good, because 生成物が最大 4 ファイル / feature に収まり、人がレビューしやすい
- Bad, because spec にロケータ直書きが残るため、画面変更時の修正箇所が pages に一元化されない
  （2 テスト以上で使うものは pages へ寄せる規約で緩和する）
- Bad, because 「破壊的 feature で pages 必須」の判定を codegen が plan の `data` / 破壊的分類から
  読む必要があり、plan のメタが未付与だと pages の要否が決まらない

## Links

- 関連 plan: `claudedocs/plans/e2e-hardening-plan.md`（Organizing Structure）
- 関連 spec: なし（`.kiro/` 未使用）
- 関連 ADR: [1. データ準備経路と実行制御軸の plan メタ化](0001-plan-data-and-exec-metadata-decided-at-step2.md)
