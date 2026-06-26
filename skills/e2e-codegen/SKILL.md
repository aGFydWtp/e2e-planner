---
name: e2e-codegen
description: E2Eワークフロー Step3。承認済みの Markdown plan を Playwright の .spec.ts へ変換し、実画面を探索しながら自律で通るまで収束させる。静的生成→認証確立→収束ループ（chrome-devtools診断+Playwright MCP検証+spec最小修正+実走）の三段。実画面未観測の行は `// @guessed` を付け、実走greenで外す。ロケータは role/text/testid 優先、非同期は web-first assertion、視覚差分は toHaveScreenshot 併用候補をコメント提案。未出現要素を nth/last/first で掴まない。破壊的・自己完結シナリオは UI経路の teardown（認証済み context・末尾に消滅検証）まで生成する。N回試しても通らない残差（残 @guessed）だけ Step4 へ渡す。
when_to_use: e2e-spec の plan が承認された後、Playwright テストコードを生成し実画面探索で通るまで収束させるとき。e2e-plan オーケストレーターの Step3 として。
argument-hint: <feature-name>
---

# Step3: 実行可能コード化（e2e-codegen）

承認済みの `e2e/plans/<feature>.md` を Playwright spec へ変換する。**ロケータ方針・待機方針・視覚方針を生成時点で固定**し、生成の漂流を抑える。

前提: plan が**承認済み**であること（承認ゲート①を通過）。未承認なら変換しない。

## セットアップ実行（初回のみ・自動）

プロジェクトに `playwright.config.ts` が無い場合、**エージェントが自分で実行する**（ユーザーに丸投げしない・承認ゲートは挟まない）。「依存をインストールし scaffold を配置します」と**一行告知してから**次を実行する。ヘッドレスで完結する作業なので人間タスクはここでは出さない（state 採取・資格情報投入は後段の「収束ループ入口（認証確立）」で一度だけ依頼する）。

```bash
# 1) scaffold 配置
cp "${CLAUDE_PLUGIN_ROOT}/scaffold/playwright.config.ts" ./playwright.config.ts
cp "${CLAUDE_PLUGIN_ROOT}/scaffold/e2e/auth.setup.ts" ./e2e/auth.setup.ts
mkdir -p e2e/tests e2e/plans e2e/reports
cat "${CLAUDE_PLUGIN_ROOT}/scaffold/.gitignore" >> ./.gitignore   # 既存 .gitignore にマージ（重複行は後で確認）
# package.json に test スクリプトを追記（${CLAUDE_PLUGIN_ROOT}/scaffold/package.snippet.json を参照）

# 2) 依存インストール
pnpm add -D @playwright/test dotenv tsx
pnpm exec playwright install chromium
```

**`.env` の生成（非シークレットの既知値のみ）**: エージェントが書いてよいのは Step1 で確定済みの**非シークレット値だけ**＝`E2E_BASE_URL`（Step1 の対象URL）と `E2E_AUTH_MODE`（Step1 確定値 form/prebuilt-state/none）。**シークレット（`E2E_USER`/`E2E_PASS`）は書かず、空欄＋コメントで残す**（投入は後段の収束ループ入口でユーザーへ依頼する）。

```bash
# 既存 .env が無い場合のみ新規生成する（.env と e2e/.auth/ は scaffold の .gitignore でコミット除外済み）
E2E_BASE_URL=<Step1の対象URL>
E2E_AUTH_MODE=<form | prebuilt-state | none>   # Step1 確定値
E2E_USER=        # form の場合のみ。シークレットなのでエージェントは書かず収束ループ入口でユーザーが投入
E2E_PASS=        # 同上
```

**既存 `.env` がある場合は上書きしない**（非破壊）。不足しているキー（`E2E_BASE_URL`/`E2E_AUTH_MODE` 等）だけを差分として案内する。

## 認証必須アプリのセットアップ（storageState レシピ）

認証が要るなら、テスト本体を書く前に**ログイン済み状態を作る仕組み**を入れる。テスト内でログインを踏ませない（漂流と flaky の元）。

1. **setup project の雛形をコピーする:**
   ```bash
   cp "${CLAUDE_PLUGIN_ROOT}/scaffold/e2e/auth.setup.ts" ./e2e/auth.setup.ts
   cp "${CLAUDE_PLUGIN_ROOT}/scaffold/.gitignore" ./.gitignore.e2e   # 既存 .gitignore にマージ
   cp "${CLAUDE_PLUGIN_ROOT}/scaffold/.env.example" ./.env.example   # → cp .env.example .env して実値を入れる
   ```
   `scaffold/playwright.config.ts` の `projects` は既に **setup project ＋ `dependencies:['setup']` ＋ `storageState`** 構成になっている。
2. **認証情報は env で渡す** — `E2E_USER` / `E2E_PASS`。`.env` と `e2e/.auth/` は**コミットしない**（scaffold の `.gitignore` 参照）。
3. **各テストは state を前提に開始する** — `playwright.config.ts` の project に `storageState: 'e2e/.auth/user.json'` が入っているので、テストは `page.goto('/dashboard')` から直接書ける。`test.use({ storageState })` を個別指定しない限り project の設定が効く。
4. **複数ロール（permission差分）** — `auth.setup.ts` に role ごとの setup を足して `e2e/.auth/<role>.json` を保存し、config に role 別 project を足す（雛形にコメントあり）。
5. **未ログイン検証**（ログイン画面・検証エラー・権限なしリダイレクト）は **state を持たない project** で実行する。ファイル名を `*.guest.spec.ts` 等にして project の `testMatch` で振り分ける（config にコメント例あり）。
6. **SSO / OTP / 2FA で form 自動化できない場合** — `auth.setup.ts` の自動ログインは使えない（SSO は自動化ブラウザのログインを bot 検知で弾く）。方針は **`E2E_AUTH_MODE=prebuilt-state`**：新規ログインせず、既にログイン済みの実ブラウザのセッションを `connectOverCDP` で取り出す（同梱 `save-state-cdp.ts`）。**この分岐は Step1（e2e-map）で確定済み。** ここ（静的生成）では `scripts/`（`save-state-cdp.ts`）と `tsx` を配置するところまでをヘッドレスで済ませ、**実 Chrome の起動・ログイン・採取の具体手順は後段の「収束ループ入口（認証確立）」が案内する**（Chrome 起動と採取はエージェントが行い、ユーザーに頼むのはログインだけ）。ここでコピペ用の起動コマンドは出さない（人間タスクは収束ループ入口が所有）。API ログインが可能ならそちら（`request.post` でトークン取得→state 注入）でもよい。
   > **プロファイルをコピーする方式（`save-storage-state.ts`）は SSO では機能しない。** Chrome の Cookie は OS の鍵ストア（macOS Keychain の Chrome Safe Storage）で暗号化されており、別プロセスで開くと復号鍵が違って Cookie 値が壊れ、ログイン画面に戻される。**CDP 接続方式（生きたブラウザの復号済みセッションを取得）が正解**。`save-storage-state.ts` は OS 鍵ストアを使わない環境向けの参考に留める。

## 変換方針（固定）

- **出所マーカー `// @guessed`（実画面未観測の証）を付ける**: 静的生成の時点では plan は憶測込みで、ロケータ・期待値が実画面と合う保証がない。**実画面を一度も観測せずに書いた行は、入口の `goto`（開始状態）を除き原則すべて行末に `// @guessed` を付ける**（過小申告より過剰申告に倒す＝安全側）。確信のないロケータ・待機・期待値ほど必ず付ける。このマーカーは後段の収束ループで**実走 green になった行から外し**、N 回試しても通らない**残差テストには残す**（=未収束の証）。Step4 は「残った `@guessed` を含む失敗テスト」だけを残差として機械的に拾うので、外し忘れ・付け忘れに注意する。
- **ロケータ**: `getByRole` / `getByText` / `getByLabel` / `getByTestId` を優先。CSS/XPath は最後の手段。
- **未確定要素を index で取らない（破壊的事故の防止）**: **出現待ちをせずに `nth()` / `last()` / `first()` で可変リストの端をつかまない。** 特に「新規作成した行」を取るのに `getByRole('textbox').last()` のように書くと、新規行がまだ出現していない瞬間に**既存の最終行を掴み、その値を上書きして実データを破壊する**（可変リストで既存の最終行を改名してしまう破壊事故が実際に起きうる）。新規作成の入力先は次のいずれかで特定する:
  - **作成 UI で出る空行のフォーカスへ `page.keyboard.type(...)` で直接入力**（要素を取り直さない）、または
  - **件数の増加を待ってから新規行を特定**: 操作前に件数を控え、`await expect(rows).toHaveCount(before + 1)` で増加を待ってから `rows.nth(before)` を対象にする。この件数ガードは安全な取得であると同時に、`.last()` が既存行を改名した場合は件数が増えないため `toHaveCount` が落ちて**偽陽性（green なのに破壊）を検出する**役目も果たす。
- **待機**: web-first assertion（`await expect(locator).toBeVisible()` など）で待つ。`waitForTimeout` の固定待機は使わない。**重い SPA では `page.goto()` / `page.reload()` の既定 `load` 待ちが長く test timeout に当たりやすい** ので、`{ waitUntil: 'domcontentloaded' }` を指定して描画後の web-first assertion で待つ（読み込み完了の判定は assertion 側に寄せる）。
- **遷移を伴うクリックの直後は、遷移先ロケータを触る前に遷移自体を assert する**: URL 変化や SPA 画面切替を起こすクリック（`getByRole('button', { name: '回答する' }).click()` 等）の **次の行で、遷移先にだけ存在する要素を触る前に** `await expect(page).toHaveURL(/遷移先/)` か遷移先固有要素の `await expect(...).toBeVisible()` を**1行置く**。`click()` は「クリックした」だけで遷移完了を待たないため、これを省くと**まだ遷移前のページ上で次の要素を探し始め**、その要素が遷移前ページに無いと `element(s) not found` で落ちる（実検証で「`回答する` クリック後すぐ `次のページへ` を探し agreement ページのまま落ちた」直接原因）。**判断に迷うなら置く**（過剰でも害は小さい）。**`waitForLoadState('networkidle')` は使わない**——Playwright 非推奨で、SPA ではネットワークが永久に idle にならない／逆に描画前に idle になり flaky。遷移の確証は「遷移先の URL/要素」を web-first で assert することで取る。
- **best-effort な `.click().catch(() => {})` で握りつぶさない（hook 全滅の原因）**: バナー閉じ等を `getByRole(...).click().catch(() => {})` のように書いても **`.catch()` は hang を救わない**。要素が actionability（可視・有効・非オーバーレイ）を満たさないと `click` は test timeout（既定30s）までブロックし、`.catch()` が効く前に `beforeEach`/`afterEach` ごとタイムアウトさせて全テストを巻き込む（実検証で6件全滅の直接原因）。代替:
  - **`count()` / `isVisible()` で存在・可視を確認してからのみ操作する**（不在ならスキップ）、
  - どうしても best-effort にするなら **`{ timeout: 1500 }` 等の短い timeout を明示**して hang を防ぐ、
  - **そもそも検証に干渉しない要素は無理に閉じない**（閉じる必要があるか自体を判断する）。
- **`page.goto()` は「入口」専用。価値フロー途中の画面遷移は UI を辿る**: `goto()` を使ってよいのは (a) シナリオの **開始状態**（`開始状態` の入口 URL／storageState 前提で直接開く）と (b) teardown の**新規 context 起点**だけ。**シナリオの `操作` 列に現れる画面遷移（例: エディタ→設定に戻る）は、対応する UI（リンク・ボタン・ヘッダー/グローバルナビ）を実際に click して辿る**。ここを `goto(設定URL)` で直行すると**ユーザー動線（その遷移導線自体の検証）を飛ばす**ため、価値フローの一部である遷移は UI 経由で踏む。遷移後は上記「遷移を伴うクリックの直後」ルールで遷移先を assert する。
- **アサーション**: URL・表示・値・ARIA・視覚差分のうち**最小十分な組み合わせ**。plan の「中間観測点」「終了条件」を assertion に対応させる。
- **中間観測点は「既知ロケータで検証できるものを必ず active assert する」**: ボタンの `toBeDisabled()`（二重押下不可）・URL 変化・件数・toast/alert など、**ロケータが確定できる観測点はコメントに逃さず実アサートする**。コメント提案に留めてよいのは、アプリ固有でセレクタが確定できない要素だけ。**ローディング/スケルトンの中間観測点は、まず標準 role `getByRole('progressbar')` / `getByRole('status')` を第一候補に active assert を試み**、それでも拾えない場合のみコメント提案に降格する。遅延・送信中シナリオは「ローディングが出る/操作がブロックされる」ことの検証が中核なので、ここを丸ごとコメントにすると happy path と区別がつかなくなる。
- **視覚差分が重要なシナリオ**（色・強調・レイアウト・Canvas）には `await expect(page).toHaveScreenshot()` の併用候補を**コメントで提案**する。DOM で拾えない視覚は Midscene 等の拡張フック点も併記（README参照）。
- **前提データ**: 認証状態は storageState / fixture で固定し、テスト内に外部依存を持ち込まない。認証必須画面は `test.use({ storageState })` を前提にし、テスト内でログインフローを踏まない。
- **ロケール/タイムゾーン**: ローカライズされた文言（ボタン名・メッセージ）や日付を assert するなら、`playwright.config.ts` の `use.locale`/`timezoneId` を**探索環境と同じ値に固定**すること。固定しない場合は headless 既定（en-US/UTC）で描画され、日本語前提の assert が「環境依存」で落ちる。固定できない場合はロケール非依存の検証（URL・role・testid）に寄せる。

## 破壊的・自己完結シナリオのコード化

Step2（e2e-spec）で「自己完結」と確定したシナリオは、**setup → 検証 → teardown を1本のテストとして純 E2E（UI経由）で生成**する。**ここでの方針判断は Step2 が済ませている。codegen は確定済み方針に従うだけで、勝手な判断をしない。**

- **破壊的・自己完結シナリオの describe には `test.describe.configure({ mode: 'serial' })` を付ける。** `playwright.config.ts` は `fullyParallel: true` のため、同一データ空間に作用する作成/更新/削除テストを並列実行すると、別テストが作った/消した行と競合して flaky になる。serial で同 describe 内を直列化し、競合を避ける。**これは応急処置である。** 本来は各テストが**自分専用の隔離データ**（テストごとにユニークなアカウント/プロジェクト/seed）を setup で用意し teardown で消すことで、並列のまま安全にするのが筋。隔離が用意できない段階での暫定手段が serial だと理解しておく。
- **勝手に `test.skip` ガードで黙らせない。** 破壊的だからといって codegen の判断でテストを眠らせるのは禁止。除外は Step2 でユーザーが決めたものだけ（除外シナリオはそもそも生成しない）。skip で「書いたが動かない」テストを残さない。
- **setup / teardown は UI 経由（純 E2E）で書く。** 作成も削除も**実際のユーザー操作経路**で踏む。`afterEach` / `afterAll` で、**作成したのと同じ UI 経路**で削除する（削除 UI を踏むこと自体が価値フローの検証になる）。DB 直叩きや API ショートカットで後始末しない（純 E2E のため）。
- **削除操作 self は best-effort、ただし「消えたこと」の検証は必須。** 後始末の削除クリック自体は `try/catch` で囲み、失敗してもテスト本体は落とさず**警告ログに留める**（teardown 失敗で本検証の結果が隠れないように）。**だが best-effort で握りつぶすだけだと、teardown が実機で発火していなくても green のまま残骸が蓄積する**（実検証で削除メニューが実 DOM で発火せず残骸が溜まった）。これを顕在化させるため、後始末の最後に **`await expect(page.getByText(name)).toHaveCount(0)` で「作成名がもう存在しない」ことを検証する一文を必ず置く**。この検証が落ちれば「teardown が実際には効いていない」とテスト失敗として気づける。「書いただけ」の teardown を信用しない。
- **teardown のコンテキストは認証済みにする。** 認証必須アプリで `browser.newPage()` を使うと storageState を持たずログイン画面に飛び、削除も上記の検証アサートも常に失敗する。後始末は **`browser.newContext({ storageState: 'e2e/.auth/user.json' })` から開く**。
- **teardown が実機で確立するまで破壊的シナリオを本番で回さない。** 上記の検証アサートで teardown 発火を確認できるまでは、破壊的・自己完結シナリオは**捨てプロジェクト/捨て環境で回す**（本番類似へ向けない）。teardown 未確立のまま本番で回すと、green でも実データを汚す。
- **作成データは timestamp 付きユニーク名**にする（例: `task-${Date.now()}` / `e2e-${runId}`）。teardown が漏れても残骸を一意に特定でき、手動掃除や再実行衝突回避ができる。

```ts
// S4. タスク作成→完了（破壊的・自己完結） plan で「自己完結」確定済み
test.describe('task lifecycle', () => {
  test.describe.configure({ mode: 'serial' });  // 破壊的シナリオは直列化（fullyParallel 下での競合回避・応急処置）
  const name = `e2e-task-${Date.now()}`;   // ユニーク名で残骸特定可能に

  test('creates, completes, then deletes a task via UI [S4 / map#4]', { tag: ['@feature:tasks', '@class:happy', '@role:user'] }, async ({ page }) => {
    await page.goto('/tasks');
    await page.getByRole('button', { name: '新規' }).click();
    await page.getByLabel('タイトル').fill(name);
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText(name)).toBeVisible();        // 作成の検証
    // …完了操作と検証…
  });

  // teardown も UI 経路で。削除クリック self は best-effort（失敗してもテストは落とさない）が、
  // 「消えたこと」の検証は必須（teardown が実機で発火していなくても green で残骸が溜まるのを防ぐ）。
  test.afterAll(async ({ browser }) => {
    // newPage だと storageState を持たずログイン画面に飛ぶ。認証済み context から開く。
    const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await context.newPage();
    try {
      await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
      const row = page.getByRole('row', { name });
      if (await row.count()) {
        await row.getByRole('button', { name: '削除' }).click();
        await page.getByRole('button', { name: '確認' }).click();
      }
    } catch (e) {
      console.warn(`[teardown] cleanup failed for ${name}: ${e}`);   // 削除操作の失敗は警告に留める
    }
    // 必須: 後始末が実際に効いたかを検証する。落ちれば teardown 未発火に気づける。
    await expect(page.getByText(name)).toHaveCount(0);
    await context.close();
  });
});
```

## 成果物

`e2e/tests/<feature>.spec.ts`。plan の各シナリオ（S1, S2, ...）を `test()` に1対1で対応させる。

- **各 `test()` のタイトル末尾に Coverage タグ `[S<n> / map#<m>]` を埋め込む**（例: `[S1 / map#2]`）。`S<n>` は plan のシナリオ番号、`map#<m>` は対応する遷移マップ行の番号。**Step4（e2e-run）の Coverage Matrix がこのタグを機械的に逆引きして plan↔spec を突合する**ので、省略しない。シナリオが複数の遷移マップ行に跨るなら `[S3 / map#3,#5]` のように併記する。対応する遷移マップ行が無い（plan 起点で足したシナリオ等）なら `map#-` と書く。
- タイトルに置けない事情があれば直前の近接コメントに同じタグを書く（タイトル優先）。
- **横断 coverage タグ `tag: ['@feature:<slug>', '@class:<slug>', '@role:<slug>']` を `test()` のオプションに付ける**（タイトルタグとは別系統・併用）。これは `/e2e-audit` が feature 横断で class/role の充足を集計するための機械可読タグで、**plan の `coverage` フィールド（class/role）の mirror**。値は plan に揃える（勝手な slug を作らない）:
  - `@feature:<slug>` — feature 名の slug（`e2e/tests/<slug>.spec.ts` の `<slug>` と同じ。ファイル単位で同一）。
  - `@class:<slug>` — plan の `coverage: class=...`（`happy`/`validation`/`permission`/`back`/`reload`/`abandon`/`network` の固定語彙）。
  - `@role:<slug>` — plan の `coverage: role=...`（`guest`/`user`/`admin` 等、`storageState` 名に対応）。
  - Playwright ネイティブの `tag` を使う（**`annotations` API は採らない**。`tag` は `--grep '@class:network'` で実行時フィルタにも効き、集計用途で優れるため一本化）。タグ付き test は `test('title [S1 / map#2]', { tag: ['@feature:login', '@class:happy', '@role:guest'] }, async ({ page }) => { ... })` の形で書く。
  - **`status` はタグに mirror しない**。`excluded` / `needs_review` / `covered_elsewhere` のシナリオはそもそも spec を生成しない（=tag も存在しない）。`/e2e-audit` は plan 側の `status` を直接読んで gap に集約する。

```ts
import { test, expect } from '@playwright/test';

// plan: e2e/plans/<feature>.md
test.describe('<feature>', () => {
  // S1. ログイン成功（happy path） / 遷移マップ #2 / coverage: class=happy role=guest
  test('logs in with valid credentials [S1 / map#2]', { tag: ['@feature:login', '@class:happy', '@role:guest'] }, async ({ page }) => {
    await page.goto('/login');                    // 開始状態（入口の goto は @guessed を付けない）
    await page.getByLabel('メールアドレス').fill('user@example.com');  // @guessed
    await page.getByLabel('パスワード').fill('password');              // @guessed
    await page.getByRole('button', { name: 'ログイン' }).click();      // @guessed
    // 中間観測点: ローディング → 遷移
    await expect(page).toHaveURL(/\/dashboard/);   // 終了条件 // @guessed
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();  // @guessed
    // 視覚差分が重要なら: await expect(page).toHaveScreenshot('dashboard.png');
  });
  // ↑ 静的生成直後はこのように実画面未観測の行に @guessed が付く。収束ループで実走 green になった行から外し、
  //   N 回で通らなければ残したまま Step4 へ残差として渡す。

  // S2. 必須項目未入力（validation error） / 遷移マップ #4 / coverage: class=validation role=guest
  test('shows validation error when fields are empty [S2 / map#4]', { tag: ['@feature:login', '@class:validation', '@role:guest'] }, async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page.getByText('メールアドレスを入力してください')).toBeVisible();
  });
});
```

## 生成後の自己点検（必須）

生成したら次を自分でチェックし、問題があれば直す:
- [ ] 全シナリオ（plan の S1..Sn）が test として存在するか
- [ ] **確信のないロケータ・待機・期待値の行に `// @guessed` が付いているか**（実画面未観測の行は入口 goto を除き原則すべて付与＝過剰申告側に倒す。収束ループで実走 green になった行から外す）
- [ ] **各 test タイトル（または近接コメント）に Coverage タグ `[S<n> / map#<m>]` があるか**（run の突合用・省略禁止）
- [ ] **各 test に横断 coverage タグ `tag: ['@feature:<slug>', '@class:<slug>', '@role:<slug>']` があり、値が plan の `coverage`（class/role）と一致するか**（audit の集計用・省略禁止／`annotations` ではなく `tag`）
- [ ] **破壊的・自己完結シナリオの describe に `test.describe.configure({ mode: 'serial' })` が付いているか**
- [ ] CSS/XPath ロケータが残っていないか（残すなら理由をコメント）
- [ ] 固定待機（`waitForTimeout`）・`waitForLoadState('networkidle')` が無いか
- [ ] **遷移を伴うクリックの直後に、遷移先ロケータを触る前の遷移 assert（`toHaveURL` か遷移先固有要素の `toBeVisible`）があるか**
- [ ] **`page.goto()` を「入口（開始状態）」「teardown の新規 context 起点」以外で使っていないか**（操作列の途中遷移を goto で飛ばしていないか／UI を辿っているか）
- [ ] **出現待ちをしない `nth()`/`last()`/`first()` で新規行・未確定要素を掴んでいないか**（新規作成は keyboard 直接入力 or `toHaveCount(before+1)` 待ち→`nth`）
- [ ] **best-effort な `.click().catch(()=>{})` で hang を握りつぶしていないか**（存在確認後のみ操作 / 短い timeout 明示 / そもそも閉じない）
- [ ] 各 test に「終了条件」に対応する assertion があるか
- [ ] 中間観測点が assertion または明示コメントで表現されているか
- [ ] 破壊的・自己完結シナリオに teardown（**UI 経路・削除は best-effort・ユニーク名・認証済み `newContext`・末尾に「消えたこと」の検証アサート**）があるか
- [ ] Step2 で除外と決まっていないのに `test.skip` で眠らせていないか（除外は生成しない／自己完結は teardown 付きで生成）

### 機械実行ゲート（必須・落ちたら直す）

自己点検の最後に、**「コンパイル＝走らせられる状態」を収束ループへ渡す前に保証する**。green を保証するものではなく、型エラー・import ミス・test 構文崩れ・タグ記法破綻を収束ループの実走前に潰す位置づけ。落ちたら直してから収束ループへ。

```bash
# 必須: 全 spec をトランスパイル＋import解決＋test収集（ブラウザ非起動）
pnpm exec playwright test --list

# 任意: tsconfig.json が存在する場合のみ型検査
pnpm exec tsc --noEmit
```

コンパイルが通ったら、次の**収束ループ**へ進む（静的生成はここで終わり）。

## 収束ループ（認証確立 → 実走 → 探索 → 修正）

静的生成した spec は憶測込み（`@guessed` 多数）で、**そのままでは通らない前提**。憶測で書いた E2E をまず通らないものとして扱い、**ここで実画面を探索しながら自律で潰し、N 回試しても通らない残差だけ Step4 へ渡す**。修正ごとの人間承認は挟まない（静的生成の自己点検が無ゲートなのと同じ＝ループは自律）。

### 入口: 認証を一度だけ確立する（Step3 唯一の人間タスク）

収束ループに入る前に、`.env` の `E2E_AUTH_MODE`（Step1 で確定）で分岐して認証状態を**一度だけ**作る。**これが Step3 で唯一の人間タスク**。従来 Step4 直前に置いていた state 採取・資格情報投入をここへ前倒しした——**「Step3 は人間タスクゼロ」という現行原則はここで意図的に放棄する**（憶測を実走で潰すには、実画面とログイン済み state が収束ループ中に要るため。トレードオフ合意済み）。

- **`none`（認証不要）** → 何も依頼せず即ループへ。
- **`form`（メール＋パスワード）** → `.env` の `E2E_USER`/`E2E_PASS` 投入をユーザーに依頼する（**シークレットはエージェントが書かない**／セットアップが空欄＋コメントで残してある／一貫した例外）。投入後 `auth.setup.ts` が自動ログインして `e2e/.auth/<role>.json` を採取する。
- **`prebuilt-state`（SSO/OTP/2FA 等）** → CDP 経由で実ブラウザのログイン済みセッションを採取する。**この採取手順は収束ループ入口が所有する**（旧 Step4 から移設）。**ここはエージェントが主導する**：Chrome 起動・ポート確認・採取コマンド実行はエージェントが行い、**ユーザーに頼むのはログインだけ**。`e2e/.auth/<role>.json` が採取されるまで実走に進まない。
  - **二系統を並行させる（探索=生ブラウザ / 実走=storageState）**: 採取後もこの debug Chrome（:9222）は**収束ループ中は閉じない**。ループ中の chrome-devtools 探索は `connectOverCDP` でこの**生ブラウザに attach** し、test 実走の Playwright runner は採取済み `e2e/.auth/<role>.json`（storageState）を使う。ログイン済み実画面を観測しながら、実走は再現性のある storageState で回す。

  **採取手順（エージェント実行）:**

  1. **`scripts/save-state-cdp.ts` が最新版か確認する。** scaffold は既存プロジェクトに再配置されない（`playwright.config.ts` がある場合は上書きしない）ため、古いコピーが残っていることがある。**失敗メッセージが「cookie/localStorage/IndexedDB すべて0件」ではなく「Cookie が0件」とだけ出るなら旧版**（IndexedDB 非対応 → Firebase 等トークンを IndexedDB に置くアプリで必ず失敗）。その場合 `${CLAUDE_PLUGIN_ROOT}/scaffold/scripts/save-state-cdp.ts` の内容で上書きしてから採取し直す（未配置なら `cp -r "${CLAUDE_PLUGIN_ROOT}/scaffold/scripts" ./scripts`）。

  2. **`9222` の使用状況を確認する。**`pgrep -fl "remote-debugging-port=9222"`。
     - **未使用** → 次の3でエージェントが debug Chrome を起動する。
     - **既に稼働中** → 起動し直さず再利用する（この Chrome は他者所有なので後で閉じない／手順6の対象外）。

  3. **エージェントが debug Chrome をバックグラウンド起動し、対象URL（`.env` の `E2E_BASE_URL`）を最初から開く。** Chrome 111+ は `--remote-allow-origins` 必須、zsh では `*` をクオート。macOS 以外はバイナリのパスを読み替える。
     ```bash
     "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
       --remote-debugging-port=9222 --remote-allow-origins='*' \
       --user-data-dir=/tmp/e2e-cdp-profile "<E2E_BASE_URL>"
     ```
     （既存の普段使い Chrome は**閉じなくてよい**。別 `--user-data-dir` の独立インスタンスとして起動する。）その後 `curl -s http://localhost:9222/json/version` でポート稼働を確認する。

  4. **ユーザーに頼むのはログインだけ。**「起動した窓で対象にログインし、**対象ページを開いたままにしてください**（タブを閉じない・別サイトへ移動しない）。済んだら教えてください」と促す。採取は対象タブを reload して origin を観測するため、**ログイン後にそのタブが開いている**ことが必須。

  5. **ユーザーの合図後、エージェントが採取コマンドを実行する。**`E2E_VERIFY_HOST` は `E2E_BASE_URL` のホストから導出、`E2E_STATE_OUT` はロール名。成功表示は保存場所別内訳（例 `cookies: 0 / localStorage: 1 / indexedDB: 4 (firebaseLocalStorageDb)`）。
     ```bash
     E2E_CDP_URL="http://localhost:9222" \
     E2E_STATE_OUT="e2e/.auth/user.json" \
     E2E_VERIFY_HOST="app.example.com" \
     pnpm exec tsx scripts/save-state-cdp.ts
     ```
     **複数ロールが要るなら**、同じ窓でログインし直してもらい `E2E_STATE_OUT` を変えて 4→5 を反復する（再起動・再ログイン不要）。

  6. **収束ループ中はこの Chrome を閉じない**（探索が `connectOverCDP` で attach するため）。**全ロールの採取・検証が済み、収束ループ自体が完了してから閉じる**（手順3で自分が起動した場合のみ。手順2で再利用した既存 Chrome は閉じない）。

  > **`connectOverCDP` は IndexedDB を取れない、ではない。** 採取前に対象タブを reload しさえすれば `firebaseLocalStorageDb` 等の IndexedDB まで掬える（reload はスクリプトが自動で行う）。reload せず origins=0 を見て「CDP の限界」と早合点して Firebase Admin SDK 等へ切り替えない。`save-state-cdp.ts` が「cookie/localStorage/IndexedDB すべて0件」を出すのは、対象タブが開いていない／未ログインのときだけ。

### 初回フルラン → 落ちたものだけループ（コスト抑制）

認証確立後、**まず全テストを1回流す**。

```bash
pnpm exec playwright test e2e/tests/<feature>.spec.ts
```

- **green のテストは確定**する（そのテスト内の `@guessed` を外す）。
- **落ちたテストだけ**を収束対象にする。N=3 は「最初から3回」ではなく「**初回失敗テストに追加で最大3回**」。基本7観点なら最悪 7×3=21 巡だが、初回 green 分と後述バックストップで実用域に収まる。

### ループ本体（落ちたテスト1本＝1サブエージェント・直列）

**落ちたテスト1本につき1サブエージェントを直列に切り出す**（`general-purpose` 等、**chrome-devtools MCP + Playwright MCP + Edit + Bash が使える型**）。直列の理由は (a) 破壊的シナリオの `serial` 競合、(b) 同一 spec ファイルの並列編集衝突。**重い snapshot/run_code の出力はサブエージェント内に留め、オーケストレータには「収束したか（最小 diff）／残差か（診断要約）」だけを返させる**（コンテキスト肥大の防止）。

**1 attempt = 次の1巡**（test ごと最大 N=3・既定3・設定可能）:

1. **診断（chrome-devtools MCP）** — `take_snapshot` で a11y ツリー、`list_network_requests` / `list_console_messages` で**実画面の現状・本当の動線・正しい期待値**を観測する。軽量なのでループ毎回の起点。memory「実サイト探索は chrome-devtools MCP 優先（軽量）」に合致。
2. **焼く前検証（Playwright MCP）** — `browser_run_code_unsafe` の `async (page) => {...}` で、修正案の `getByRole(...)` が**一意に解決するか**・遷移 assert が効くかを **spec へ反映する前に1回試す**。`browser_snapshot` で正しい role/name ロケータの ref を採取できる。これで「外し修正」を spec に焼く前に弾く。
   > 注: 現行 Playwright MCP に「テスト生成専用ツール」は無い。作成支援の実体は `browser_snapshot`（正しい role/name ロケータ採取）と `browser_run_code_unsafe`（ライブ検証）の2つ。
3. **spec 最小修正（Edit）** — 検証で通ったロケータ・待機・期待値**だけ**を最小差分で spec に反映する。
4. **実走（Bash）** — `pnpm exec playwright test --grep "<そのtest>"` でそのテストだけ実走する。

### 出口（test ごとに3分類）

- **(a) 収束** — 実走 green になった → そのテスト内の **`@guessed` を外し確定**する。
- **(b) N 尽き** — 要素は実在するのにロケータ／待機をどう変えても N 回（既定3）で通らない → **残差化**する（`@guessed` を**残したまま**）。EPT／プロンプト改善行き。Step4 がこの残存マーカーで拾う。
- **(c) 途中離脱（attempt を消費しない）** — chrome-devtools 観測で次が判明したら、**attempt を消費せず即差し戻す**:
  - 計画した動線／要素が**実画面に存在しない**（plan/map の漏れ）→ **plan・e2e-map へ差し戻す**。
  - **state 失効・seed 不整合**（前提データの問題）→ **seed・env へ差し戻す**。
  - 推測で `goto` 直行やロケータ捏造をして無理に通さない（それは破壊事故・偽 green の元）。

### コスト抑制とバックストップ（暴走防止）

1. **初回フルラン → 落ちたものだけループ**（上記）。
2. **(c) 早期離脱は attempt 非消費**（plan/seed 起因の失敗で N を空費しない）。
3. **1テスト＝1サブエージェント直列**で重い出力を隔離（上記）。
4. **スイート全体のバックストップ上限（既定 = テスト数 × 3）** を置く。累計 attempt がこれを超えたら、残りは探索せず **Step4 残差へ流す**。

### @guessed の寿命（再掲・重要）

`@guessed` は「実画面未観測」の生存フラグ。**(a)収束で外し、(b)残差では残す。** Step4 はこの残存マーカーで残差集合を機械的に拾うので、**収束したのに外し忘れると Step4 が誤って残差に数える**。外し漏れ・付け漏れに注意する。

### 収束ループの N=3 は flaky 再評価とは別物（混同しない）

この収束ループの N=3 は**「通すために直す」反復**（修正を挟む）。Step4 の **flaky 再評価（同一条件・無修正で3回）** は**「通った重要シナリオの安定性確認」**で、**別物**。収束ループで直したテストを「3回流したから安定」と読み替えない——安定性確認は Step4 が**無修正**で行う。

完了したら Step4（`e2e-run`）へ。**渡すのは「収束済みスイート＋残差（残 `@guessed` を含む失敗テスト）の一覧」**。認証は既に確立済みなので、Step4 は人間タスクを原則出さない（state 失効時の再採取のみ）。
