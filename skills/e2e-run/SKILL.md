---
name: e2e-run
description: E2Eワークフロー Step4。生成した Playwright spec を実行し、trace/video/screenshot を収集して、失敗を6分類（ロケータ破損/待機不足/前提データ不整合/期待値誤り/視覚baseline未作成/環境依存）に整理した失敗分類表を出力する。修正は承認後に最小差分で行う。
when_to_use: e2e-codegen で spec ができた後、実行と証跡収集・失敗分類をするとき。修復ループで実行だけ再試行したいとき。e2e-plan オーケストレーターの Step4 として。
argument-hint: <feature-name>
---

# Step4: 実行・証跡収集・失敗分類（e2e-run）

生成した spec を実行し、証跡を残して、**失敗を分類してから**最小修正を提案する。"何が壊れたか" の分類を先に出すことで闇雲な self-heal を防ぐ。

前提: `e2e/tests/<feature>.spec.ts` が存在し、`playwright.config.ts` が設定済みであること。未セットアップなら `e2e-codegen` のセットアップ手順を案内する。

## 実行前の人間タスク（実行直前・`E2E_AUTH_MODE` で分岐）

依存インストール・scaffold 配置・既知の非シークレット `.env` 値は **Step3（e2e-codegen）が自動で済ませている**。ここで残るのは**人間の手元でしかできない作業だけ**。`pnpm exec playwright test` を**走らせる直前に**、`.env` の `E2E_AUTH_MODE`（Step1 で確定）で分岐して、必要な指示だけを just-in-time で提示する。**済むまで実行しない**。

- **`prebuilt-state`（SSO/OTP/2FA 等）** → CDP 経由の state 採取が必要。**ここはエージェントが主導する**：Chrome 起動・ポート確認・採取コマンド実行はエージェントが行い、**ユーザーに頼むのはログインだけ**にする（人間が手元でしかできないのは「実ブラウザでの本人ログイン」だけで、Chrome の起動を手作業させる必要はない）。`e2e/.auth/<role>.json` が採取されるまで `playwright test` は実行しない。

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

  6. **全ロールの採取・検証が済んだら、エージェントが起動した Chrome を閉じる**（手順3で自分が起動した場合のみ。手順2で再利用した既存 Chrome は閉じない）。

  > **`connectOverCDP` は IndexedDB を取れない、ではない。** 採取前に対象タブを reload しさえすれば `firebaseLocalStorageDb` 等の IndexedDB まで掬える（reload はスクリプトが自動で行う）。reload せず origins=0 を見て「CDP の限界」と早合点して Firebase Admin SDK 等へ切り替えない。`save-state-cdp.ts` が「cookie/localStorage/IndexedDB すべて0件」を出すのは、対象タブが開いていない／未ログインのときだけ。

- **`form`（メール＋パスワード入力）** → `.env` の `E2E_USER`/`E2E_PASS` の投入をユーザーに依頼する。**シークレットはエージェントが書かず、ユーザーが手で入れる**（Step3 が空欄＋コメントで残してある／セキュリティ上の一貫した例外）。投入後に実行すれば、`auth.setup.ts` が自動ログインして storageState を採取する。

- **`none`（認証不要）** → 何も出さず即実行。

## 実行

```bash
pnpm exec playwright test e2e/tests/<feature>.spec.ts
```

設定（scaffold の `playwright.config.ts`）により、trace は on-first-retry、video は retain-on-failure、screenshot は only-on-failure で収集される。HTML レポートは `e2e/.report`、生の証跡は `e2e/.artifacts`。

## 失敗の6分類

失敗した test を必ず次のいずれかに分類する（複数該当時は主因＋副次を記す）:

| 分類 | 典型症状 | 修正先 |
|------|----------|--------|
| ロケータ破損 | 要素が見つからない / DOM変更で壊れた | generator / spec（role/text/testid へ） |
| 待機不足 | submit直後にassert / AJAX前に次操作 | generator / spec（web-first assertion） |
| 前提データ不整合 | ログイン状態・権限・DB状態が違う／**storageState 失効・セッション切れ（setup未実行・state期限切れ・サイト側ログアウト）** | seed / environment / auth.setup（prompt では直さない） |
| 期待値誤り | assertion の期待値が仕様と不一致 | spec または plan（仕様の見直し） |
| 視覚baseline未作成 | toHaveScreenshot 初回で baseline 無し | **不具合ではない**。baseline を生成して確定 |
| 環境依存 | タイムゾーン・ロケール・CIのみ失敗 | environment / config |

> **VRT baseline の初回未生成は不具合扱いにしない。** `pnpm exec playwright test --update-snapshots` で baseline を作り、差分の妥当性を人間が確認してから確定する。

> **teardown の「削除クリック警告」は失敗ではないが、「消えたこと」の検証アサート失敗は本物の失敗。** 破壊的・自己完結シナリオの後始末（afterEach/afterAll）で、削除クリック self は best-effort なので `[teardown] cleanup failed ...` の警告に留まり、これは6分類の「失敗」に数えない。**ただし e2e-codegen の規約により、後始末の末尾には「作成名がもう存在しない」ことを検証する `expect(...).toHaveCount(0)` が必ず入る。これが落ちたら『teardown が実機で発火していない（green なのに残骸が蓄積している）』という本物の失敗**なので、「前提データ不整合」ではなく**削除 UI 経路の「ロケータ破損」**として扱い、その削除フローを直す。残骸が出ても作成データは timestamp 付きユニーク名なので、ログの名前で特定して手動掃除すればよい。
>
> **teardown が実機で確立する（検証アサートが安定して green になる）まで、破壊的シナリオを本番類似環境で回さない。** 捨てプロジェクト/捨て環境で teardown 発火を確認してから本番へ向ける（e2e-codegen 参照）。

## Coverage Matrix（plan↔spec↔実行結果の突合）

失敗分類の前に、**何を検証できていて何が欠けているか**を Coverage Matrix で一覧化する。3つの情報源を突合して作る:

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

`e2e/reports/<feature>-<YYYYMMDD-HHmm>.md` に Coverage Matrix・失敗分類表・証跡パスを書く。

```markdown
# E2E 実行レポート: <feature>

> 実行日時: <YYYY-MM-DD HH:mm> / 結果: <N passed / M failed>

## Coverage Matrix

| 遷移map # | scenario | test | 中間観測点assert | 終了条件assert | 証跡 | 結果 |
|-----------|----------|------|------------------|----------------|------|------|
| #2 | S1 ログイン成功 | `logs in with valid credentials` | ✓ ローディング | ✓ /dashboard | trace.zip | pass |
| #5 | S8 権限差分 | （未突合） | 未突合 | 未突合 | - | 未突合 |

## 失敗分類

| test | 分類 | 根拠（trace/video/screenshot） | 提案する最小修正 | 修正先 |
|------|------|--------------------------------|------------------|--------|
| S5 再読込 | 待機不足 | e2e/.artifacts/.../trace.zip | reload後 toBeVisible で待つ | spec |
| S3 視覚 | 視覚baseline未作成 | （baseline無し） | --update-snapshots で生成 | baseline |

## 再評価メモ（Step5 手動用）
- 同一 seed・同一データで再実行した安定性: <N/3 回 pass>
- 繰り返す失敗分類: <...>
```

## 修正（承認ゲート②の後）

失敗分類表を提示し、**ユーザーが修正方針を承認してから**最小差分で直す。分類ごとに修正先が違う（探索不足・状態遷移漏れは plan / e2e-map へ差し戻し、ロケータ・待機は spec、前提データは seed/env）。healer に plan 由来の漏れまで背負わせない。

## 再評価（推奨）

重要シナリオは**同一 seed・同一データ・同一環境で3回**実行し、「何回中何回通るか・どこで落ちるか・同じ分類に収まるか」を見る（flaky 検出）。

## feature 横断の確認は `/e2e-audit`

この Coverage Matrix は**1 feature 内**（当該 plan↔spec↔実行結果）の突合に閉じている。**feature をまたいだスイート全体の不足（class/role の穴・未検証経路・`needs_review` の滞留）を見るには `/e2e-audit` を実行する**。`/e2e-audit` は `plans/ tests/ reports/` をスキャンして `e2e/index.md`（横断スナップショット）を再生成する（`/e2e-plan` の Step4 後に自動実行される。テストは再実行しない）。
