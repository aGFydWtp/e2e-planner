# e2e-spec EPT 反復ログ

対象: `skills/e2e-spec/SKILL.md`
手法: empirical-prompt-tuning（白紙 subagent に inline 手渡し・無人・隔離で実行させ両面評価）

---

## Iter-0: description ↔ 本文 整合チェック（静的・subagent不要）

**description（現状）**:
> E2Eワークフロー Step2。遷移マップから、観測点つきの検証仕様（Markdown plan）を起こす。happy path/validation/permission/戻る/再読込/途中離脱/遅延の各クラスを最低1件ずつ、各シナリオに開始状態・操作・中間観測点・終了条件・除外事項を持たせる。

**本文の責務（実体）**: ①認証の扱い（前提条件 vs シナリオ・SSO時はログインフロー検証を作らず「該当なし」明記）②**破壊的シナリオの扱い（本文が「この Step の中心責務」と自称）**＝自己完結/除外の一括提示・無人オーサリング時は除外＋要確認・不可逆副作用は慎重 ③7網羅クラス ④各シナリオ必須項目（開始状態/操作/中間観測点/終了条件/**後始末(teardown)**/除外事項）。

### ギャップ
| # | ギャップ | 重大度 | 種別 |
|---|---------|--------|------|
| G1 | 本文が「中心責務」と明言する**破壊的シナリオ扱い（自己完結/除外・一括提示・無人オーサリング）が description に皆無** | 高 | 過少記述（中心責務の不可視化） |
| G2 | 必須項目の **teardown（後始末）が description の項目列挙から欠落**（descriptionは5項目、本文は6項目） | 中 | 過少記述 |
| G3 | SSO/OTP時に「ログイン成功/検証エラー/401」を**「該当なし」明記**する条項が description に不在 | 中 | 過少記述 |

矛盾（contradiction）は無し。すべて description が本文を過少代表している方向。実運用のスキル・ルーティング精度のため description を補強する（下記 fix）。本文ロジックは無編集（EPTループの diff 対象として温存）。

### Iter-0 fix（適用済み diff）
description に破壊的シナリオ扱い（中心責務）・teardown・SSO該当なしを最小語で追記。
→ 下記「適用ログ」参照。

---

## Baseline 設計

### 評価 fixture
- **median**: `fixtures/spec-median-map.md`（login / form認証 / 遷移マップのみ。シナリオ仕様は剥がして executor に作らせる）
- **edge**: `fixtures/spec-edge-map.md`（SSO認証 + タスクボード。閲覧=非破壊 happy 素地 + 作成→完了→削除=破壊的。無人オーサリング条項の全発火を狙う）

### executor 設計
- agentType = **general-purpose**（E2E専門agent禁止＝本文の曖昧さをagent知識で埋めさせない）
- **無人**実行（ユーザー確認不可）。SKILL.md本文＋fixtureをTaskプロンプトにinline同梱、リポ探索禁止、成果物はレポート本文で返させる（ディスク非書き込み・examples/カンニング防止）。

### 期待される正しい挙動（無人 × SSO × 破壊的）
- SSO のため「ログイン成功/検証エラー/401」は**該当なし（SSOのためログインフロー検証対象外）と明記**。
- 未ログイン→ログイン画面リダイレクトは **permission差分として1件**書ける（IdP自動化ではないため）。
- 作成→完了→削除など破壊的シナリオは**無人なので除外＋「要確認」明記**（盲目的に自己完結テストを書かない）。
- happy path は破壊的でない閲覧フロー等で1件、戻る/再読込/途中離脱/遅延も起こす。

### 要件チェックリスト
`fixtures/checklists.md` の「e2e-spec」節に median/edge 別で**事前固定**（後で動かさない）。

---

## 反復ログ

### Iter-1（baseline 実測）

executor: general-purpose（sonnet）× 2 並列・無人・隔離（inline手渡し）。両者とも `tool_uses=0`＝リポ探索ゼロ（隔離成功）。

| fixture | 成功○ | 正答率 | critical | tool_uses | duration_ms | tokens |
|---------|-------|--------|----------|-----------|-------------|--------|
| spec-median (login/form) | ○ | 80%（4/5・SM4 △） | SM1 ○ | 0 | 85,858 | 27,583 |
| spec-edge (SSO/無人) | ○ | 100%（6/6） | SE1 ○ / SE2 ○ | 0 | 108,982 | 28,013 |

#### チェックリスト結果
- median: SM1○ SM2○ SM3○ **SM4△** SM5○
- edge: SE1○ SE2○ SE3○ SE4○ SE5○ SE6○

#### 自己申告（4フェーズ）からの抽出
- **median [Execution]**: 遷移マップで「未確認」の中間観測点（ローディング有無）を、本文が必須とする中間観測点にどう書くか指示が無く、自前の Honesty 規範で「※未確認のためスキップ可」を補った（裁量）。
- **median [Planning]**: 7必須クラスに「401」が無く、401 は別節（認証の扱い）にだけある → クラス割当に迷い。
- **median [SM4]**: permission差分を storageState=user/admin 対比でなく **admin ログイン経由の happy(S2)** で表現。
- **edge [Understanding]**: 無人時の「除外」の意味が曖昧（シナリオ枠ごと削除か／枠を書いて「要確認」明示か）。「盲目的に書かない」と「要確認と明示」が緊張。→ 枠＋teardown想定を書いて「要確認(無人除外)」を選択（裁量）。
- **edge [Planning]**: 破壊的が全除外され happy が「閲覧のみ」に痩せる残存弱さを自己指摘。
- **edge [Execution]**: S9 で Step3 実装知識（page.route）を先取り（スコープ滲み・自己申告済み）。

#### 失敗パターンの class 化（→ pattern-ledger.md）
- **P1（両fixtureで再現・最重要）**: 遷移マップの「未確認」観測点/分岐を spec の中間観測点・終了条件にどう繰り越すか本文に規定が無く、各 executor が別々の自前ルール（median=スキップ注記 / edge=両論併記＋補記）で裁量補完 → **作者間で不統一**。Phase: Understanding/Execution。
- **P3（edge）**: 無人時「除外」の解像度不足（枠を残すか削除か）。SE2(critical)は通ったが、別作者なら枠ごと削除して「要確認」ハンドオフを失う恐れ。Phase: Understanding。
- **P4（median のみ・本文defectではない）**: SM4 の storageial 対比未表現は、**median fixture の遷移マップが #5 を「admin で認証→管理メニュー」とログイン帰結として枠組みしていた**ことが主因。edge では map が「member非表示/admin表示」と対比を明示しており S5 で正しく storageState 対比を表現できた。→ **本文は不変でよい**（map のフレーミング依存）。eval 上 SM4△ は fixture アーティファクトと判定。

#### Iter-1 で当てる本文 diff（最小・additive）
1. **P1 対策**: 「未確認」項目の繰り越しルールを追記（推測で終了条件を断定せず「未確認・要確認」として中間観測点/終了条件に明記しゲート①へ送る）。
2. **P3 対策**: 無人オーサリング節に、除外＝シナリオ枠は残し「要確認（無人除外）」と明示し想定 teardown も書いてゲート①へ送る（枠ごと削除しない／承認まで有効化しない）を明文化。

→ diff 適用後 Iter-2 で確認（P1/P3 が裁量補完不要になるか・退行なし・新規パターンゼロか）。

#### 適用ログ（description / 本文 diff）
- Iter-0: description に破壊的シナリオ扱い・teardown・SSO該当なしを追記済み。
- Iter-1: 本文に P1/P3 の additive 条項を追加（下記 Iter-2 で効果測定）。

### Iter-2（diff 後の確認反復）

executor: general-purpose（sonnet）× 2 並列・無人・隔離。両者 `tool_uses=0`（隔離維持）。**更新後の本文**を inline 手渡し。

| fixture | 成功○ | 正答率 | critical | tool_uses | duration_ms | tokens |
|---------|-------|--------|----------|-----------|-------------|--------|
| spec-median (login/form) | ○ | 80%（4/5・SM4 △据置） | SM1 ○ | 0 | 90,808 | 28,352 |
| spec-edge (SSO/無人) | ○ | 100%（6/6） | SE1 ○ / SE2 ○ | 0 | 128,907 | 28,782 |

#### diff の効果（裁量補完→ルール駆動への転換を確認）
- **P1 解消**: median は「手順書の『推測で終了条件を断定しない／未確認と明記したまま残す』の原則に従い」と明記し S3/S7/S8 を〔未確認・要確認〕で統一処理。Iter-1 の自前 Honesty 規範による「※スキップ可」裁量が消えた。edge も S2/S10/S12/S11 で同条項を引用。
- **P3 解消**: edge は破壊的 S3/S5/S6/S8 を**枠＋想定teardown付きで「要確認（無人除外）」と明記し「Step3 はこれを生成しません」**と添えた。PART B で「『枠ごと消すな』という明示があったため迷いは少なかった」と明言。Iter-1 の「除外の意味が曖昧」が解消。
- **退行なし**: median S5戻るは Iter-1 のログイン操作埋め込み→Iter-2 で storageState=user 開始に是正（むしろ改善）。

#### 残課題の判定
- **SM4△（median）**: 据え置き。permission差分を storageState=user/admin 対比でなく admin ログイン経由で表現。**本文 defect ではなく median fixture の map フレーミング依存**（#5 を「admin で認証→管理メニュー」とログイン帰結で記述）。edge は map が「member非表示/admin表示」と対比を明示しており S7 で正しく storageState 対比を表現。→ 本文変更しない。
- **新規失敗パターン: ゼロ**。

### ✅ 収束判定（真の頭打ち）
critical 全○（両iter両fixture）＋ 新規パターンゼロ ＋ 正答率上げ止まり（median 80%固定・edge 100%固定）。**e2e-spec は Iter-2 で収束**。適用した本文 diff は Iter-0 description 補強＋Iter-1 の P1/P3 additive 条項2件のみ（既存ロジック不変）。
