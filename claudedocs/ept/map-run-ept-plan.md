# EPT 実施プラン: e2e-map / e2e-run（次セッションで実行）

> 作成: 2026-06-26 / 状態: **未実行（次セッションで着手）**
> 前提: e2e-spec / e2e-codegen は EPT 収束済み（`e2e-spec-eval.md` / `e2e-codegen-eval.md`）。本プランは同じ方式を map/run に展開する。
> 出典手法: mizchi/skills meta/empirical-prompt-tuning。

## 着手手順（次セッションはここから）
1. この計画と `pattern-ledger.md`・既存 eval・`fixtures/` を読む（spec/codegen の executor プロンプト様式を踏襲）。
2. e2e-map / e2e-run の **Iter-0（description↔本文整合）は実施済み**（`iter0-map-run-command.md`）。map に M1/M2 の所見あり（fix見送り中）。本格ループ着手前に M1（「棚卸し」語感）を description 修正するか再判断する。
3. 下記 fixtures を `claudedocs/ept/fixtures/` に作成。
4. e2e-map → e2e-run の順で Iter-1（median+edge 並列・無人・隔離）→ 失敗を class 化 → 最小 diff → Iter-2 確認 → 収束。
5. 収束後、任意でライブ smoke（非スコア）。

## 全体方針（spec/codegen と同一）
- executor = **general-purpose・無人・隔離**（SKILL.md本文＋fixtureを inline 手渡し／リポ探索禁止＝examples汚染なし／成果物はレポート本文で返す／ディスク書き込み禁止）。
- ライブ依存は分解する: **判断・分類レイヤーは recorded fixture で隔離・白紙再現してスコア**、ライブ実行そのものはスコア外。
- メトリクス: Agent usage meta から tool_uses（=0で隔離確認）/duration_ms/tokens を記録。
- 成功○=[critical]全○のときのみ。正答率%=満たした項目/総項目。チェックリストは事前固定・遡及改訂しない。

---

## e2e-map

### EPT で測れること / 測れないこと
- **測る（隔離可）**: PRD/seed・録画した探索トランスクリプトから起こす遷移マップの判断品質。
- **測らない（別手段）**: chrome-devtools で実サイトを実際に辿る探索忠実度。

### Fixtures（`fixtures/` に作成）
- **map-median-input.md = doc-driven**（ライブなし）: form認証アプリの PRD抜粋＋ルート定義/seed test を inline。価値が明文化された素直なケース。破壊的経路（作成/削除）を1つ含める。
- **map-edge-input.md = recorded-exploration**: SSO認証・**中心価値が未文書化**・**一部画面が未探索**・破壊的経路（作成/削除/招待メール）を観測—という「探索トランスクリプト（take_snapshot の ARIA ダンプ風＋navigation 結果の列挙）＋断片 doc」を inline。無人。
  - 仕込み: (a) 未探索ゾーン（admin 画面など）を明示的に「snapshot 取得できず」状態にする → 未確認明記を試す。(b) 価値を文章で書かない → 推測で決め打ちせず質問化を試す。(c) 破壊的操作の観測点だけ残す → 破壊性=属性記録を試す。

### 要件チェックリスト（critical を外部グラウンドにアンカー）
**map-median**
| # | 項目 | 種別 |
|---|------|------|
| MM1 | 価値フロー起点で地図化（中心価値→経路。全画面の機械的棚卸しに堕ちていない） | **critical**（skill定義責務） |
| MM2 | 破壊的操作を地図から落とさず「破壊性」列に属性記録（除外フラグにしていない） | **critical**（破壊性=属性。spec とクロス） |
| MM3 | 認証方式（form/SSO等）・ロール一覧をヘッダ/前提に具体化 | normal |
| MM4 | 戻る/分岐/エラー経路/非同期イベントを列挙（主経路だけでない） | normal |
| MM5 | コードを書いていない（spec を生成していない） | normal |

**map-edge**
| # | 項目 | 種別 |
|---|------|------|
| ME1 | 未探索の経路/権限/状態を「未確認」と明記・**推測で画面を捏造していない** | **critical**（推測で捏造しない＋未確認明記） |
| ME2 | 未文書化の中心価値を**推測で決め打ちせず**一括質問として要レビューに残す（無人なので確定しない） | **critical**（価値はコードから演繹不可・ask-don't-guess。spec P1/P3 とクロス） |
| ME3 | SSO 方式を具体化し、ロール（未ログイン/member/admin）を確定 | normal |
| ME4 | 破壊的経路を破壊性列に記録し、扱い判断（自己完結/除外）は Step2 へ申し送り（map で決めない） | normal |
| ME5 | 探索時の安全策（破壊的操作を実行せず観測点として記録）に言及/順守 | normal |

> 監視: spec の **P1（未確認の繰り越し）** が map の ME1/ME2 で再現する可能性が高い。再現したら map 本文にも同趣旨の条項追記を検討（ledger にクロス記録）。

---

## e2e-run

### EPT で測れること / 測れないこと
- **測る（隔離可）**: 録画した `playwright test` 実行ログ＋trace/error 抜粋からの失敗6分類・修正先ルーティング。
- **測らない（別手段）**: 実 Playwright 実行・実 trace パース。

### Fixtures（`fixtures/` に作成）
- **run-median-log.md = recorded run log**: form-login spec の `npx playwright test` 出力＋trace/error 抜粋を inline。失敗混在（ロケータ破損1・待機不足1・VRT初回未生成1）。
- **run-edge-log.md = recorded run log（破壊的・SSO）**: 次を含むログを inline:
  1. **teardown 末尾 `toHaveCount(0)` 失敗**（削除クリック警告は出ているが残骸が消えていない）
  2. **storageState 失効でセッション切れ→全テスト赤**
  3. **`.click().catch` の hook hang（actionability 未充足）で beforeEach が30sタイムアウト→全テスト巻き込み**

### 要件チェックリスト
**run-median**
| # | 項目 | 種別 |
|---|------|------|
| RM1 | 各失敗を6分類のいずれかに正しく分類（主因＋副次） | **critical**（skill定義責務） |
| RM2 | VRT baseline 初回未生成を「不具合」に分類しない（`--update-snapshots` で生成と案内） | **critical**（明示条項） |
| RM3 | 修正先ルーティング正（ロケータ→spec/待機→spec/前提データ→seed・env/期待値→spec or plan） | normal |
| RM4 | 承認ゲート②前に勝手にコード修正していない（分類表の提示に留める） | normal |
| RM5 | 証跡パス（trace/video/screenshot）をレポートに紐付け | normal |

**run-edge（実検証アンカー）**
| # | 項目 | 種別 |
|---|------|------|
| RE1 | teardown `toHaveCount(0)` 失敗を「前提データ不整合」でなく**削除UI経路の「ロケータ破損」**と分類し削除フローを直す | **critical**（実Asana削除メニュー未発火。codegen CE2/CE6 とクロス） |
| RE2 | storageState 失効の全赤を**「前提データ不整合」→修正先 seed/environment/auth.setup（prompt で直さない）** | **critical**（明示条項。verify-auth findings とクロス） |
| RE3 | `.click().catch` hook 全滅を闇雲リトライせず当該フックのロケータ/待機問題と特定（spec修正） | normal（codegen CE4 とクロス） |
| RE4 | 探索不足/状態遷移漏れ由来は spec/healer でなく plan/e2e-map へ差し戻す | normal（明示条項: healer に plan漏れを背負わせない） |
| RE5 | 再評価（同一条件3回）で flaky を見分ける手順に言及 | normal |

---

## 反復・打ち切り
- 真の頭打ち（critical全○＋新規失敗パターンゼロ＋正答率上げ止まり）まで。成熟スキルなので baseline で critical 全○なら早期収束もありうる。
- 1反復ごとに median+edge を1メッセージ並列起動。両面評価＝自己申告4フェーズ＋計測。
- 失敗は `pattern-ledger.md` に class-level で積み、spec/codegen の既存 P1〜P4/C1 とクロス参照。

## 成果物
- `claudedocs/ept/e2e-map-eval.md` / `e2e-run-eval.md`（Iter別 diff・自己申告・計測・チェックリスト結果・収束判定）
- `claudedocs/ept/fixtures/` に上記4 fixture を追加
- `pattern-ledger.md` 追記

## 概算コスト
2スキル×（baseline＋Iter-1＋Iter-2想定）≒ subagent 8体前後 = +$25〜35（spec/codegen と同規模）。

## ライブ検証（任意・スコア外）
収束後に1回だけ、chrome-devtools MCP で実サイト探索（map）／実 `npx playwright test`（run）を非スコア smoke として回し、recorded fixture が現実と乖離していないか確認。再現性がないため EPT スコア対象にしない（メモリ `prefer-chrome-devtools-mcp` に従う）。
