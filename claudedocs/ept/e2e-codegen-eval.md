# e2e-codegen EPT 反復ログ

対象: `skills/e2e-codegen/SKILL.md`
手法: empirical-prompt-tuning（白紙 subagent に inline 手渡し・隔離で実行させ両面評価）

---

## Iter-0: description ↔ 本文 整合チェック（静的・subagent不要）

**description（現状）**:
> E2Eワークフロー Step3。承認済みの Markdown plan を Playwright の .spec.ts へ変換する。ロケータは role/text/testid 優先、非同期は web-first assertion、視覚差分は toHaveScreenshot 併用候補をコメント提案。生成後に selector と assertion を自己点検する。

**本文の責務（実体）**: setup/storageState レシピ（SSOは connectOverCDP）／変換方針（ロケータ・**未確定要素を nth/last/first で掴まない**・待機・**best-effort .click().catch() で hang を握りつぶさない**・assertion・視覚・locale）／**破壊的・自己完結シナリオのコード化**（UI経路 teardown・削除self は best-effort だが**末尾に toHaveCount(0) で消滅検証必須**・**認証済み newContext から開く**・ユニーク名）／生成後の自己点検チェックリスト。

### ギャップ
| # | ギャップ | 重大度 | 種別 |
|---|---------|--------|------|
| G1 | **実検証由来の critical 規則が description に皆無**: 破壊的・自己完結シナリオの teardown（toHaveCount(0)・認証済み newContext）／nth・last・first 事故防止／.click().catch() hang | 高 | 過少記述 |
| G2 | SSO 認証時の storageState 採取（connectOverCDP）レシピが description に不在 | 低 | 過少記述（手順は本文で十分） |

矛盾なし。description は「自己点検する」で抽象的に包含するのみ。critical 規則を最小語で description に昇格させる。本文ロジックは無編集。

### Iter-0 fix（適用済み diff）
description に「破壊的・自己完結シナリオは UI経路 teardown（認証済み context・末尾に消滅検証）まで生成・未出現要素を index で掴まない」を最小語で追記。
→ 下記「適用ログ」参照。

---

## Baseline 設計

### 評価 fixture
- **median**: `fixtures/codegen-median-plan.md`（login / form認証 / 承認済みフル plan。シナリオ仕様 S1..S8 込み）
- **edge**: `fixtures/codegen-edge-plan.md`（**承認済み・決定焼き込み済み** / SSO認証 / 作成→完了→削除の**自己完結破壊シナリオ1件**＋新規行を掴む誘惑（nth/last/first 事故テスト）＋閉じるべきバナー（click().catch hang 誘惑）を含む）

### executor 設計
- agentType = **general-purpose**（E2E専門agent禁止）
- SKILL.md本文＋fixture＋必要な scaffold 断片（auth.setup.ts の役割等）を inline 同梱、リポ探索禁止、成果物（.spec.ts）はレポート本文のコードブロックで返させる（examples/login.spec.ts のカンニング防止）。
- 破壊的シナリオの方針判断は spec の無人出力に頼らず、**codegen edge fixture に「自己完結」と直接焼き込む**（codegen の純条項のみ評価）。

### 評価対象は成果物（.spec.ts）そのもの
本文のオウム返しは測らない。生成後自己点検チェックリストをそのまま要件化する循環を避け、**実検証で壊れた失敗モードを critical アンカー**にする。

### 要件チェックリスト
`fixtures/checklists.md` の「e2e-codegen」節に median/edge 別で**事前固定**。

---

## 反復ログ

### Iter-1（baseline 実測）

executor: general-purpose（sonnet）× 2 並列・隔離（inline手渡し）。両者 `tool_uses=0`（リポ探索ゼロ＝隔離成功・examples/login.spec.ts のカンニングなし）。

| fixture | 成功○ | 正答率 | critical | tool_uses | duration_ms | tokens |
|---------|-------|--------|----------|-----------|-------------|--------|
| codegen-median (login/form) | ○ | 80%（4/5・CM5 △） | CM1 ○ | 0 | 67,844 | 28,469 |
| codegen-edge (SSO/自己完結破壊) | ○ | 100%（7/7） | CE1 ○ / CE2 ○ / CE3 ○ | 0 | 105,653 | 29,548 |

#### チェックリスト結果
- median: CM1○ CM2○ CM3○ CM4○ **CM5△**
- edge: CE1○ CE2○ CE3○ CE4○ CE5○ CE6○ CE7○

#### ハイライト（実検証由来 critical の生存確認）
edge の生成コードで、実検証で壊れた失敗モードが**白紙読みで全て正しく回避**された:
- **CE1**: 新規行を `beforeCount`→`toHaveCount(beforeCount+1)`待ち→`nth(beforeCount)` で安全取得（`.last()` 事故なし）。
- **CE2**: teardown 末尾の `expect(getByText(name)).toHaveCount(0)` を **try/catch 外**に配置。
- **CE3**: teardown を `browser.newContext({ storageState })` から開く（newPage 回避）。
- **CE4**: バナーを `.click().catch()` で書かず「無理に閉じない」＋`isVisible({timeout})` 代替。
本文の critical 規則は堅牢で、diff 不要。

#### 失敗パターンの class 化（→ pattern-ledger.md）
- **C1（両fixtureで再現）**: 中間観測点のローディング/スケルトン/二重押下不可の検証を「アプリ実装依存」としてコメント降格し非アクティブ化。**遅延シナリオの中核検証が消える**。特に median は **`loginButton.toBeDisabled()`（既知ロケータで検証可能）までコメント化**。本文が「中間観測点は assertion **または明示コメント**で表現」と逃げ道を許容し、かつローディングの標準 role（progressbar/status）への誘導が無いのが一因。Phase: Execution。

#### Iter-1 で当てる本文 diff（最小・additive）
- **C1 対策**: 変換方針に「中間観測点のうち**既知ロケータで検証できるもの（ボタン disabled・URL・件数・toast 等）は必ず active assert** する。未知セレクタ依存のもの（カスタムローディング表示等）のみコメント提案に留め、ローディングは標準 role `getByRole('progressbar')`/`getByRole('status')` を第一候補に試す」を追記。

→ diff 適用後 Iter-2 で確認（C1 が active assert 化するか・退行なし・新規パターンゼロか）。

#### 適用ログ
- Iter-0: description に nth/last/first 禁止・破壊的 teardown（認証済みcontext・消滅検証）を追記済み。
- Iter-1: 本文に C1 の additive 条項を追加（下記 Iter-2 で効果測定）。

### Iter-2（diff 後の確認反復）

executor: general-purpose（sonnet）× 2 並列・隔離。両者 `tool_uses=0`。**更新後の本文**を inline 手渡し。

| fixture | 成功○ | 正答率 | critical | tool_uses | duration_ms | tokens |
|---------|-------|--------|----------|-----------|-------------|--------|
| codegen-median (login/form) | ○ | 100%（5/5・**CM5 △→○**） | CM1 ○ | 0 | 80,784 | 27,950 |
| codegen-edge (SSO/自己完結破壊) | ○ | 100%（7/7） | CE1 ○ / CE2 ○ / CE3 ○ | 0 | 117,460 | 28,873 |

#### diff の効果（C1: コメント降格→active assert への転換）
- **median**: Iter-1 でコメントアウトされていた `expect(loginButton).toBeDisabled()` が active 化。ローディングも `progressbar`/`status` を count-guard 付き active assert。PART B で C1 条項を引用。
- **edge**: Iter-1 でコメントだった S6 遅延ローディングが `await expect(getByRole('progressbar')).toBeVisible()` ＋応答後 `toHaveCount(0)` の active 化。**かつ S1（happy path の transient スケルトン）はコメント据置**＝「中核(遅延)は active・racy/非中核はコメント」を正しく弁別（C1 の意図通り）。
- **退行なし**: critical（CE1 keyboard.type＋件数ガード＋名前指定／CE2 try/catch外 toHaveCount(0)／CE3 newContext／CE4 banner無理に閉じない）すべて維持。
- **新規失敗パターン: ゼロ**。

### ✅ 収束判定（真の頭打ち）
critical 全○（両iter両fixture）＋ 新規パターンゼロ ＋ 正答率上げ止まり（median 80%→100%・edge 100%固定）。**e2e-codegen は Iter-2 で収束**。適用した本文 diff は Iter-0 description 補強＋Iter-1 の C1 additive 条項1件のみ（既存ロジック不変）。実検証由来の破壊事故モード（nth/last/first・toHaveCount(0)・認証済み newContext・.click().catch hang）は**白紙読みで全て生存**。

---

## 構造変更（2026-06-26）: 収束ループの追加 — 既存収束ベースラインは superseded

EPT チューニングとは別軸で、**設計変更**として e2e-codegen に「収束ループ」節を追加した（`/grill-me` で全分岐確定済み）。これは additive な条項追記ではなく**スキルの責務拡張**で、上記 Iter-2 収束判定の前提（=静的生成のみのスキル）を変える。**したがって上記の収束ベースラインは superseded。次回 EPT は新責務で取り直す。**

- **本文 diff（codegen）**: ①出所マーカー `// @guessed`（実画面未観測行に付与・実走 green で除去・残差は残す）を変換方針／自己点検／成果物例に追加。②新節「収束ループ（認証確立 → 実走 → 探索 → 修正）」を追加——認証を収束ループ入口で一度だけ確立（旧 Step4 の CDP 手動採取手順を移設）、初回フルラン→落ちたテストだけ 1本=1サブエージェント（直列）で chrome-devtools 診断→Playwright MCP 検証→spec 最小修正→実走、**test ごと最大 N=3**、出口3分類（(a)収束で `@guessed` 除去 / (b)N尽きで残差化 / (c)plan・map／seed・env 差し戻しは attempt 非消費）、**バックストップ上限=テスト数×3**。③「収束ループの N=3 ≠ Step4 の flaky 再評価（無修正3回）」を明記。
- **連動 diff**: e2e-run は実行修正ループを削除し「残差分類＋証跡収集＋Coverage Matrix＋flaky 再評価」へ純化（`e2e-run-eval.md` 末尾参照）。CDP 採取手順は e2e-run → e2e-codegen へ移設。`/e2e-plan`・`/e2e-audit`・`e2e-map` の Step3/Step4 責務記述も同期。
- **次回 EPT の観点案**: @guessed の付与/除去の弁別精度、出口3分類の判定（特に (c) 早期離脱の見極め）、サブエージェント直列化とオーケストレータへの返り値最小化、バックストップ到達時の Step4 残差流し。なお収束ループは実ブラウザ/実走を伴うため、白紙読み EPT ではなく**実 smoke 寄りの検証**が要る点に注意（純粋な静的読みではループ挙動を測れない）。
