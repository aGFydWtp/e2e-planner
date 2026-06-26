# map-edge-input（recorded-exploration・SSO・無人）

> このファイルは e2e-map の EPT 評価 fixture。executor には「対象機能の入力源」としてそのまま手渡す。
> ライブ探索の代わりに、**録画した探索トランスクリプト**（chrome-devtools の take_snapshot 相当の ARIA ダンプ＋navigate 結果の列挙）と**断片 doc**を inline で渡す。**無人**（ユーザーに追加質問しても回答は返ってこない条件）。
> 仕込み: (a) admin 系は snapshot 取得できず未探索 / (b) 中心価値は文章で書かれていない / (c) 破壊的操作は観測点のみ（実行していない）。

---

## 対象機能

feature-name: `workspace`（社内コラボレーション Web アプリの一部）
対象URL: `https://app.collab.example.com`

## 断片 doc（取れた範囲・構造情報のみ）

`README.md` 抜粋:

> ## 起動
> `pnpm dev` でローカル起動。本番は `app.collab.example.com`。認証は **Okta（SSO）** 経由。ローカルでも Okta dev テナントにリダイレクトされる。
>
> ## ロール
> ロールは Okta グループで管理（`collab-member` / `collab-admin`）。詳細は IT 管理のスプレッドシート参照（リンク切れ）。

`src/routes.ts` 抜粋:

```ts
export const routes = {
  "/spaces": "SpaceListPage",
  "/spaces/:id": "SpaceDetailPage",
  "/spaces/:id/docs/:docId": "DocPage",
  "/members": "MembersPage",        // admin 想定
  "/admin/settings": "AdminSettingsPage",
};
```

> ※ PRD / 仕様 doc は提示されていない。「このプロダクトで何が中心価値か」を述べた文章は doc 中に存在しない。

## 探索トランスクリプト（録画・member で手動ログイン済みセッションに connectOverCDP で接続）

### nav-1: `navigate_page https://app.collab.example.com/`
→ 結果: `302 → https://collab.okta.com/oauth2/...`（未ログイン時）。手動ログイン済みのため最終的に `/spaces` に着地。

### snapshot-1: `/spaces`（take_snapshot）

```
- banner
  - link "Collab"
  - textbox "検索"
  - button "新規スペース"            # 押下した場合の挙動は未確認（実行せず）
  - button "招待"                     # member には表示。クリック未実施
  - img "avatar (member@example.com)"
- main
  - heading "スペース一覧" level=1
  - list
    - listitem: link "Demoスペース" → /spaces/s_001
    - listitem: link "設計レビュー" → /spaces/s_002
- status "3 件のスペース"
```

### nav-2: `click link "Demoスペース"` → `/spaces/s_001`

### snapshot-2: `/spaces/s_001`（take_snapshot）

```
- main
  - heading "Demoスペース" level=1
  - tablist
    - tab "ドキュメント" selected
    - tab "メンバー"
    - tab "アクティビティ"
  - button "新規ドキュメント"          # 作成導線（実行せず）
  - list "ドキュメント"
    - listitem: link "キックオフ議事録" → /spaces/s_001/docs/d_010
    - listitem: link "要件メモ" → /spaces/s_001/docs/d_011
  - region "読み込み中…"               # GET /api/spaces/s_001/docs の応答待ちで一瞬表示
```

### nav-3: `click link "キックオフ議事録"` → `/spaces/s_001/docs/d_010`

### snapshot-3: `/spaces/s_001/docs/d_010`（take_snapshot）

```
- main
  - heading "キックオフ議事録" level=1
  - toolbar
    - button "編集"
    - button "コメント"
    - button "共有"                    # 共有→外部リンク発行？ 未確認
    - menubutton "⋯"                   # 展開すると「削除」が出る（メニューは開いたが削除はクリックせず）
      - menu
        - menuitem "複製"
        - menuitem "削除"              # DELETE と思われる。実行せず観測のみ
  - article "（本文プレビュー）"
- log: GET /api/docs/d_010 → 200
```

### nav-4: `click button "招待"`（banner 上）

→ ダイアログが開いた。snapshot:

```
- dialog "メンバーを招待"
  - textbox "メールアドレス"
  - combobox "ロール" (member / admin)
  - button "招待を送信"                # POST /api/invites（招待メール送信と思われる）。送信せずキャンセル
  - button "キャンセル"
```

→ `button "キャンセル"` で閉じた（メールは送っていない）。

### nav-5: `navigate_page /members`

→ 結果: 画面は表示されたが **member 権限では一覧が空・「管理者のみ閲覧可」の注記**。中身（実データ・操作導線）は取得できず。

### nav-6: `navigate_page /admin/settings`

→ 結果: **`403 Forbidden`（member 権限）。take_snapshot 取得できず。** 画面構造・操作・分岐とも未取得。

### log（探索中に観測した非同期/エラー断片）

```
- /spaces 初回ロードで GET /api/spaces 応答前にスケルトン表示あり（詳細な role 構造は未取得）
- セッション cookie を消して /spaces に直アクセス → 302 で Okta へ（permission 差分の素地）
- /spaces/s_001/docs/d_010 で「編集」押下後の自動保存/コンフリクト挙動は未探索
```
