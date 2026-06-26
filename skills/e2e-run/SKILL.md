---
name: e2e-run
description: E2Eワークフロー Step4。Step3（収束ループ）が通したスイートをフレッシュに1回実行して trace/video/screenshot を収集し、収束しなかった残差（残 @guessed の失敗）だけを6分類（ロケータ破損/待機不足/前提データ不整合/期待値誤り/視覚baseline未作成/環境依存）に整理する。plan↔spec↔結果の Coverage Matrix を作り、重要シナリオは同一条件・無修正で3回の flaky 再評価をする。実行修正ループは持たない（修正は Step3 の収束ループが担う）。残差の扱い方針だけを承認後に確定する。
when_to_use: e2e-codegen の収束ループが済んだ後、確定版スイートの証跡収集・残差分類・Coverage Matrix・flaky 再評価をするとき。e2e-plan オーケストレーターの Step4 として。
argument-hint: <feature-name>
---

# Step4: 証跡収集・残差分類・Coverage Matrix・flaky 再評価（e2e-run）

Step3（収束ループ）が**通せるところまで通したスイート**を受け取り、**フレッシュに1回実行して証跡を残し**、収束しなかった**残差だけ**を分類する。**実行修正ループはここには無い**——「実走しながら直す」のは Step3 の収束ループの仕事で、Step4 は確定版の証跡化・残差の整理・横断突合・安定性確認に純化する。"何が壊れたか" の分類は残差に対してのみ行い、闇雲な self-heal をしない。

前提: `e2e/tests/<feature>.spec.ts` が**収束ループを経て**存在し、`playwright.config.ts` が設定済みであること。未セットアップ／未収束なら `e2e-codegen`（Step3）へ戻す。

## 認証は Step3 で確立済み（ここでは原則ノータスク）

依存インストール・scaffold 配置・非シークレット `.env` 値、そして **state 採取・資格情報投入（`E2E_AUTH_MODE` 分岐の CDP/form 手順）は、すべて Step3 の「収束ループ入口」で済んでいる**（旧 Step4 の人間タスクは Step3 へ前倒し移設した）。Step4 が認証に触れるのは次の例外だけ:

- **`prebuilt-state` の state が実行までに失効していた場合のみ**、Step3「収束ループ（認証確立）」の CDP 採取手順（`scripts/save-state-cdp.ts` / `localhost:9222`）を**再実行して取り直す**。手順の本体は e2e-codegen 側にあるのでそちらを参照する（ここでは重複させない）。失効は残差の「前提データ不整合」としても現れるので、分類とあわせて見る。
- それ以外（`form` 投入済み・`none`）は**何も依頼せず即実行**。

## 実行

**収束後の確定版スイートを、証跡採取のためにフレッシュに1回**実行する。

```bash
pnpm exec playwright test e2e/tests/<feature>.spec.ts
```

設定（scaffold の `playwright.config.ts`）により、trace は on-first-retry、video は retain-on-failure、screenshot は only-on-failure で収集される。HTML レポートは `e2e/.report`、生の証跡は `e2e/.artifacts`。証跡は**収束後の確定版で取る**ことに意味がある（Step3 の途中バージョンではなく、最終形の trace/video を残す）。

## 残差の特定（残 `@guessed` の失敗だけを分類対象にする）

**Step3 の収束ループで green になったテストは確定済み**で、分類対象ではない。Step4 が分類するのは**残差＝収束しなかった失敗テストだけ**。残差は次で機械的に拾う:

- **失敗した test のうち、ソースに `// @guessed` が残っている**ものが残差（収束ループが (a) 確定で外せず、(b) N 尽き／バックストップ到達で残した未収束の証）。`grep -n "@guessed" e2e/tests/<feature>.spec.ts` で残存箇所を当て、失敗 test と突き合わせる。
- **`@guessed` が1つも残っていないのに失敗している** test があれば、それは「収束済みのはずが再現性なく落ちた」signal ＝ flaky の疑い。下記 flaky 再評価へ回す（残差分類とは扱いを分ける）。

> Step3 が (c) 途中離脱で plan・e2e-map／seed・env へ差し戻したシナリオは、そもそも spec 側で未収束のまま戻っている。Step4 はそれらを残差として拾いつつ「修正先＝plan/map か seed/env」を分類で明示する（spec を直すのではない）。

## 残差の6分類

残差（残 `@guessed` の失敗 test）を必ず次のいずれかに分類する（複数該当時は主因＋副次を記す）:

| 分類 | 典型症状 | 修正先 |
|------|----------|--------|
| ロケータ破損 | 要素が見つからない / DOM変更で壊れた／**遷移途中の導線リンクが今の画面に無い** | **Step3 収束ループ（generator/spec を実画面探索で再収束）**。role/text/testid へ。**途中遷移は goto で飛ばさず実画面探索で動線再発見**。Step4 でその場パッチしない（下記） |
| 待機不足 | submit直後にassert / AJAX前に次操作／**遷移を伴うクリック直後に遷移先要素を触り遷移前ページのまま落ちる** | **Step3 収束ループ**（**遷移先 URL/要素を1行 assert してから次操作**。`networkidle` は使わない） |
| 前提データ不整合 | ログイン状態・権限・DB状態が違う／**storageState 失効・セッション切れ（setup未実行・state期限切れ・サイト側ログアウト）** | seed / environment / auth.setup（prompt では直さない） |
| 期待値誤り | assertion の期待値が仕様と不一致 | spec または plan（仕様の見直し） |
| 視覚baseline未作成 | toHaveScreenshot 初回で baseline 無し | **不具合ではない**。baseline を生成して確定 |
| 環境依存 | タイムゾーン・ロケール・CIのみ失敗 | environment / config |

> **VRT baseline の初回未生成は不具合扱いにしない。** `pnpm exec playwright test --update-snapshots` で baseline を作り、差分の妥当性を人間が確認してから確定する。

> **teardown の「削除クリック警告」は失敗ではないが、「消えたこと」の検証アサート失敗は本物の失敗。** 破壊的・自己完結シナリオの後始末（afterEach/afterAll）で、削除クリック self は best-effort なので `[teardown] cleanup failed ...` の警告に留まり、これは6分類の「失敗」に数えない。**ただし e2e-codegen の規約により、後始末の末尾には「作成名がもう存在しない」ことを検証する `expect(...).toHaveCount(0)` が必ず入る。これが落ちたら『teardown が実機で発火していない（green なのに残骸が蓄積している）』という本物の失敗**なので、「前提データ不整合」ではなく**削除 UI 経路の「ロケータ破損」**として扱い、その削除フローを直す。残骸が出ても作成データは timestamp 付きユニーク名なので、ログの名前で特定して手動掃除すればよい。
>
> **teardown が実機で確立する（検証アサートが安定して green になる）まで、破壊的シナリオを本番類似環境で回さない。** 捨てプロジェクト/捨て環境で teardown 発火を確認してから本番へ向ける（e2e-codegen 参照）。

## Coverage Matrix（plan↔spec↔実行結果の突合）

残差分類の前に、**何を検証できていて何が欠けているか**を Coverage Matrix で一覧化する。収束済み（Step3 で green 確定）と残差を区別して見られるようにする。3つの情報源を突合して作る:

1. **plan**（`e2e/plans/<feature>.md`）— シナリオ ID（S1..Sn）と各シナリオの遷移マップ参照（`map#<m>`）・中間観測点・終了条件。
2. **spec 内タグ**（`e2e/tests/<feature>.spec.ts`）— 各 `test()` タイトル/近接コメントの `[S<n> / map#<m>]` を機械的に逆引きして、シナリオと test を対応づける。
3. **実行結果** — 各 test の pass/fail と証跡パス。

| 遷移map # | scenario | test | 中間観測点assert | 終了条件assert | 証跡 | 結果 |
|-----------|----------|------|------------------|----------------|------|------|
| #2 | S1 ログイン成功 | `logs in with valid credentials` | ✓ ローディング表示 | ✓ /dashboard 遷移 | trace.zip | pass |
| #4 | S2 検証エラー | `shows validation error...` | ✓ API未呼出 | ✓ 検証メッセージ | - | pass |
| #5 | S8 権限差分 | （未突合） | 未突合 | 未突合 | - | 未突合 |

- **突合できなかった行は捏造せず「未突合」と明記する。** plan にあるが対応する spec タグが見つからない（=未実装/タグ漏れ）、逆に spec にあるが plan に対応シナリオが無い、実行されず結果が無い——いずれも該当セルを `未突合` とし、空欄や推測値で埋めない。未突合は「漏れの可視化」が目的なので、隠さず残す。
- 中間観測点/終了条件の `assert` 列は、plan の各観測点に対応する assertion が spec に**実在するか**を見る（`✓`=active assert あり / `コメントのみ` / `無し`）。
- spec に `[S<n> / map#<m>]` タグが無くて逆引きできない場合は、その旨を Coverage Matrix の冒頭に記し、e2e-codegen のタグ付け規約に差し戻す。

## 成果物

`e2e/reports/<feature>-<YYYYMMDD-HHmm>.md` に Coverage Matrix・残差分類表・証跡パスを書く。

```markdown
# E2E 実行レポート: <feature>

> 実行日時: <YYYY-MM-DD HH:mm> / 結果: <N passed / M failed>

## Coverage Matrix

| 遷移map # | scenario | test | 中間観測点assert | 終了条件assert | 証跡 | 結果 |
|-----------|----------|------|------------------|----------------|------|------|
| #2 | S1 ログイン成功 | `logs in with valid credentials` | ✓ ローディング | ✓ /dashboard | trace.zip | pass |
| #5 | S8 権限差分 | （未突合） | 未突合 | 未突合 | - | 未突合 |

## 残差分類（残 @guessed の失敗のみ・収束済みは対象外）

| test | 分類 | 根拠（trace/video/screenshot） | 提案する処遇 | 差し戻し先 |
|------|------|--------------------------------|--------------|------------|
| S5 再読込 | 待機不足 | e2e/.artifacts/.../trace.zip | Step3 収束ループへ戻す（遷移 assert で潰す） | Step3 / EPT |
| S8 権限差分 | 前提データ不整合 | state 失効 | state 再採取 | seed / env |
| S3 視覚 | 視覚baseline未作成 | （baseline無し） | --update-snapshots で生成（不具合ではない） | baseline |

## flaky 再評価メモ（無修正3回・収束ループの N=3 とは別物）
- 同一 seed・同一データ・同一環境で**無修正のまま**再実行した安定性: <N/3 回 pass>
- 繰り返す残差分類: <...>
```

## 承認ゲート②（残差の扱い方針）

**ここは「残差をどう扱うか」の方針承認に純化されている**——Step4 は spec を直して実走し直すループを持たない（spec を実画面探索で直すのは Step3 収束ループの仕事）。**全テストが Step3 で (a) 収束していれば残差はゼロで、このゲートは実質スルー**。残差がある場合だけ、その**処遇方針**をユーザーに諮る:

- **EPT／プロンプト改善行き**（Step3 の収束ループが (b) N 尽きで通せなかった＝ロケータ・待機の生成方針が弱い残差）。spec を場当たりで直さず、`claudedocs/ept/` の評価ログに残して codegen のプロンプト/方針改善へ回す。
- **plan・e2e-map へ差し戻し**（Step3 が (c) 途中離脱で「計画した動線／要素が実画面に存在しない」と判定した残差＝plan/map の漏れ）。
- **seed・env へ差し戻し**（state 失効・seed 不整合の前提データ問題）。

いずれも**この場で spec を最小修正して通そうとしない**（それは Step3 へ戻す判断）。承認されるのは「どこへ差し戻す／何に記録するか」であって、Step4 内での修正実行ではない。healer に plan 由来の漏れまで背負わせない原則は維持する。

- **遷移を伴うクリック直後の落ち（待機不足）／途中遷移のリンクが今の画面に無い（ロケータ破損）** といった残差は、本来 Step3 収束ループが実画面探索で潰すべきもの。Step4 に残っているなら **Step3 へ戻して収束させる**（`networkidle` 待ちや推測 goto で無理に通さない方針は e2e-codegen に揃える）。Step4 でその場の spec パッチをしないこと。

## flaky 再評価（推奨）— 収束ループの N=3 とは別物

重要シナリオは**同一 seed・同一データ・同一環境で、無修正のまま3回**実行し、「何回中何回通るか・どこで落ちるか・同じ分類に収まるか」を見る（flaky 検出）。

> **これは Step3 収束ループの「N=3」とは別物。混同しない。** 収束ループの N=3 は**「通すために spec を直す」反復**（修正を挟む）で、Step3 が所有する。**Step4 の flaky 再評価は「通った重要シナリオの安定性確認」で、無修正で3回回す**——直すための反復ではない。収束ループで直したテストを「3回流したから安定」と読み替えない。安定性は無修正の再実行で測る。

## feature 横断の確認は `/e2e-audit`

この Coverage Matrix は**1 feature 内**（当該 plan↔spec↔実行結果）の突合に閉じている。**feature をまたいだスイート全体の不足（class/role の穴・未検証経路・`needs_review` の滞留）を見るには `/e2e-audit` を実行する**。`/e2e-audit` は `plans/ tests/ reports/` をスキャンして `e2e/index.md`（横断スナップショット）を再生成する（`/e2e-plan` の Step4 後に自動実行される。テストは再実行しない）。
