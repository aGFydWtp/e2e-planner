---
name: e2e-audit
description: E2Eワークフローの横断 audit。e2e/plans/ tests/ reports/ を毎回スキャンして、feature をまたいだ coverage の不足（網羅クラスの穴・ロールの穴・未検証経路・承認待ちシナリオ）を算出し、e2e/index.md（横断スナップショット）を生成（上書き）する。維持台帳は持たず、毎回派生再生成する。テストは再実行しない（reports の feature ごと最新を last_run/last_status としてパースするだけ）。e2e-run の Coverage Matrix（1 feature 内）を「プロジェクト横断」へ拡張したもの。
when_to_use: スイート全体の coverage 不足を俯瞰したいとき、feature 追加後に横断台帳 e2e/index.md を更新したいとき、e2e-plan オーケストレーターの Step4（run）後の自動再生成として。
argument-hint: （引数不要。e2e/ 配下のスイート全体をスキャンする）
---

# 横断 audit（e2e-audit）

`e2e/index.md` を**派生スナップショットとして毎回再生成**し、feature をまたいだ coverage の不足を可視化する。**維持台帳（coverage.yml 等）は持たない**——同じ事実を複数箇所に持って同期させると drift するため、plan を正本とし、index.md は毎回スキャンで作り直す（このプラグインの一貫方針「plan 正本・spec はタグで指す・run/audit は突合するだけ」の延長）。

e2e-run の Coverage Matrix が**1 feature 内**（当該 plan↔spec↔実行結果）の突合だったのに対し、e2e-audit は**スイート全体**を横断して「どの網羅クラス／ロール／経路がまだ検証されていないか」を出す。

前提: `e2e/plans/` に1つ以上の plan があること（無ければ「対象 plan が無い」と報告して終わる）。

## やること（スキャンのみ・テストは再実行しない）

**重要: e2e-audit はテストを実行しない。** 既にある成果物（plan / spec / report）を読んで突合・集計するだけ。実行と失敗分類は e2e-run の責務。audit は「いま手元にある証跡から横断の穴を出す」ことに徹する。

3つの情報源をスキャンする:

1. **`e2e/plans/*.md`（正本）** — 各 plan から次を抽出する:
   - feature 名（ファイル名の slug ＝ `<slug>.md` の `<slug>`。表示名は `# E2E Plan: <表示名>` の見出し）。
   - 各シナリオの `coverage` メタ（`class` / `role` / `status`）。`coverage` 行が無い旧 plan は「メタ未付与」として優先 gap に挙げる（e2e-spec の `coverage` メタ付与に差し戻す）。
   - 遷移マップの「未確認・要レビュー」セクションの項目。
   - 必須網羅クラスの「該当なし（理由）」明記（gap ではなく意図的不在として扱う）。
2. **`e2e/tests/*.spec.ts`** — 各 `test()` の `[S<n> / map#<m>]` タイトルタグと `tag: ['@feature:<slug>', '@class:<slug>', '@role:<slug>']` を機械的に拾い、plan の `coverage`（class/role）と突合する。**plan にあるが対応する spec タグが無い／spec にあるが plan に無い**ものは「未突合」として記録する（捏造しない）。
3. **`e2e/reports/<feature>-<YYYYMMDD-HHmm>.md`** — **feature ごとにファイル名の日時が最新の1本だけ**を読み、`last_run`（実行日時）と `last_status`（`passed` / `failed` / `mixed` 等）を取り出す。古いレポートは無視する。レポートが無い feature は `last_run=—` / `last_status=未実行`。

## status の数え方（4値）

plan の `coverage: status` を次のように扱う（定義は e2e-spec 参照）:

| status | 充足カウント | gap 集計 |
|--------|--------------|----------|
| `active` | **有効テストとして数える**（spec が存在し実行対象） | 充足側 |
| `excluded` | 数えない | gap ではない（ユーザー明示除外・意図的不在） |
| `needs_review` | **数えない**（承認前・spec 未生成） | **優先 gap 一覧へ**（承認されれば active 化する候補） |
| `covered_elsewhere` | 当該 feature では数えない | gap ではない（別 feature で検証済み・どこでかを併記） |

> 充足判定は「active なシナリオがそのクラス/ロールに最低1件あるか」で見る。`covered_elsewhere` は「他で検証済み」なので当該 feature の穴にはしない（重複回避の意思表示）。`excluded` は意図的不在なので穴にしない。**穴（gap）にするのは「active も covered_elsewhere も excluded も無い＝誰も触れていない」クラス/ロール**と、滞留している `needs_review`。

## 成果物: `e2e/index.md`（上書き生成）

`e2e/index.md` を**毎回まるごと上書き**する（手書き追記しない・差分マージしない）。git diff で coverage の増減が追える。

```markdown
# E2E Coverage Index

> 生成日時: <YYYY-MM-DD HH:mm> / 生成: /e2e-audit（plans/ tests/ reports/ の派生スナップショット・手書き不可）
> 対象: <N> features / active シナリオ <M> 件 / 優先 gap <K> 件

## feature 一覧

| feature | plan | spec | active | needs_review | excluded | covered_elsewhere | last_run | last_status |
|---------|------|------|--------|--------------|----------|-------------------|----------|-------------|
| login | ✓ | ✓ | 7 | 0 | 1 | 0 | 2026-06-26 14:30 | passed |
| tasks | ✓ | ✓ | 4 | 1 | 0 | 1 | 2026-06-25 09:10 | failed |
| billing | ✓ | — | 0 | 3 | 0 | 0 | — | 未実行 |

- `plan`/`spec` 列は当該成果物の有無。`spec=—` は plan はあるが未コード化（Step3 未了）。
- カウント列は plan の `coverage: status` の集計。

## 網羅クラス × feature（class gap）

各セル: `✓`=active で充足 / `R`=needs_review のみ（承認待ち）/ `E`=excluded（意図的不在）/ `→f`=covered_elsewhere（feature f で検証）/ `gap`=誰も触れていない穴 / `—`=該当なし明記。

| feature | happy | validation | permission | back | reload | abandon | network |
|---------|-------|------------|------------|------|--------|---------|---------|
| login | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| tasks | ✓ | ✓ | gap | ✓ | gap | R | →login |
| billing | R | R | gap | gap | gap | gap | gap |

## ロール × feature（role gap）

各セルは「そのロールで active なシナリオが1件以上あるか」。

| feature | guest | user | admin |
|---------|-------|------|-------|
| login | ✓ | ✓ | ✓ |
| tasks | gap | ✓ | gap |
| billing | gap | R | gap |

## 優先 gap 一覧

横断で埋めるべき不足を1か所に集約する（class/role の穴＋plans の「未確認・要レビュー」＋`needs_review` シナリオ＋未突合）。優先度は「コア機能の active 不在 > needs_review 滞留 > 未突合 > 周辺の穴」で並べる。

| 優先 | feature | 種別 | 内容 | 出所 |
|------|---------|------|------|------|
| 高 | billing | class 穴 | active が1件も無い（全 needs_review）。承認して active 化が必要 | plan: billing.md status |
| 高 | tasks | needs_review | S5「招待メール送信」が承認待ちで滞留 | plan: tasks.md S5 |
| 中 | tasks | class 穴 | `permission` / `reload` に active シナリオが無い | class gap |
| 中 | tasks | role 穴 | `admin` ロールの検証が無い | role gap |
| 中 | login | 未確認 | 「管理者ロール時の追加メニュー(#5)」が遷移マップで未確認 | plan: login.md 未確認 |
| 低 | tasks | 未突合 | spec に `[S9 / map#-]` があるが plan に S9 が無い | spec タグ |

## 備考

- `covered_elsewhere` の対応関係: <例: tasks の network は login で検証済み>
- メタ未付与の plan: <`coverage` 行が無く集計から漏れた plan があれば列挙し、e2e-spec へ差し戻す>
```

## 単独実行と自動実行

- **単独 `/e2e-audit`**: feature を足さずにスイート全体を再点検したいとき手動で実行する。
- **`/e2e-plan` の Step4（run）後に自動実行**される（オーケストレーター参照）。新しい feature の plan/spec/report が出揃った直後に index.md を再生成する。**run が失敗してもスキップせず実行**し、その feature の `last_status=failed` を反映する（派生物の更新に承認ゲートは挟まない）。

## 守るべき原則

- **テストを実行しない。** 既存成果物の突合・集計に徹する（実行は e2e-run）。
- **index.md は毎回まるごと上書き。** 手書き追記・部分マージをしない（drift の元）。常に plans/tests/reports からの派生で再生成する。
- **未突合・穴は隠さず明記する。** 突合できない行を空欄や推測で埋めない。「漏れの可視化」が目的。
- **正本は plan。** plan の `coverage` メタを信頼の基準にし、spec タグ・report はそれと突合する素材として扱う。
