# e2e-map EPT 反復ログ

対象: `skills/e2e-map/SKILL.md`
手法: empirical-prompt-tuning（白紙 general-purpose subagent に inline 手渡し・無人・隔離で実行させ両面評価）
前提: spec / codegen は収束済み。本ログは同方式を map に展開。ライブ依存（実サイト探索）は分解し、**判断・分類レイヤーを recorded fixture で隔離・白紙再現してスコア**する（探索忠実度はスコア外）。

---

## Iter-0: description ↔ 本文 整合（`iter0-map-run-command.md` で実施済み）＋ M1 fix

Iter-0 で M1/M2 を所見として記録（fix見送り）。本格ループ着手時に **M1 を再判断し fix を適用**。

- **M1（中・語感の不整合）**: description の「画面遷移を**棚卸し**したいとき」が本文の「**棚卸しに堕ちるのを防ぐ**（中心フロー起点）」と逆。利用者を棚卸しモードへ誘導しうる。
- **M2（中・過少記述）**: 価値フロー確定の質問・破壊性属性の記録・認証方式の具体化が description 不在。

### Iter-0/M1 fix（適用済み diff）
description を「価値を生む中心フロー起点」へ寄せ、M2 の中心責務（破壊性・価値の推測禁止＝ユーザー確定・認証方式具体化）を最小語で畳んだ。spec/codegen の Iter-0（中心責務を description へ昇格）と同方針。本文ロジックは無編集。

```diff
- description: …到達範囲を地図化し、画面遷移・分岐条件・失敗系・非同期イベントを Markdown 遷移表に起こす。コードは書かない。…対象機能の画面遷移を棚卸ししたいときに使う。
+ description: …「価値を生む中心フロー」を起点に到達範囲を地図化し、画面遷移・分岐条件・失敗系・非同期イベント・破壊性を Markdown 遷移表に起こす。中心価値が不明なら推測で決め打ちせずユーザーに確定させ、認証方式（form/SSO等）も具体化する。コードは書かない。…到達範囲を価値フロー起点で把握したいときに使う。
```

---

## Baseline 設計

### 評価 fixture
- **median**: `fixtures/map-median-input.md`（doc-driven・ライブ探索なし。経費精算 expense。PRD で中心価値が明文化・form認証・破壊的経路=作成/削除を含む素直なケース）
- **edge**: `fixtures/map-edge-input.md`（recorded-exploration・SSO=Okta・**中心価値が未文書化**・**一部画面が未探索(403/権限不足)**・破壊的経路=作成/削除/招待メールを**観測のみ**。無人）

### executor 設計（spec/codegen の様式を踏襲）
- agentType = **general-purpose**（E2E専門agent禁止＝本文の曖昧さを agent 知識で埋めさせない）/ model=sonnet。
- **無人・隔離**: SKILL.md本文（M1 fix 後）＋fixture を Task プロンプトに inline 同梱、リポ探索禁止、成果物はレポート本文で返させる（ディスク非書き込み・examples カンニング防止）。median+edge を1メッセージで並列起動。

### 要件チェックリスト
`map-run-ept-plan.md` の MM1〜MM5 / ME1〜ME5（**事前固定・遡及改訂しない**）。critical=MM1/MM2・ME1/ME2。

---

## 反復ログ

### Iter-1（baseline 実測）

executor: general-purpose（sonnet）× 2 並列・無人・隔離。両者 `tool_uses=0`＝リポ探索ゼロ（隔離成功・examples 非参照）。

| fixture | 成功○ | 正答率 | critical | tool_uses | duration_ms | tokens |
|---------|-------|--------|----------|-----------|-------------|--------|
| map-median (expense/form/doc-driven) | ○ | 100%（5/5） | MM1 ○ / MM2 ○ | 0 | 83,009 | 28,559 |
| map-edge (workspace/SSO/価値未文書化/無人) | ○ | 100%（5/5） | ME1 ○ / ME2 ○ | 0 | 130,721 | 28,963 |

#### チェックリスト結果
- median: MM1○ MM2○ MM3○ MM4○ MM5○
- edge: ME1○ ME2○ ME3○ ME4○ ME5○

#### ハイライト（critical アンカーの生存確認）
- **MM1（価値フロー起点）**: median は「提出→承認→精算済み」の承認完遂フローを骨格に据え、status 状態機械（draft→submitted→approved/rejected）として地図化。全画面の機械的棚卸しに堕ちていない。
- **MM2/ME4（破壊性=属性）**: 破壊的経路（作成/削除/更新/招待メール）を「破壊性」列に種別記録し、扱い判断は Step2 へ申し送り。除外フラグにしていない。
- **ME2（価値はコードから演繹不可・ask-don't-guess）**: edge は中心価値が doc に無いことに対し、**決め打ちを避けて「⚠️中心価値未確定」ブロック＋5問の一括質問**を立て、無人なので確定せずブロッカーとして申し送り。本文の「推測で価値フローを決め打ちしない」が白紙読みで発火。
- **ME1（未確認明記・捏造しない）**: 403 の `/admin/settings`・権限不足の `/members` を「未確認」明記し、admin 画面構造を捏造せず「推定」と区別。観測のみの破壊操作も「観測のみ・実行せず」で一貫。

→ **map 本文の critical 規則は白紙読みで全て生存。diff 不要。**

#### 自己申告（4フェーズ）からの抽出（裁量・迷い）
- **median [Execution]**: PRD に記載の無い承認済/差し戻し後の詳細画面を**「推測」明示で2行**立てた（捏造はせずラベル化し未確認・要レビューへ）。locale/timezone も日本語UIから ja-JP/JST と「推定」明示。
- **median [MM4]**: 分岐・エラー・非同期は厚いが、ブラウザ「戻る」経路の独立記述は薄い（確認ダイアログのキャンセル等でカバー）。
- **edge [Understanding/Planning]**: 中心価値の決め打ちを避けるのに迷いは無く、本文の質問の型を当該対象にアレンジして適用。未探索領域の扱いも「未確認で行を残す」で一貫。
- **edge [Execution]**: 「3件のスペース」ステータス表示 vs 一覧2件の不一致に気づいたが、未確認・要レビューに入れ損ねた（自己申告で自省）。

#### 失敗パターンの class 化（→ pattern-ledger.md）
- **チェックリスト failure: ゼロ**（両fixture critical 全○・正答率100%）。
- **P1（未確認の繰り越し）の map 再現は無し（positive）**: spec で問題化した「未確認の裁量補完」が、map では本文の「未確認明記＋ask-don't-guess」条項により裁量なくルール駆動で処理された。→ **クロススキルで P1 は map 本文側では既に解消済み**と確認（ledger に positive 記録）。
- **M-INV（監視のみ・本文defectでない）**: doc-driven median でも executor は「妥当な次状態」を推測行として補う傾向。ただし**「推測」ラベル＋未確認送り**で透明化しており、本文の「捏造しない」は守られている。単発・透明・実害低のため本文不変、監視のみ。

---

### ✅ 収束判定（真の頭打ち）
- **critical 全○**（median MM1/MM2・edge ME1/ME2、Iter-1）。
- **新規失敗パターン: ゼロ**（class-level で本文 defect に上がるものなし。M-INV は監視のみ）。
- **正答率: 両fixture 100%（天井）**。
- 適用した変更は **Iter-0/M1 の description 補強のみ**（本文ロジック不変）。修正すべき失敗が baseline で出ていないため、**diff を当てる Iter-2 は不要**＝ **e2e-map は Iter-1 で収束**（成熟スキルの早期収束。`map-run-ept-plan.md` の打ち切り基準に合致）。

> 補足: ライブ探索忠実度（chrome-devtools で実サイトを辿る品質）は EPT スコア外。収束後の非スコア smoke で別途確認可能（任意）。
