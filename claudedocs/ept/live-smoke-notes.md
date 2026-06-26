# ライブ smoke 所見（非スコア・収束後の任意検証）

> 実施: 2026-06-26 / 種別: **非スコア smoke**（再現性が無いため EPT 採点・eval は変更しない。数値据え置き）
> 目的: e2e-map / e2e-run の recorded fixture が前提にした「出力形式」が、実 chrome-devtools / 実 Playwright 出力と乖離していないかを1回だけ確認する。
> 対象: 公開デモ **https://demo.playwright.dev/todomvc**（認証不要・公開・破壊性はローカル状態のみ）。
> 結論先出し: **両 fixture とも判断レイヤーに効く内容（role/name・遷移結果・失敗の Call log 骨格）は現実と一致。差分はすべて「形式の装飾・新旧 Playwright の文言差」で分類結果を変えない。fixture 改変は不要（任意の realism 向上 diff 案のみ下記に提案）。**

---

## smoke-1: map（実ブラウザ探索で ARIA スナップショット形式を検証）

### 手順と環境メモ
- **chrome-devtools MCP は本環境で attach 不可だった**: 既定プロファイル起動を試みてユーザーの稼働中 Chrome とシングルトン衝突（`Could not find DevToolsActivePort ... /Default/DevToolsActivePort`）。9222 を掴むのは DevTools 端点でない別 Google プロセス。ユーザーの Chrome を落とすのは破壊的なので回避。
- 代替として **playwright MCP**（独自ブラウザ起動・`browser_snapshot`）で TodoMVC を開き、「todo 追加→完了→削除」を実探索。ARIA スナップショットの **内容（role/name/入れ子）はツール非依存**なので形式検証の目的は満たせる。chrome-devtools `take_snapshot` 固有の差は下記に明記。

### 実出力断片（playwright `browser_snapshot`・完了直後）
```yaml
- generic [ref=e15]:
  - checkbox "❯Mark all as complete" [ref=e16]
  - list [ref=e18]:
    - listitem [ref=e19]:
      - generic [ref=e20]:
        - checkbox "Toggle Todo" [checked] [active] [ref=e21]
        - generic [ref=e22]: 買い物に行く
        - button "Delete" [ref=e37]: ×
    - listitem [ref=e33]:
      - generic [ref=e34]:
        - checkbox "Toggle Todo" [ref=e35]
        - generic [ref=e36]: 部屋を掃除する
        - text: ×
- generic [ref=e23]:
  - generic [ref=e24]:
    - strong [ref=e25]: "1"
    - text: item left
  - list [ref=e26]:
    - listitem: link "All" [ref=e28]: { /url: "#/" }
    - listitem: link "Active" [ref=e30]: { /url: "#/active" }
    - listitem: link "Completed" [ref=e32]: { /url: "#/completed" }
  - button "Clear completed" [ref=e38]
```
- navigation 結果の表現: `Page URL: https://demo.playwright.dev/todomvc/#/` / `Page Title: React • TodoMVC` を返す（fixture の `nav-N ... → /path` と同義）。
- console は `[ERROR] Failed to load resource: ... 404 () @ .../favicon.ico:0` の形式（`[LEVEL] message @ url:line`）。

### 観測した実挙動（fixture 設計の妥当性に関わる）
- カウントが単複変化: `strong "2" items left` → 完了で `strong "1" item left`。
- 完了で checkbox に `[checked]` 属性、`button "Clear completed"` が新規出現。
- **削除 affordance（`×`）は hover/active 時のみ role を `button "Delete"` として露出**。非アクティブ時は素の `text: ×`（accessible name 無し）。→ 削除導線は状態依存で見え方が変わる、という現実の罠。

### fixture（`map-edge-input.md`）形式との一致・差分
**一致（判断に効く核）**:
- 「`- role "name"` のインデント木 + navigation 結果の列挙 + 末尾 log ブロック」という fixture の探索トランスクリプト構造は、実 ARIA スナップショットの骨格と合致。
- fixture が列挙する role 種（banner/main/heading/list/listitem/link→url/button/dialog/combobox/menu/menuitem）は実ツリーに実在する粒度。member 権限の `/members` 空表示・`/admin/settings` 403 の「未取得」表現も、実探索でも同様に role/name が取れないだけなので忠実。

**差分（すべて装飾レベル・分類非影響）**:
1. **per-node ハンドルの有無**: 実ツールは各ノードに識別子を付す（playwright=`[ref=eN]`、chrome-devtools `take_snapshot`=`uid=...`）。fixture は識別子を省いた整形済みダンプ。→ 判断は role/name で行うため影響なし。
2. **`generic` ラッパの間引き**: 実 ARIA 木は `- generic [ref=eN]:`（div 相当）を多数含み冗長。fixture は意味のある role に直行して整形。→ fixture の方が読みやすく、判断対象は変わらない。
3. **状態属性のインライン化**: 実出力は `[checked]` `[active]` `[level=1]` `[cursor=pointer]` をノード行に付す。fixture は状態を `# コメント`で表現。→ どちらも情報は等価。
4. **リンク表現**: 実 `link "All": /url: "#/"` vs fixture `link "..." → /path`（矢印記法）。cosmetic。

**chrome-devtools 固有の注記**: fixture 名は `take_snapshot` 由来を謳うが、本 smoke では attach 不可のため playwright スナップショットで代替検証。両者の差は per-node ハンドルの記法（`uid=` vs `[ref=]`）のみで、role/name/入れ子という判断材料は同一。よって結論（形式は現実的）は chrome-devtools でも成立する。

### map fixture の改善要否
**不要**（採点妥当性に影響なし）。任意の realism 向上案（適用は見送り＝採点据え置き）:
- 各ノードに `uid=`/`[ref=]` 風ハンドルを1〜2個だけ付す、`generic` ラッパを数か所混ぜる、`[checked]`/`[disabled]` を属性表記にする、で「実ツール生出力により近い」体裁にできる。ただし現状でも判断レイヤーの検証目的は満たしており、ノイズを足す利得は小さい。

---

## smoke-2: run（実 `npx playwright test` で失敗ログ形式を検証）

### 手順
- `/tmp/e2e-run-smoke` に使い捨て PW プロジェクトを作成（出荷物 `examples/` `scaffold/` `skills/` は不変）。`scaffold/playwright.config.ts` を土台に **認証 project を削除**・`baseURL=https://demo.playwright.dev/todomvc`・`trace:'on'`。`@playwright/test@1.61.1` をローカル導入（既存 chromium cache を流用）。
- spec 1本（4 test）: S1 初期表示・S2 todo 追加=**成功**／S3 存在しないラベル `getByRole('button',{name:'追加する'})`=**ロケータ破損**／S4 バンドルを2s遅延させ 500ms で見出し assert=**待機不足**。最終結果 **3 passed / 1 failed**（S3 失敗、S4 は遅延注入後に失敗を確認）。
- 補足: `baseURL` 末尾スラッシュ無し + `goto('/')` が origin 直下へ解決され全 test が初回赤になる罠を踏み、`goto` をアプリ実体パスに修正（**現実の baseURL 罠**。fixture 所見ではなく実行上の学び）。

### 実出力断片①: ロケータ破損（S3）
```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '追加する' })
```
list reporter 行: `✘ ... S3 ...（ロケータ破損） (30.1s)`。証跡添付ブロック:
```
attachment #1: screenshot ... e2e/.artifacts/todomvc-S3-...（ロケータ破損）-chromium/test-failed-1.png
Error Context:            e2e/.artifacts/todomvc-S3-...（ロケータ破損）-chromium/error-context.md
attachment #3: trace ...  e2e/.artifacts/todomvc-S3-...（ロケータ破損）-chromium/trace.zip
  npx playwright show-trace e2e/.artifacts/.../trace.zip
```

### 実出力断片②: 待機不足（S4）
```
Error: expect(locator).toBeVisible() failed
Locator: getByRole('heading', { name: 'todos' })
Expected: visible
Timeout: 500ms
Error: element(s) not found
Call log:
  - Expect "toBeVisible" with timeout 500ms
  - waiting for getByRole('heading', { name: 'todos' })
```

### fixture（`run-median-log.md`）形式との一致・差分
**一致（6分類に効く核）**:
- コンソールは `Running N tests using M workers` → `✓/✘ [chromium] › file:line › タイトル (xs)` → `N failed, N passed (合計s)` の reporter 形式。fixture と同型。
- ロケータ破損: `locator.click: ... Timeout` + `Call log: - waiting for getByRole(...)` の骨格が一致 → 「ロケータ破損」へ自然に分類可能。
- 待機不足: `toBeVisible` + `waiting for <locator>` + 短い timeout という骨格が一致 → 「待機不足」へ自然に分類可能。
- 証跡: `trace.zip` / `test-failed-1.png` を artifact パスで紐付け、`npx playwright show-trace` の導線まで出る。fixture の trace/screenshot 紐付け前提と合致。

**差分（新旧 Playwright の文言差・分類非影響）**:
1. **action timeout vs test timeout の文言**: 実 S3 は per-action timeout 未設定のため `Test timeout of 30000ms exceeded`（テスト全体 timeout）が発火。fixture 失敗1は `Timeout 30000ms exceeded`（アクション timeout）。どちらも実在する現実の文言で、どちらの timeout が先に切れるかで変わるだけ。
2. **`locator resolved to 0 elements` 行**: fixture 失敗1は Call log にこの行を含むが、1.61.1 で `getByRole` が0件マッチのときは `waiting for getByRole(...)` のみで当該行は出なかった（この行は別状況で出る）。fixture はやや盛り気味だが分類は不変。
3. **assert エラー形式が新しくなっている（最も明確な差）**: 実 1.61.1 は
   `Error: expect(locator).toBeVisible() failed` + 構造化ブロック（`Locator:`/`Expected:`/`Timeout:`/`Error: element(s) not found`）+ Call log `Expect "toBeVisible" with timeout 500ms`（大文字・引用符）。
   fixture 失敗2は旧形式 `Error: expect(received).toBeVisible()` + `expect.toBeVisible with timeout 5000ms`（小文字ドット記法）。→ **fixture の run ログは旧 PW のアサーション文言を踏襲している**。分類は「toBeVisible/waiting for/timeout 過少」で読めるため結果は不変。
4. **`error-context.md`**: 実行は失敗時に `error-context.md`（失敗時 ARIA スナップショットの新 artifact）も生成。fixture は trace/screenshot のみ言及。
5. **artifact フォルダ名**: 実既定は `<file>-<TestTitle>-<project>/`（例 `todomvc-S3-…-chromium/`）と長い。fixture は `S3-提出/` 等に短縮整形。cosmetic。

### VRT（toHaveScreenshot）
- 本 smoke では未実施（spec に視覚比較を入れていない）。fixture 失敗3 の `A snapshot doesn't exist ... Note: writing actual snapshot. Re-run to compare.` は PW の既知形式で別途妥当だが、今回はライブ再確認していない（未検証として明示）。

### TodoMVC では再現できなかった失敗（fixture 設計の妥当性メモ）
- **「同期描画アプリでは待機不足を素直に作れない」**: 当初 `timeout:1ms` の即時 assert を試みたが、TodoMVC は静的バンドルで描画が速く2回とも PASS。`page.route` で bundle.js を2s遅延注入して初めて待機不足を誘発できた。→ median fixture の待機不足ケース（バリデーション API 応答後 ~1.6s に描画）は**ネットワーク律速の実アプリでこそ自然**で、瞬時 demo では非現実的。fixture が実アプリ前提なのは妥当。

### run fixture の改善要否
**不要**（critical 分類は現実出力からも自然に導ける）。任意の realism 向上案（適用は見送り＝採点据え置き）:
- **(最も妥当) 失敗2 のアサーション形式を現行 PW へ更新**: 旧 `expect(received).toBeVisible()` / `expect.toBeVisible with timeout 5000ms` を、新 `Error: expect(locator).toBeVisible() failed` + `Locator:/Expected:/Timeout:` ブロック + `Expect "toBeVisible" with timeout ...` に置換すると 1.6x 系の実出力に一致。
- 失敗1の `locator resolved to 0 elements` は0件マッチ時には出ないため、残すなら「detached/0件以外」の文脈に合わせるか削る。
- 証跡言及に `error-context.md` を追記、artifact パスを `<file>-<title>-<project>/` 形式に寄せると既定出力に忠実。
- いずれも **分類結果を変えないため必須ではない**。採点済み fixture の改変は provenance を濁すので、本 notes では提案に留め fixture 本体は不変とする。

---

## 総括
- **map / run とも、判断・分類レイヤーが依拠する情報（ARIA の role/name・遷移結果・失敗の Call log 骨格・証跡パス紐付け）は実出力と一致**。recorded fixture は現実と乖離していない。
- 検出した差分は全て (a) ツール固有のノード識別子記法、(b) 新旧 Playwright のアサーション文言、(c) artifact パスの整形 — いずれも **6分類/地図化の判断結果を変えない装飾差**。
- よって **fixture 本体の改変は不要**。realism を上げたい場合の任意 diff 案のみ上記に記録（適用は見送り、EPT 採点・eval は据え置き）。
- 環境制約の記録: chrome-devtools MCP は稼働中 Chrome とのシングルトン衝突で attach 不可だったため map は playwright スナップショットで代替検証した（内容はツール非依存で結論は不変）。
