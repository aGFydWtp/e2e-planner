# map-median-input（doc-driven・ライブ探索なし）

> このファイルは e2e-map の EPT 評価 fixture。executor には「対象機能の入力源（PRD 抜粋＋ルート定義＋seed test）」としてそのまま手渡す。
> ライブ探索は行わない設定（doc/コードから素材が十分取れる素直なケース）。価値は PRD に明文化されている。

---

## 対象機能

feature-name: `expense`（経費精算アプリの「申請〜承認」フロー）
対象URL: `https://expenses.internal.example.com`

## 入力源1: PRD 抜粋（`docs/prd/expense.md`）

> **このプロダクトの目的**: 従業員が経費を申請し、承認者が承認することで、月次の経費精算を紙・メールなしで完結させる。
>
> **中心的な成果**: 「従業員が経費申請を提出 → 承認者が承認 → 申請が『精算済み』になる」までが1本通ることが、この製品の価値が成立している状態である。
>
> **主要ユーザー**:
> - 一般従業員（employee）: 自分の経費を下書き・提出・取り下げできる。
> - 承認者（approver）: 部下の提出済み申請を承認 / 差し戻しできる。
> - 未ログインユーザー: ログイン画面のみ。
>
> **スコープ外（今回）**: 会計システムへの連携バッチ、CSV エクスポート、外部メール通知の実送信。

## 入力源2: ルート定義（`src/router.tsx` 抜粋）

```tsx
const routes = [
  { path: "/login", element: <LoginPage /> },                 // email+password フォーム
  { path: "/", element: <DashboardPage />, loader: requireAuth },     // 申請一覧
  { path: "/expenses/new", element: <ExpenseFormPage />, loader: requireAuth },
  { path: "/expenses/:id", element: <ExpenseDetailPage />, loader: requireAuth },
  { path: "/approvals", element: <ApprovalsPage />, loader: requireApprover }, // approver のみ
];
```

認証は `requireAuth`（email+password の form ログイン。セッション cookie）。`requireApprover` は role=approver でないと `/` へリダイレクト。

## 入力源3: 既存 seed test（`e2e/examples/login.spec.ts`）

```ts
test("従業員でログインできる", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill("employee@example.com");
  await page.getByLabel("パスワード").fill("pw-employee");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "経費申請一覧" })).toBeVisible();
});
```

seed データ: `employee@example.com` / `approver@example.com`、既存の下書き申請1件（「タクシー代 1,200円」/ status=draft）。

## 入力源4: 画面メモ（PRD 補遺・挙動）

- **ダッシュボード（`/`）**: 自分の申請が status 別（下書き/提出済み/承認済み/差し戻し）に一覧表示。「新規申請」ボタンあり。読み込み時に `GET /api/expenses` を待つ。
- **新規申請（`/expenses/new`）**: 金額・費目・日付・領収書添付。必須=金額と費目。「保存（下書き）」と「提出」の2ボタン。
  - 「提出」を押すと `POST /api/expenses`（status=submitted）→ 承認待ちになり一覧へ戻る。
  - 必須未入力で提出 → インラインのバリデーションエラー（送信されない）。
- **申請詳細（`/expenses/:id`）**: 下書き状態なら「削除」ボタンあり → 確認ダイアログ → `DELETE /api/expenses/:id` で一覧から消える。提出済みなら「取り下げ」。
- **承認画面（`/approvals`）**: approver が提出済み申請を「承認」/「差し戻し」。employee には導線が出ない（権限差分）。
- **非同期**: 一覧読込・保存・削除・承認はいずれも API 応答待ちがあり、完了までボタンは二重押下防止で disabled になる（仕様上）。
- **エラー系**: セッション切れで保護ルートにアクセス → `/login` へリダイレクト。
