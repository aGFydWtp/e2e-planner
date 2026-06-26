# e2e-run EPT 反復ログ

対象: `skills/e2e-run/SKILL.md`
手法: empirical-prompt-tuning（白紙 general-purpose subagent に inline 手渡し・隔離で実行させ両面評価）
前提: spec / codegen は収束済み。本ログは同方式を run に展開。ライブ依存（実 Playwright 実行・実 trace パース）は分解し、**失敗6分類・修正先ルーティングの判断レイヤーを recorded run log で隔離・白紙再現してスコア**する（実行そのものはスコア外）。

---

## Iter-0: description ↔ 本文 整合（`iter0-map-run-command.md` で実施済み）

矛盾なし・整合良好。唯一の所見 R1（再評価3回が description 不在・**低**）は過少記述に留まり実害低のため fix 不要と判断。本格ループでも本文/description は無編集で baseline 計測。

---

## Baseline 設計

### 評価 fixture
- **median**: `fixtures/run-median-log.md`（form-login expense の録画実行ログ＋trace/error 抜粋。失敗混在＝ロケータ破損1・待機不足1・VRT baseline 初回未生成1）
- **edge**: `fixtures/run-edge-log.md`（SSO=Okta タスクボードの録画ログ・**破壊的/自己完結シナリオ含む**。Run A=storageState 失効で全赤／Run B=teardown末尾 toHaveCount(0)失敗・`.click().catch` の hook hang で describe 巻き込み・**plan未記載の規約同意モーダル**を混在）

### executor 設計（spec/codegen の様式を踏襲）
- agentType = **general-purpose**（E2E専門agent禁止）/ model=sonnet。
- **隔離**: SKILL.md本文＋fixture（録画ログ）を Task プロンプトに inline 同梱、リポ探索禁止・実 playwright 非実行、成果物はレポート本文で返させる（ディスク非書き込み）。承認ゲート②前のためコード修正禁止（分類表提示に留める）。median+edge を1メッセージで並列起動。

### 評価対象は成果物（失敗分類表）そのもの
本文のオウム返しは測らない。**実検証由来の失敗モード（実検証の削除メニュー未発火＝CE2/CE6 とクロス／SSO storageState のコピー不可＝verify-auth findings とクロス）を critical アンカー**にして、白紙読みで正しく分類・ルーティングできるかを測る。

### 要件チェックリスト
`map-run-ept-plan.md` の RM1〜RM5 / RE1〜RE5（**事前固定・遡及改訂しない**）。critical=RM1/RM2・RE1/RE2。

---

## 反復ログ

### Iter-1（baseline 実測）

executor: general-purpose（sonnet）× 2 並列・隔離。両者 `tool_uses=0`＝リポ探索ゼロ・実行なし（隔離成功）。

| fixture | 成功○ | 正答率 | critical | tool_uses | duration_ms | tokens |
|---------|-------|--------|----------|-----------|-------------|--------|
| run-median (expense/form/混在3失敗) | ○ | 100%（5/5） | RM1 ○ / RM2 ○ | 0 | 53,673 | 26,412 |
| run-edge (board/SSO/破壊的/Run A・B) | ○ | 100%（5/5） | RE1 ○ / RE2 ○ | 0 | 100,470 | 27,688 |

#### チェックリスト結果
- median: RM1○ RM2○ RM3○ RM4○ RM5○
- edge: RE1○ RE2○ RE3○ RE4○ RE5○

#### ハイライト（実検証由来 critical アンカーの生存確認）
白紙読みで、実環境で壊れた失敗モードを全て正しく分類・ルーティング:
- **RE1（teardown toHaveCount(0) → 削除UIのロケータ破損）**: edge は「残骸が残る→前提データ不整合と分類したい誘惑」を**自己申告で明示しつつ抗い**、本文の明示ルールに従い**削除UI経路のロケータ破損**と分類し afterEach 削除フローへ修正ルーティング。実検証の削除メニュー未発火知見（CE2/CE6）と一致。
- **RE2（storageState 失効の全赤 → 前提データ不整合／修正先 auth.setup・env、prompt で直さない）**: Run A 全6赤を単一原因の storageState 失効と判定、修正先を auth.setup/environment にし「spec 本体は触らない」と明記。SSO state はコピー不可・採取し直しが必要という verify-auth findings と整合。
- **RM2（VRT baseline 初回未生成は不具合でない）**: `--update-snapshots` 生成＋人間確認に正しくルーティング、6分類の「失敗」に数えていない。
- **RE4（探索不足/状態遷移漏れ → plan/e2e-map へ差し戻し）**: plan 未記載の「規約同意モーダル」を6分類に押し込めず、**plan(e2e-map)更新→codegen** へ差し戻すルーティングを選択（healer に plan 漏れを背負わせない条項が発火）。

→ **run 本文の critical 規則は白紙読みで全て生存。diff 不要。**

#### 自己申告（4フェーズ）からの抽出（裁量・迷い）
- **median [Planning]**: S4 を「待機不足」と「期待値誤り」で一瞬迷うも、fixture が「エラー文言・ロケータは正しい」と示すため期待値誤りを除外、timeout 値不足＝待機不足に確定（妥当）。
- **edge [Planning]**: S2/S6 の overlay 由来 click hang を「ロケータ破損（要素は在るが操作不能）」と「待機不足（actionability 未充足）」で迷い、**要素は見つかっている**点を根拠に待機不足を主因に選択。**どちらでも修正先は spec で同一**のため実害なし（RE3 は「闇雲リトライせず当該フックの問題と特定→spec」を要求しており満たす）。
- **edge [Execution]**: 「提案する最小修正」列で `.waitFor`/`.click({timeout})` に言及した点を「承認前のコード不記載」の境界として自省（方針説明に留め実装コードは書いていない＝RM4/承認ゲート順守の範囲内）。

#### 失敗パターンの class 化（→ pattern-ledger.md）
- **チェックリスト failure: ゼロ**（両fixture critical 全○・正答率100%）。
- **R-OVL（監視のみ・本文defectでない）**: 「要素は DOM に在るがオーバーレイ等で操作不能（actionability 未充足）」のクリック hang が、6分類の「ロケータ破損」と「待機不足」のどちらにも読める。**両者とも修正先=spec で実害ゼロ**・executor は根拠を明示して主因を選び RE3 を満たした。本文 defect でないため不変、監視のみ（将来 fixture で頻発するなら6分類表に actionability の一文を検討）。

---

### ✅ 収束判定（真の頭打ち）
- **critical 全○**（median RM1/RM2・edge RE1/RE2、Iter-1）。実検証由来アンカー（RE1=削除メニュー未発火／RE2=SSO state 失効）が白紙読みで生存。
- **新規失敗パターン: ゼロ**（class-level で本文 defect に上がるものなし。R-OVL は監視のみ）。
- **正答率: 両fixture 100%（天井）**。
- 本文/description は **無編集**（Iter-0 で fix 不要と判定済み）。修正すべき失敗が baseline で出ていないため、**diff を当てる Iter-2 は不要**＝ **e2e-run は Iter-1 で収束**（成熟スキルの早期収束。`map-run-ept-plan.md` の打ち切り基準に合致）。

> 補足: 実 `npx playwright test` の実行品質・実 trace パースは EPT スコア外。収束後の非スコア smoke で別途確認可能（任意）。

---

## 構造変更（2026-06-26）: 残差処理への純化 — 既存収束ベースラインは superseded

設計変更（収束ループ追加・`e2e-codegen-eval.md` 末尾参照）に連動し、e2e-run を**実行修正ループ削除**＋「残差分類＋証跡収集＋Coverage Matrix＋flaky 再評価」へ純化した。上記 Iter-1 収束判定の前提（=実行＋6分類＋承認後に最小修正するスキル）を変えるため、**上記ベースラインは superseded。次回 EPT は新責務で取り直す。**

- **本文 diff（run）**: ①CDP 手動 state 採取手順（旧「実行前の人間タスク」節）を e2e-codegen の収束ループ入口へ**移設・削除**。認証は Step3 確立済みとし、Step4 は原則ノータスク（prebuilt-state の state 失効時のみ再採取）。②分類対象を「残差＝残 `// @guessed` の失敗のみ」に限定（収束済みは対象外）。残差の機械的特定手順（`grep @guessed` × 失敗 test）を追加。③6分類の spec 系（ロケータ破損／待機不足）の修正先を「Step4 でその場パッチ」から「**Step3 収束ループへ戻す**」に変更。④承認ゲート②を「修正方針承認」から「**残差の処遇方針承認（EPT行き / plan・map 差し戻し / seed・env 差し戻し）**」へ純化——全収束なら実質スルー。⑤「flaky 再評価（無修正3回）≠ 収束ループの N=3」を明記。
- **次回 EPT の観点案**: 残差の機械的拾い上げ（@guessed 残存×失敗の突合）の正確さ、収束済み/残差の弁別、その場パッチ抑止（Step3 戻し判断）、flaky 再評価と収束 N=3 の非混同。実走・実 trace を伴うため**実 smoke 寄りの検証**が要る。
