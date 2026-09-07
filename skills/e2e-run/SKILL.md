---
name: e2e-run
description: E2Eワークフロー Step4。Step3（収束ループ）が通したスイートをフレッシュに1回実行して失敗時の trace/video/screenshot を収集し、収束しなかった残差（残 @guessed の失敗）だけを6分類（ロケータ破損/待機不足/前提データ不整合/期待値誤り/視覚baseline未作成/環境依存）に整理する（`[precheck]` 失敗は前提データ不整合へ機械分類し全赤を1件に畳む）。plan↔spec↔結果の Coverage Matrix を `test.step` の `S<n>-CP<k>`/`S<n>-END` で機械突合し、重要シナリオは retries 0 のまま同一条件・無修正で3回（`--repeat-each 3`）の flaky 再評価をする。実行修正ループは持たない（修正は Step3 の収束ループが担う）。残差の扱い方針だけを承認後に確定する。
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
- **CI 前提**: `E2E_AUTH_MODE=prebuilt-state` の state は **CI では採取しない**。Secure File 等のシークレット保管から展開したファイルパスを `E2E_STORAGE_STATE` で渡す（scaffold の config / auth.setup / codegen の teardown はすべてこの env を見る）。CI での失敗が「state 失効」なら、直すのは CI 側の state の更新であって spec ではない。

## 実行

**収束後の確定版スイートを、証跡採取のためにフレッシュに1回**実行する。

```bash
pnpm exec playwright test e2e/tests/<feature>.spec.ts
```

設定（scaffold の `playwright.config.ts`）により、trace は `retain-on-failure`（`E2E_TRACE=on` で常時）、video は `retain-on-failure`（`E2E_VIDEO=on` で常時）、screenshot は `only-on-failure` で収集される。**retries は CI でも `0` が既定**（`E2E_RETRIES` で明示的に上げない限り再試行しない）。HTML レポートは `e2e/.report`（CI では JUnit `e2e/.report/junit.xml` も出る）、生の証跡は `e2e/.artifacts`。証跡は**収束後の確定版で取る**ことに意味がある（Step3 の途中バージョンではなく、最終形の trace/video を残す）。

**失敗時の trace は retries 0 でも必ず残る**（`retain-on-failure` は初回失敗で採る。旧設定の `on-first-retry` は retries 0 だと永久に採れなかった）。**ただし全 pass の場合、trace・video・screenshot は1つも生成されない**（3設定とも失敗時トリガのため）。これは異常ではないので、レポートの証跡欄には**「全 pass のため未取得（設定準拠）」と明記する**（証跡パスを書いたのに実体が無い、という状態にしない）。全 pass 時の証跡が必要なら `E2E_TRACE=on` を付けて実行する。**監査用途（手順ごとの動画・trace を検証記録として残す）の実行では `E2E_TRACE=on E2E_VIDEO=on` で回してよい**（任意。`test.step` の `S<n>-CP<k>` 名が trace に刻まれるので plan の観測点単位で追える）。

### retries 方針（CI でも 0）

**flaky を retry で吸収しない。** retry を有効にすると次の2つが起きる:
- **破壊的テストの初回試行分が残骸になる**——retry は別 worker で spec を再ロードするため `RUN_ID` が変わり、初回に作られたデータは teardown の runId スコープから外れる。
- **flaky 判定が隠れる**——retry で pass したテストは結果集計上 pass に見え（JUnit も pass で集計される）、Step4 の「無修正3回」再評価が測るべき不安定さが見えなくなる。

したがって **CI でも `retries: 0` が既定**。落ちたら直す。「たまに落ちる」テストは retry で誤魔化さず、下記 flaky 再評価（`--repeat-each 3`・無修正）で診断して **Step3 の収束ループへ戻す**（待機戦略の抜けが典型。e2e-codegen の同期 read / 再取得レース / silent success の規約を当てる）。`E2E_RETRIES` を上げるのは、原因が「環境側の一過性障害」と診断で確定し、かつ破壊的テストが含まれない場合に限る（レポートに理由を書く）。

また **flaky 再評価や再実行は `e2e/.report`（HTML）を上書きする**ため、フレッシュ実行の結果は**レポート md 冒頭の結果表を正とする**（後続実行で HTML が差し替わっている旨も注記する）。

## 残差の特定（残 `@guessed` の失敗だけを分類対象にする）

**Step3 の収束ループで green になったテストは確定済み**で、分類対象ではない。Step4 が分類するのは**残差＝収束しなかった失敗テストだけ**。残差は次で機械的に拾う:

- **失敗した test のうち、ソースに `// @guessed` が残っている**ものが残差（収束ループが (a) 確定で外せず、(b) N 尽き／バックストップ到達で残した未収束の証）。`grep -n "@guessed" e2e/tests/<feature>.spec.ts e2e/pages/<feature>.page.ts` で残存箇所を当て、失敗 test と突き合わせる（**pages 側の `@guessed` は、そのロケータを使う全 test に効く**——pages の1行が残差なら、それを使う失敗 test はすべて同じ残差として畳む）。
- **失敗メッセージに `[precheck]` を含むもの**は、`@guessed` の有無に関わらず**「前提データ不整合」へ機械分類する**（下記6分類の該当行）。e2e-codegen の規約で各 test の先頭 step `S<n>-PRE` が前提（ログイン済みランドマーク・前提データ・書き込みスコープ）を `[precheck]` 付きで assert しているため、state 失効・seed 不在は**全テストが同じ `[precheck]` メッセージで赤くなる**。この場合は**同一メッセージの全赤を1件の残差に畳み**、修正先を seed / env / auth.setup と明示する（テストごとに6分類しない）。`[precheck]` を含まない失敗だけを個別分類へ進める。
- **`@guessed` が1つも残っていないのに失敗している** test があれば、それは「収束済みのはずが再現性なく落ちた」signal ＝ flaky の疑い。下記 flaky 再評価へ回す（残差分類とは扱いを分ける）。

> Step3 が (c) 途中離脱で plan・e2e-map／seed・env へ差し戻したシナリオは、そもそも spec 側で未収束のまま戻っている。Step4 はそれらを残差として拾いつつ「修正先＝plan/map か seed/env」を分類で明示する（spec を直すのではない）。

## 残差の6分類

残差（残 `@guessed` の失敗 test）を必ず次のいずれかに分類する（複数該当時は主因＋副次を記す）:

| 分類 | 典型症状 | 修正先 |
|------|----------|--------|
| ロケータ破損 | 要素が見つからない / DOM変更で壊れた／**遷移途中の導線リンクが今の画面に無い** | **Step3 収束ループ（generator/spec を実画面探索で再収束）**。role/text/testid へ。**途中遷移は goto で飛ばさず実画面探索で動線再発見**。Step4 でその場パッチしない（下記） |
| 待機不足 | submit直後にassert / AJAX前に次操作／**遷移を伴うクリック直後に遷移先要素を触り遷移前ページのまま落ちる**／同期 read（`count()`/`innerText()`）＋静的 expect／ソート・フィルタ・再訪後に**再取得前の同一表示**を読む／silent success の消滅だけを待つ | **Step3 収束ループ**（**遷移先 URL/要素を1行 assert してから次操作**。web-first matcher へ置換・再取得完了を先に確定・busy 出現→消滅の2段待ち。`networkidle` は使わない） |
| 前提データ不整合 | ログイン状態・権限・DB状態が違う／**storageState 失効・セッション切れ（setup未実行・state期限切れ・サイト側ログアウト）**／**失敗メッセージに `[precheck]` を含む（`S<n>-PRE` step で落ちた）→ 機械分類。同一メッセージの全赤は1件に畳む** | seed / environment / auth.setup（prompt では直さない） |
| 期待値誤り | assertion の期待値が仕様と不一致 | spec または plan（仕様の見直し） |
| 視覚baseline未作成 | toHaveScreenshot 初回で baseline 無し | **不具合ではない**。baseline を生成して確定 |
| 環境依存 | タイムゾーン・ロケール・CIのみ失敗／**CJK フォント差・OS 差による VRT 差分（baseline は CI と同じ OS・同じブラウザ版で生成する。ローカル macOS の baseline を Linux CI で比較しない）** | environment / config |

> **VRT baseline の初回未生成は不具合扱いにしない。** `pnpm exec playwright test --update-snapshots` で baseline を作り、差分の妥当性を人間が確認してから確定する。

> **teardown の「削除クリック警告」は失敗ではないが、「消えたこと」の検証アサート失敗は本物の失敗。** 破壊的・自己完結シナリオの後始末（afterEach/afterAll）で、削除クリック self は best-effort なので `[teardown] cleanup failed ...` の警告に留まり、これは6分類の「失敗」に数えない。**ただし e2e-codegen の規約により、後始末の末尾には「作成名がもう存在しない」ことを検証する `expect(...).toHaveCount(0)` が必ず入る。これが落ちたら『teardown が実機で発火していない（green なのに残骸が蓄積している）』という本物の失敗**なので、実因で分類してその削除フローを直す（典型は**削除導線の「ロケータ破損」**と、**一覧のロード完了を待たない「待機不足」**の2つ。どちらかを根拠付きで主因に選ぶ）。残骸が出ても作成データは可視プレフィックス＋runId のユニーク名なので、ログの名前で特定して手動掃除すればよい。
>
> **さらに、この検証アサート自体が「自明に通る」ことがある。** 一覧が非同期ロードのとき、削除スキップと消滅検証が同じ未ロード状態で両方素通りする（e2e-codegen のロード完了ゲート参照）。したがって**「全 green ＝ 環境を汚していない」は成り立たない**——下記の**残骸スキャン**で実際に確認する。
>
> **teardown が実機で確立する（検証アサートが安定して green になる）まで、破壊的シナリオを本番類似環境で回さない。** 捨てプロジェクト/捨て環境で teardown 発火を確認してから本番へ向ける（e2e-codegen 参照）。

## Coverage Matrix（plan↔spec↔実行結果の突合）

残差分類の前に、**何を検証できていて何が欠けているか**を Coverage Matrix で一覧化する。収束済み（Step3 で green 確定）と残差を区別して見られるようにする。3つの情報源を突合して作る:

1. **plan**（`e2e/plans/<feature>.md`）— シナリオ ID（S1..Sn）と各シナリオの遷移マップ参照（`map#<m>`）・観測点 ID（`PRE` / `O<k>` / `CP<k>` / `END`）。
2. **spec 内タグと step**（`e2e/tests/<feature>.spec.ts`）— 各 `test()` タイトル/近接コメントの `[S<n> / map#<m>]` を機械的に逆引きして、シナリオと test を対応づける。さらに本文の `test.step('S<n>-CP<k> …')` / `test.step('S<n>-END …')` の**有無**で観測点を機械的に突合する（`grep -nE "test\.step\('S[0-9]+-(PRE|O[0-9]+|CP[0-9]+|END)" e2e/tests/<feature>.spec.ts`）。
3. **実行結果** — 各 test の pass/fail と証跡パス。失敗が step 内で起きた場合は**落ちた step 名**（`S3-CP2` 等）を結果に併記する（trace の step ツリーと plan の観測点が同じ ID で対応する）。

| 遷移map # | scenario | test | 中間観測点assert | 終了条件assert | 証跡 | 結果 |
|-----------|----------|------|------------------|----------------|------|------|
| #2 | S1 ログイン成功 | `logs in with valid credentials` | CP1 ✓ | END ✓ | trace.zip | pass |
| #4 | S2 検証エラー | `shows validation error...` | CP1 ✓ / CP2 部分(API未呼出の positive 確定なし) | END ✓ | - | pass |
| #3 | S5 再読込 | `keeps draft after reload` | CP1 ✓ / CP2 無し | END 未突合(step 無し) | trace.zip | fail @ S5-CP1 |
| #5 | S8 権限差分 | （未突合） | 未突合 | 未突合 | - | 未突合 |

- **突合できなかった行は捏造せず「未突合」と明記する。** plan にあるが対応する spec タグが見つからない（=未実装/タグ漏れ）、逆に spec にあるが plan に対応シナリオが無い、実行されず結果が無い——いずれも該当セルを `未突合` とし、空欄や推測値で埋めない。未突合は「漏れの可視化」が目的なので、隠さず残す。
- **`中間観測点assert` 列は観測点 ID ごとの内訳形式で書く**: `CP1 ✓ / CP2 部分(…) / CP3 無し` のように、plan の `CP<k>` を1件ずつ列挙する（1セルにまとめて `✓` としない）。`終了条件assert` 列は `END ✓` / `END 部分(…)` 等。
- **判定は step ベースで機械的に行う**: plan の `S<n>-CP<k>` に対応する `test.step('S<n>-CP<k> …')` が spec にあり、その step 内に web-first assert があれば **`✓`**（step の中身は目視せず、step の存在と assert の存在で判定してよい）。**step は無いが該当する assert が本文にある場合のみ人手で5値判定する**（`✓` / `部分` / `コメントのみ` / `無し` / `未突合`）。`部分` は**何が欠けるかを併記する**。step も assert も無ければ `無し`、plan 側に `CP<k>` の採番が無ければ `未突合(plan 未採番)` として plan へ差し戻す。**観測点は1件ずつ突合し、推測で `✓` を埋めない**。
- `S<n>-PRE` の有無は Coverage Matrix の列には出さないが、**無い test は冒頭の注記に列挙して e2e-codegen の precheck 規約へ差し戻す**（`[precheck]` の機械分類が効かないため）。
- **plan 側の誤りを検出したら、spec だけでなく plan も訂正対象として差し戻す**（例: シナリオの遷移マップ参照が実際に辿る経路と食い違う）。突合は spec の品質検査であると同時に **plan の品質検査**でもある。
- spec に `[S<n> / map#<m>]` タグが無くて逆引きできない場合は、その旨を Coverage Matrix の冒頭に記し、e2e-codegen のタグ付け規約に差し戻す。

## 残骸スキャン（破壊的スイートでは必須）

破壊的・自己完結シナリオを含むスイートでは、**フレッシュ実行と flaky 再評価のあとに「残骸スキャン」を必ず行う**。teardown の消滅検証は未ロード状態だと自明に通るため、**全 green は「環境を汚していない」ことを意味しない**（実運用で、全 green のまま残骸が1件発生した）。

- 認証済み context で対象の一覧を開き、**読み取りのみ**で、e2e-codegen の命名規約プレフィックス（例: `[E2E削除可] `）で始まるデータの有無を確認する。
- **見つけてもこの場で削除しない。** 残骸の名前・出所（`runId` から実行回を逆算できる）・状態をレポートに記録し、**扱いは承認ゲート②に諮る**。
- **規約プレフィックスを持たないデータには絶対に触れない**（シードデータ・実運用データの巻き添えを防ぐ）。過去の実行漏れでプレフィックス無しの残骸がある場合も、**人間の判断でしか消せない**ものとして記録に留める。
- 残骸が出ていたら、それは teardown の穴（多くは待機不足）なので **Step3 へ差し戻す**。修正後は**残骸が出たのと同一条件**（同じ `--repeat-each` / worker 数）で再実行し、残骸ゼロを確認して初めて塞がったと判断する。

## 成果物

`e2e/reports/<feature>-<YYYYMMDD-HHmm>.md` に Coverage Matrix・残差分類表・証跡パス・残骸スキャン結果を書く。Step3 が (a') 期待の反証で収束したシナリオがあれば、**プロダクト側の要起票事項**として plan の該当節への参照付きで一覧する（起票そのものは行わず、承認ゲート②の申し送りにする）。

```markdown
# E2E 実行レポート: <feature>

> 実行日時: <YYYY-MM-DD HH:mm> / 結果: <N passed / M failed>

## Coverage Matrix

| 遷移map # | scenario | test | 中間観測点assert | 終了条件assert | 証跡 | 結果 |
|-----------|----------|------|------------------|----------------|------|------|
| #2 | S1 ログイン成功 | `logs in with valid credentials` | CP1 ✓ | END ✓ | trace.zip | pass |
| #3 | S5 再読込 | `keeps draft after reload` | CP1 ✓ / CP2 部分(再取得完了の確定なし) | END ✓ | trace.zip | fail @ S5-CP2 |
| #5 | S8 権限差分 | （未突合） | 未突合 | 未突合 | - | 未突合 |

## 残差分類（残 @guessed の失敗のみ・収束済みは対象外）

| test | 分類 | 根拠（trace/video/screenshot） | 提案する処遇 | 差し戻し先 |
|------|------|--------------------------------|--------------|------------|
| S5 再読込 | 待機不足 | e2e/.artifacts/.../trace.zip（S5-CP2 で失敗） | Step3 収束ループへ戻す（再取得完了の確定を先に置く） | Step3 / EPT |
| S2, S4, S7（`[precheck]` 同一メッセージで全赤・1件に畳む） | 前提データ不整合 | `[precheck] ログイン済みランドマークが無い` | state 再採取 | seed / env |
| S3 視覚 | 視覚baseline未作成 | （baseline無し） | --update-snapshots で生成（不具合ではない） | baseline |

## flaky 再評価メモ（無修正3回 `--repeat-each 3`・収束ループの N=3 とは別物）
- 同一 seed・同一データ・同一環境で**無修正のまま**再実行した安定性: <N/3 回 pass>
- retries は 0 のまま（`E2E_RETRIES` を上げていないこと。上げたなら理由）
- 繰り返す残差分類: <...>

## 残骸スキャン（読み取りのみ・削除はしていない）
- 規約プレフィックス `<例: [E2E削除可] >` の残存: <0件 / N件（名前・runId・出所）>
- 規約プレフィックスを持たない残骸: <あれば記録のみ。触れていないことを明記>

## プロダクト側の要起票事項（(a') 期待の反証で収束したもの）
| # | 事項 | plan の参照箇所 | spec 側の現状 |
|---|------|-----------------|---------------|
| ① | <実挙動が plan の期待を反証した内容> | plan「未確認・要レビュー」/ S<n> の確定 | <実挙動を確定アサート。修正が入れば期待値を反転> |
```

## 承認ゲート②（残差の扱い方針）

**ここは「残差をどう扱うか」の方針承認に純化されている**——Step4 は spec を直して実走し直すループを持たない（spec を実画面探索で直すのは Step3 収束ループの仕事）。**全テストが Step3 で (a) 収束していれば残差はゼロで、このゲートは実質スルー**。残差がある場合だけ、その**処遇方針**をユーザーに諮る:

- **EPT／プロンプト改善行き**（Step3 の収束ループが (b) N 尽きで通せなかった＝ロケータ・待機の生成方針が弱い残差）。spec を場当たりで直さず、`claudedocs/ept/` の評価ログに残して codegen のプロンプト/方針改善へ回す。
- **plan・e2e-map へ差し戻し**（Step3 が (c) 途中離脱で「計画した動線／要素が実画面に存在しない」と判定した残差＝plan/map の漏れ）。
- **seed・env へ差し戻し**（state 失効・seed 不整合の前提データ問題）。

いずれも**この場で spec を最小修正して通そうとしない**（それは Step3 へ戻す判断）。承認されるのは「どこへ差し戻す／何に記録するか」であって、Step4 内での修正実行ではない。healer に plan 由来の漏れまで背負わせない原則は維持する。

- **遷移を伴うクリック直後の落ち（待機不足）／途中遷移のリンクが今の画面に無い（ロケータ破損）** といった残差は、本来 Step3 収束ループが実画面探索で潰すべきもの。Step4 に残っているなら **Step3 へ戻して収束させる**（`networkidle` 待ちや推測 goto で無理に通さない方針は e2e-codegen に揃える）。Step4 でその場の spec パッチをしないこと。

## flaky 再評価（推奨）— 収束ループの N=3 とは別物

重要シナリオは**同一 seed・同一データ・同一環境で、無修正のまま3回**実行し、「何回中何回通るか・どこで落ちるか（どの `S<n>-CP<k>` step か）・同じ分類に収まるか」を見る（flaky 検出）。

```bash
# retries は 0 のまま（既定）。--repeat-each で同一テストを無修正で3回流す
pnpm exec playwright test e2e/tests/<feature>.spec.ts --grep "<重要シナリオ>" --repeat-each 3
```

**retry で吸収しない**（上記「retries 方針」）。3回のうち1回でも落ちたら flaky として Step3 へ戻す——落ちた step が毎回同じなら待機戦略の抜け（同期 read／再取得レース／silent success）、毎回違うなら並列干渉（`data.own=shared` への書き込み・共有アカウントの同時操作）を疑う。

> **これは Step3 収束ループの「N=3」とは別物。混同しない。** 収束ループの N=3 は**「通すために spec を直す」反復**（修正を挟む）で、Step3 が所有する。**Step4 の flaky 再評価は「通った重要シナリオの安定性確認」で、無修正で3回回す**——直すための反復ではない。収束ループで直したテストを「3回流したから安定」と読み替えない。安定性は無修正の再実行で測る。

## feature 横断の確認は `/e2e-audit`

この Coverage Matrix は**1 feature 内**（当該 plan↔spec↔実行結果）の突合に閉じている。**feature をまたいだスイート全体の不足（class/role の穴・未検証経路・`needs_review` の滞留）を見るには `/e2e-audit` を実行する**。`/e2e-audit` は `plans/ tests/ reports/` をスキャンして `e2e/index.md`（横断スナップショット）を再生成する（`/e2e-plan` の Step4 後に自動実行される。テストは再実行しない）。
