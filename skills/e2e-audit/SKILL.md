---
name: e2e-audit
description: E2Eワークフローの横断 audit。e2e/plans/ tests/ reports/ を毎回スキャンして、feature をまたいだ coverage の不足（網羅クラスの穴・ロールの穴・未検証経路・承認待ちシナリオ）と spec 健全性（grep で確定できる規約違反の件数のみ・段階評価なし）を算出し、e2e/index.md（横断スナップショット）を生成（上書き）する。維持台帳は持たず、毎回派生再生成する。テストは再実行しない（reports の feature ごと最新を last_run/last_status としてパースするだけ）。e2e-run の Coverage Matrix（1 feature 内）を「プロジェクト横断」へ拡張したもの。
when_to_use: スイート全体の coverage 不足を俯瞰したいとき、feature 追加後に横断台帳 e2e/index.md を更新したいとき、e2e-plan オーケストレーターの Step4（run）後の自動再生成として。
argument-hint: （引数不要。e2e/ 配下のスイート全体をスキャンする）
---

# 横断 audit（e2e-audit）

`e2e/index.md` を**派生スナップショットとして毎回再生成**し、feature をまたいだ coverage の不足を可視化する。**維持台帳（coverage.yml 等）は持たない**——同じ事実を複数箇所に持って同期させると drift するため、plan を正本とし、index.md は毎回スキャンで作り直す（このプラグインの一貫方針「plan 正本・spec はタグで指す・run/audit は突合するだけ」の延長）。

e2e-run の Coverage Matrix が**1 feature 内**（当該 plan↔spec↔実行結果）の突合だったのに対し、e2e-audit は**スイート全体**を横断して「どの網羅クラス／ロール／経路がまだ検証されていないか」を出す。

前提: `e2e/plans/` に1つ以上の plan があること（無ければ「対象 plan が無い」と報告して終わる）。

## やること（スキャンのみ・テストは再実行しない）

**重要: e2e-audit はテストを実行しない。** 既にある成果物（plan / spec / report）を読んで突合・集計するだけ。実行と残差分類は e2e-run（Step4）、収束ループは e2e-codegen（Step3）の責務。audit は「いま手元にある証跡から横断の穴を出す」ことに徹する。

3つの情報源をスキャンする:

1. **`e2e/plans/*.md`（正本）** — 各 plan から次を抽出する:
   - feature 名（ファイル名の slug ＝ `<slug>.md` の `<slug>`。表示名は `# E2E Plan: <表示名>` の見出し）。
   - 各シナリオの `coverage` メタ（`class` / `role` / `status` / `exec`）。`exec` は feature 一覧の `heavy` 件数列にだけ使い、**gap 集計には使わない**（`heavy` は穴ではない）。`data` 行（`setup` / `own` / `teardown`）は**集計しない**。旧書式の plan は3分岐で扱う: **`coverage` 行が無い** → 「メタ未付与」として既存どおり優先 gap に挙げる（e2e-spec へ差し戻す）／**`exec` だけ無い** → `light` とみなして数え、gap にしない／**`data` だけ無い** → 備考「メタ未付与の plan」に列挙するだけ（gap にしない）。
   - 遷移マップの「未確認・要レビュー」セクションの項目。
   - 必須網羅クラスの「該当なし（理由）」明記（gap ではなく意図的不在として扱う）。
2. **`e2e/tests/*.spec.ts`** — 各 `test()` の `[S<n> / map#<m>]` タイトルタグと `tag: ['@feature:<slug>', '@class:<slug>', '@role:<slug>']`（`exec=heavy` なら `@heavy` も）を機械的に拾い、plan の `coverage`（class/role/exec）と突合する。**plan にあるが対応する spec タグが無い／spec にあるが plan に無い**もの、plan の `exec=heavy` と spec の `@heavy` が食い違うものは「未突合」として記録する（捏造しない）。併せて `e2e/pages/*.page.ts` を読み、下記「spec 健全性（静的チェック）」の grep 対象にする。
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

## spec 健全性（静的チェック）

coverage 突合とは別に、**grep で確定できる規約違反だけ**を feature ごとに数える。人が spec を手直しした後の規約逸脱（e2e-codegen の待機戦略・ロケータ規約）を検出する唯一の場所で、テストは実行しない。対象は `e2e/tests/<feature>.spec.ts` と `e2e/pages/<feature>.page.ts`（無ければ tests だけ）。**数字だけを出し、段階評価・主観スコア・成熟度ラベルは付けない**（risk を主観 drift として退けた e2e-spec の方針と同じ）。

| 項目 | grep パターン | 意味 |
|------|---------------|------|
| `waitForTimeout` | `waitForTimeout(` | 固定 sleep。state-based wait に置換すべき |
| `networkidle` | `waitForLoadState('networkidle')` | 不安定な待機。ロード完了ゲート（ランドマーク assert）に置換すべき |
| `catch-swallow` | `.catch(() => {})` | 失敗の握り潰し |
| `test.skip` | `test.skip(` | 眠らせたテスト（plan で `excluded` にすべき） |
| `@guessed` | `// @guessed` | 収束しなかった残差の行数 |
| `expect(await` | `expect(await ` | 同期 read＋静的 expect。web-first matcher に置換すべき |
| `page.locator` | `page.locator('` | 純 CSS ロケータの件数（role/text/testid 優先の規約。生の件数であり、data-testid 属性セレクタも含む） |
| `PRE 無し` | `test(` の数 − `S<n>-PRE` を含む `test.step(` を持つ test の数 | 開始状態の確認（precheck）step が無い test 数（tests のみ）。1 test に `PRE` は1つという codegen 規約を前提にした近似値（複数書かれていると相殺されうる） |

index.md に「spec 健全性」表（feature × 項目の件数）を出し、件数が 1 以上の項目は優先 gap 一覧に種別 **「規約違反」** で1行ずつ足す（出所は `spec: <feature>.spec.ts` / `pages: <feature>.page.ts`）。旧規約で書かれた spec（`test.step` を使っていない等）も同じ数字で出す——直すかどうかは人が判断する。

## 成果物: `e2e/index.md`（上書き生成）

`e2e/index.md` を**毎回まるごと上書き**する（手書き追記しない・差分マージしない）。git diff で coverage の増減が追える。

```markdown
# E2E Coverage Index

> 生成日時: <YYYY-MM-DD HH:mm> / 生成: /e2e-audit（plans/ tests/ reports/ の派生スナップショット・手書き不可）
> 対象: <N> features / active シナリオ <M> 件 / 優先 gap <K> 件

## feature 一覧

| feature | plan | spec | active | heavy | needs_review | excluded | covered_elsewhere | last_run | last_status |
|---------|------|------|--------|-------|--------------|----------|-------------------|----------|-------------|
| login | ✓ | ✓ | 7 | 0 | 0 | 1 | 0 | 2026-06-26 14:30 | passed |
| tasks | ✓ | ✓ | 4 | 1 | 1 | 0 | 1 | 2026-06-25 09:10 | failed |
| billing | ✓ | — | 0 | 0 | 3 | 0 | 0 | — | 未実行 |

- `plan`/`spec` 列は当該成果物の有無。`spec=—` は plan はあるが未コード化（Step3 未了）。
- カウント列は plan の `coverage: status` の集計。`heavy` 列は active のうち `exec=heavy` の件数（実行制御の参考値。gap には数えない）。

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

## spec 健全性（静的チェック）

grep で確定できる規約違反の件数（feature × 項目）。数字のみ・段階評価なし。`spec=—` の feature は行を出さない。

| feature | waitForTimeout | networkidle | catch-swallow | test.skip | @guessed | expect(await | page.locator | PRE 無し |
|---------|----------------|-------------|---------------|-----------|----------|--------------|--------------|----------|
| login | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 |
| tasks | 1 | 0 | 1 | 0 | 2 | 1 | 5 | 3 |

## 優先 gap 一覧

横断で埋めるべき不足を1か所に集約する（class/role の穴＋plans の「未確認・要レビュー」＋`needs_review` シナリオ＋未突合＋規約違反）。優先度は「コア機能の active 不在 > needs_review 滞留 > 未突合 > 規約違反 > 周辺の穴」で並べる。

| 優先 | feature | 種別 | 内容 | 出所 |
|------|---------|------|------|------|
| 高 | billing | class 穴 | active が1件も無い（全 needs_review）。承認して active 化が必要 | plan: billing.md status |
| 高 | tasks | needs_review | S5「招待メール送信」が承認待ちで滞留 | plan: tasks.md S5 |
| 中 | tasks | class 穴 | `permission` / `reload` に active シナリオが無い | class gap |
| 中 | tasks | role 穴 | `admin` ロールの検証が無い | role gap |
| 中 | login | 未確認 | 「管理者ロール時の追加メニュー(#5)」が遷移マップで未確認 | plan: login.md 未確認 |
| 低 | tasks | 未突合 | spec に `[S9 / map#-]` があるが plan に S9 が無い | spec タグ |
| 低 | tasks | 規約違反 | `waitForTimeout(` 1件 / `.catch(() => {})` 1件 / `expect(await ` 1件 / `S<n>-PRE` step 無し 3 test | spec: tasks.spec.ts |

## 備考

- `covered_elsewhere` の対応関係: <例: tasks の network は login で検証済み>
- メタ未付与の plan: <`coverage` 行が無く集計から漏れた plan、`exec` / `data` 行が無い旧書式の plan があれば列挙し、e2e-spec へ差し戻す>
```

## 単独実行と自動実行

- **単独 `/e2e-audit`**: feature を足さずにスイート全体を再点検したいとき手動で実行する。
- **`/e2e-plan` の Step4（run）後に自動実行**される（オーケストレーター参照）。新しい feature の plan/spec/report が出揃った直後に index.md を再生成する。**run が失敗してもスキップせず実行**し、その feature の `last_status=failed` を反映する（派生物の更新に承認ゲートは挟まない）。

## 守るべき原則

- **テストを実行しない。** 既存成果物の突合・集計に徹する（実行は e2e-run）。
- **index.md は毎回まるごと上書き。** 手書き追記・部分マージをしない（drift の元）。常に plans/tests/reports からの派生で再生成する。
- **未突合・穴は隠さず明記する。** 突合できない行を空欄や推測で埋めない。「漏れの可視化」が目的。
- **正本は plan。** plan の `coverage` メタを信頼の基準にし、spec タグ・report はそれと突合する素材として扱う。
- **spec 健全性は件数だけ。** grep で確定できる項目のみ数え、段階評価・主観スコア・成熟度ラベルを付けない。`exec` / `data` は gap にしない。
