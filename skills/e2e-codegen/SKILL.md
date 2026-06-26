---
name: e2e-codegen
description: E2Eワークフロー Step3。承認済みの Markdown plan を Playwright の .spec.ts へ変換する。ロケータは role/text/testid 優先、非同期は web-first assertion、視覚差分は toHaveScreenshot 併用候補をコメント提案。未出現要素を nth/last/first で掴まない。破壊的・自己完結シナリオは UI経路の teardown（認証済み context・末尾に消滅検証）まで生成する。生成後に selector と assertion を自己点検する。
when_to_use: e2e-spec の plan が承認された後、Playwright テストコードを生成するとき。e2e-plan オーケストレーターの Step3 として。
argument-hint: <feature-name>
---

# Step3: 実行可能コード化（e2e-codegen）

承認済みの `e2e/plans/<feature>.md` を Playwright spec へ変換する。**ロケータ方針・待機方針・視覚方針を生成時点で固定**し、生成の漂流を抑える。

前提: plan が**承認済み**であること（承認ゲート①を通過）。未承認なら変換しない。

## セットアップ確認（初回のみ）

プロジェクトに `playwright.config.ts` が無い場合、scaffold から雛形をコピーするよう案内する:

```bash
cp "${CLAUDE_PLUGIN_ROOT}/scaffold/playwright.config.ts" ./playwright.config.ts
mkdir -p e2e/tests e2e/plans e2e/reports
# package.json に test スクリプトを追記（${CLAUDE_PLUGIN_ROOT}/scaffold/package.snippet.json を参照）
npm i -D @playwright/test && npx playwright install
```

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
6. **SSO / OTP / 2FA で form 自動化できない場合** — `auth.setup.ts` の自動ログインは使えない（SSO は自動化ブラウザのログインを bot 検知で弾く）。**新規ログインせず、既にログイン済みの実ブラウザのセッションを `connectOverCDP` で取り出す**。同梱スクリプト `save-state-cdp.ts` を案内する:
   ```bash
   cp -r "${CLAUDE_PLUGIN_ROOT}/scaffold/scripts" ./scripts
   npm i -D tsx
   # 1) debug ポート付きの実 Chrome を起動（既存 Chrome は閉じる。Chrome 111+ は --remote-allow-origins 必須、zsh では * をクオート）
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --remote-debugging-port=9222 --remote-allow-origins='*' \
     --user-data-dir=/tmp/e2e-cdp-profile &
   # 2) その窓で対象アプリに普通にログイン（webdriver 制御外なので bot 検知に当たらない）
   # 3) 生きたセッションを storageState として吸い出す
   E2E_CDP_URL="http://localhost:9222" \
   E2E_STATE_OUT="e2e/.auth/user.json" \
   E2E_VERIFY_HOST="app.example.com" \
   npx tsx scripts/save-state-cdp.ts
   ```
   ロールごとに `E2E_STATE_OUT` を変えて複数回実行する。API ログインが可能ならそちら（`request.post` でトークン取得→state 注入）でもよい。**この分岐は Step1（e2e-map）の認証方式判定で既に分かっているはず。** state 採取は利用者の手元環境で行う作業で、CI/エージェントからは作れない。
   > **プロファイルをコピーする方式（`save-storage-state.ts`）は SSO では機能しない。** Chrome の Cookie は OS の鍵ストア（macOS Keychain の Chrome Safe Storage）で暗号化されており、別プロセスで開くと復号鍵が違って Cookie 値が壊れ、ログイン画面に戻される。上記の **CDP 接続方式（生きたブラウザの復号済みセッションを取得）が正解**。`save-storage-state.ts` は OS 鍵ストアを使わない環境向けの参考に留める。

## 変換方針（固定）

- **ロケータ**: `getByRole` / `getByText` / `getByLabel` / `getByTestId` を優先。CSS/XPath は最後の手段。
- **未確定要素を index で取らない（破壊的事故の防止）**: **出現待ちをせずに `nth()` / `last()` / `first()` で可変リストの端をつかまない。** 特に「新規作成した行」を取るのに `getByRole('textbox').last()` のように書くと、新規行がまだ出現していない瞬間に**既存の最終行を掴み、その値を上書きして実データを破壊する**（実 Asana で既存タスクを改名する事故が発生）。新規作成の入力先は次のいずれかで特定する:
  - **作成 UI で出る空行のフォーカスへ `page.keyboard.type(...)` で直接入力**（要素を取り直さない）、または
  - **件数の増加を待ってから新規行を特定**: 操作前に件数を控え、`await expect(rows).toHaveCount(before + 1)` で増加を待ってから `rows.nth(before)` を対象にする。この件数ガードは安全な取得であると同時に、`.last()` が既存行を改名した場合は件数が増えないため `toHaveCount` が落ちて**偽陽性（green なのに破壊）を検出する**役目も果たす。
- **待機**: web-first assertion（`await expect(locator).toBeVisible()` など）で待つ。`waitForTimeout` の固定待機は使わない。**重い SPA では `page.goto()` / `page.reload()` の既定 `load` 待ちが長く test timeout に当たりやすい** ので、`{ waitUntil: 'domcontentloaded' }` を指定して描画後の web-first assertion で待つ（読み込み完了の判定は assertion 側に寄せる）。
- **best-effort な `.click().catch(() => {})` で握りつぶさない（hook 全滅の原因）**: バナー閉じ等を `getByRole(...).click().catch(() => {})` のように書いても **`.catch()` は hang を救わない**。要素が actionability（可視・有効・非オーバーレイ）を満たさないと `click` は test timeout（既定30s）までブロックし、`.catch()` が効く前に `beforeEach`/`afterEach` ごとタイムアウトさせて全テストを巻き込む（実検証で6件全滅の直接原因）。代替:
  - **`count()` / `isVisible()` で存在・可視を確認してからのみ操作する**（不在ならスキップ）、
  - どうしても best-effort にするなら **`{ timeout: 1500 }` 等の短い timeout を明示**して hang を防ぐ、
  - **そもそも検証に干渉しない要素は無理に閉じない**（閉じる必要があるか自体を判断する）。
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
    await page.goto('/login');                    // 開始状態
    await page.getByLabel('メールアドレス').fill('user@example.com');
    await page.getByLabel('パスワード').fill('password');
    await page.getByRole('button', { name: 'ログイン' }).click();
    // 中間観測点: ローディング → 遷移
    await expect(page).toHaveURL(/\/dashboard/);   // 終了条件
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
    // 視覚差分が重要なら: await expect(page).toHaveScreenshot('dashboard.png');
  });

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
- [ ] **各 test タイトル（または近接コメント）に Coverage タグ `[S<n> / map#<m>]` があるか**（run の突合用・省略禁止）
- [ ] **各 test に横断 coverage タグ `tag: ['@feature:<slug>', '@class:<slug>', '@role:<slug>']` があり、値が plan の `coverage`（class/role）と一致するか**（audit の集計用・省略禁止／`annotations` ではなく `tag`）
- [ ] **破壊的・自己完結シナリオの describe に `test.describe.configure({ mode: 'serial' })` が付いているか**
- [ ] CSS/XPath ロケータが残っていないか（残すなら理由をコメント）
- [ ] 固定待機（`waitForTimeout`）が無いか
- [ ] **出現待ちをしない `nth()`/`last()`/`first()` で新規行・未確定要素を掴んでいないか**（新規作成は keyboard 直接入力 or `toHaveCount(before+1)` 待ち→`nth`）
- [ ] **best-effort な `.click().catch(()=>{})` で hang を握りつぶしていないか**（存在確認後のみ操作 / 短い timeout 明示 / そもそも閉じない）
- [ ] 各 test に「終了条件」に対応する assertion があるか
- [ ] 中間観測点が assertion または明示コメントで表現されているか
- [ ] 破壊的・自己完結シナリオに teardown（**UI 経路・削除は best-effort・ユニーク名・認証済み `newContext`・末尾に「消えたこと」の検証アサート**）があるか
- [ ] Step2 で除外と決まっていないのに `test.skip` で眠らせていないか（除外は生成しない／自己完結は teardown 付きで生成）

完了したら Step4（`e2e-run`）へ。
