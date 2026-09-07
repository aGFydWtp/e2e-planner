# 1. データ準備経路 `data` と実行制御軸 `exec` を plan の必須メタにし Step2 の HITL で確定する

Date: 2026-09-07
Deciders: Haruki Eguchi（ユーザー）/ Claude Code `/dev`

## Status

Accepted

## Context and Problem Statement

e2e-planner は「plan が正本、spec はタグで plan を指し、run/audit は突合するだけ」
「Step2（e2e-spec）が方針を決め Step3（e2e-codegen）は従う」という責務分担で成り立っている。
Playwright E2E 運用の一般知見（並列化・データ独立性・重いシナリオの直列化）を取り込むにあたり、
次の 2 点をどこで・誰が決めるかを定める必要があった。

1. 前提データの準備経路（UI 操作で作るか、テスト用 API / DB / 固定シードで投入するか）と、
   その所有（本シナリオが作るか既存データを読むか）・後始末の経路
2. 実行制御（並列で流せる軽いシナリオか、直列必須の重いシナリオか）

いずれも「作成/削除の UI 自体が検証対象かどうか」「共有データに書き込むか」といった
人の判断を要する要素を含み、生成コードだけからは決められない。

## Considered Options

- **A**: plan の必須フィールド `data: setup= / own= / teardown=` を追加し、Step2 の承認ゲート①
  （破壊的シナリオの一括提示表）に「準備経路 / teardown 経路」列を足して人に確定させる。
  作成/削除 UI 自体が検証対象なら `ui` で確定し質問しない。既定の提案値は Step1 の
  「投入手段」があれば `api`/`db`、無ければ `ui`。無人オーサリングでは `ui` のまま
  除外事項に「データ経路 要確認」と残す。Step3 はこれに従う
- **B**（最小変更案）: plan は変えず、codegen が生成時に「UI 準備が検証対象でない」と
  判断したら都度ユーザーに質問する
- **A'**: 実行制御軸 `exec=light|heavy` を既存 coverage 行の第 4 フィールドにし、
  `heavy` のときだけ spec に `@heavy` を mirror して light/heavy project に接続する
- **B'**: plan には持たず、spec の `@heavy` タグのみで表現する

## Decision Outcome

選んだのは **A + A'**。

理由:

- B は「Step2 が決め Step3 は従う」境界を壊す。承認ゲート①での一括確認を前提とする
  無人オーサリングに乗らず、生成のたびに対話が発生する。plan 正本方針にも反し、
  audit / run から経路が見えない
- B' も plan 正本方針に反し、承認ゲート①で負荷分類（何を直列にするか）をレビューできない
- A / A' は既存の coverage 1 行方式に相乗りするため変更幅が中程度で済み、行を消せば旧書式に
  戻る（audit は未付与を「メタ未付与」として吸収する）

補足の規則（同時に確定）:

- `data.teardown` は「失敗時にも走る回収経路」と定義する。本文の UI 削除が検証対象であっても
  `setup=api` なら `teardown=api`（冪等 DELETE・404 許容）。本文の UI 削除は検証、teardown は
  回収であり役割が違う
- serial 免除（並列で流してよい）の判定は `own=self` かつ `setup∈{api,db}` だけで閉じる。
  他の条件を足して判定を複雑にしない（レビュー 1 周目で確定）
- `own=shared` に書き込む場合は理由を必須とし、並列衝突候補として `exec=heavy` に寄せる
- 既定値は変えない。UI teardown は残す（api/db の実体を持たないプロジェクトでも動くように）
- audit は `exec` / `data` を gap 集計に使わない（未付与は「穴」ではない）。index.md に
  heavy 件数列と grep で確定できる「spec 健全性」表を足すだけ

### Consequences

- Good, because plan を読むだけでデータ経路と負荷分類が分かり、run / audit が同じ語彙で突合できる
- Good, because Step2 / Step3 の責務境界を保ったまま、人の判断が必要な箇所を承認ゲート①の
  1 か所に集約できる
- Good, because `@heavy` の有無だけで `chromium` / `chromium-heavy` project に振り分けられ、
  CI 側で追加の分類作業が要らない
- Bad, because plan 書式に必須フィールドが 2 行増え、e2e-map / e2e-spec / e2e-codegen /
  e2e-run / e2e-audit の 5 skill で語彙を横断して揃える保守コストを負う
- Bad, because `api` / `db` 経路の実体はプロジェクト側に依存するため、plan で `api` と確定しても
  codegen が生成できるのは `e2e/fixtures/<feature>.fixture.ts` の入口までで、投入処理そのものは
  プロジェクトが用意する必要がある（[4. スコープ外の明示](0004-out-of-scope-app-specific-implementations.md) 参照）

## Links

- 関連 plan: `claudedocs/plans/e2e-hardening-plan.md`（Data Shape / Considered Designs）
- 関連 spec: なし（`.kiro/` 未使用）
- 関連 ADR: [3. 生成物の層構成](0003-generated-artifact-layers-spec-pages-fixtures.md)、
  [4. スコープ外の明示](0004-out-of-scope-app-specific-implementations.md)
