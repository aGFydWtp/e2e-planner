# E2E Plan: login

> 生成日: 2026-06-25 / 入力源: 実サイト探索(chrome-devtools) + seed test
> 対象URL: http://localhost:3000/login
> 認証: 要 / 方式=form(email+password) / ロール=未ログイン・user・admin / 探索=user で手動ログイン済みセッションに乗って実施
> 環境変数: E2E_BASE_URL, E2E_AUTH_MODE=form, E2E_USER/E2E_PASS（user）, E2E_ADMIN_USER/E2E_ADMIN_PASS（admin・S8 の対を作るとき）

## 遷移マップ

### 前提データ / 環境
- **認証戦略**: storageState 前提。`login.setup.ts` が user でログインし `STORAGE_STATE`（既定 `e2e/.auth/user.json`）を作る。
  各テストは state で開始し、ログイン操作は踏まない。**ログインフロー検証(S1〜S3,S7)だけ未ログイン開始**で書く。
- 必要なシードデータ: 有効ユーザー `user@example.com` / 管理者 `admin@example.com`
- 投入手段: なし（固定 seed を読むだけ。本 feature はデータを作らない）
- ロール別テストアカウント数: user=1 / admin=1
- 同一アカウント同時操作で壊れる状態: なし（ログインと閲覧のみ）
  並列度を上げるときは `E2E_USER_POOL` に同ロールのアカウントを足す（アカウント数が並列度の上限）。
- 除外範囲: パスワードリセットのメール送信実体、外部IdP（SSO）

### 画面・遷移表

| # | 画面 | 到達操作 | 分岐条件 | 非同期イベント | 期待結果 | 確認状況 |
|---|------|----------|----------|----------------|----------|----------|
| 1 | ログイン画面 | `/login` へ遷移 | - | - | フォーム表示 | 確認済 |
| 2 | ダッシュボード | 有効な認証で submit | 認証成功 | `POST /api/login` 応答待ち。再読込時は `GET /api/me` でセッション復元 | 一覧表示 | 確認済 |
| 3 | エラー表示 | 不正な認証で submit | 認証失敗(401) | `POST /api/login` 応答待ち | エラーメッセージ | 確認済 |
| 4 | 検証エラー | 空のまま submit | クライアント検証 | なし（API未呼出） | 検証メッセージ | 確認済 |
| 5 | 管理者ダッシュボード | 管理者で認証 | role=admin | 認証応答待ち | 管理メニュー表示 | 未確認 |

### 未確認・要レビュー
- 管理者ロール時の追加メニュー（#5）は seed の admin で要確認
- ネットワーク遅延時のローディング表示の有無

## シナリオ仕様

> 観測点 ID: 開始状態の確認 `PRE` / 操作 `O<k>` / 中間観測点 `CP<k>` / 終了条件 `END`。
> spec は `test.step('S<n>-PRE …')` 等で同じ ID を刻む（`login.spec.ts` 参照）。
> `exec` は全件 `light`（60s 以内・重い非同期やファイル往復なし・共有データへの書き込みなし）。
> `data`: 本 feature は固定 seed のユーザーを読むだけで、データを作らない（setup=`seed` / own=`shared` / teardown=`none`。共有データへの書き込みなし。前提データ自体が不要な S2/S6 は setup=`none` / own=`self`）。

### S1. ログイン成功（happy path）
- **coverage**: class=`happy` / role=`guest` / status=`active` / exec=`light`
- **data**: setup=`seed` / own=`shared` / teardown=`none`
- **遷移マップ参照**: map#1,#2
- **開始状態**: 未ログイン / 有効ユーザー存在 / `/login`
- **開始状態の確認（precheck）**: `/login` に留まり「ログイン」ボタンが表示される（state が残っていれば `/dashboard` へ流れるので `[precheck]` で落とす）
- **操作**:
  1. メールアドレスに `user@example.com` を入力
  2. パスワードに `password` を入力
  3. 「ログイン」を押下
- **中間観測点**:
  - CP1: `POST /api/login` が成功応答を返す（操作前に応答待ちを仕掛ける）
- **終了条件（END）**: `/dashboard` へ遷移し、ダッシュボード見出しと「user@example.com」表示
- **除外事項**: パスワードリセット導線

### S2. 必須項目未入力（validation error）
- **coverage**: class=`validation` / role=`guest` / status=`active` / exec=`light`
- **data**: setup=`none` / own=`self` / teardown=`none`
- **遷移マップ参照**: map#4
- **開始状態**: 未ログイン / `/login`
- **開始状態の確認（precheck）**: S1 と同じ
- **操作**:
  1. 空のまま「ログイン」を押下
- **中間観測点**:
  - CP1: `/api/login` は呼ばれない（否定観測なので END の検証メッセージ表示を待った後に判定する）
- **終了条件（END）**: 「メールアドレスを入力してください」が表示され `/login` に留まる
- **除外事項**: -

### S3. 不正な認証（permission/認証失敗）
- **coverage**: class=`permission` / role=`guest` / status=`active` / exec=`light`
- **data**: setup=`seed` / own=`shared` / teardown=`none`
- **遷移マップ参照**: map#3
- **開始状態**: 未ログイン / `/login`
- **開始状態の確認（precheck）**: S1 と同じ
- **操作**:
  1. 有効なメールアドレスと不正なパスワードを入力
  2. 「ログイン」を押下
- **中間観測点**:
  - CP1: `POST /api/login` が 401 を返す
- **終了条件（END）**: 「メールアドレスまたはパスワードが違います」表示、`/login` に留まる
- **除外事項**: アカウントロックの回数制御

### S4. 戻る操作
- **coverage**: class=`back` / role=`user` / status=`needs_review` / exec=`light`
- **data**: setup=`seed` / own=`shared` / teardown=`none`
- **遷移マップ参照**: map#2
- **開始状態**: storageState=user で `/dashboard`（ログイン操作は踏まない）
- **開始状態の確認（precheck）**: `/dashboard` に留まり、ダッシュボード見出しが表示される
- **操作**:
  1. ブラウザの戻るを押下
- **中間観測点**: -
- **終了条件（END）**: 未確定。「`/dashboard` に留まる」か「`/login` へ正しくリダイレクト」のどちらが仕様か要確認（確定後 `status=active` に上げて spec を生成する）
- **除外事項**: -

### S5. 再読込
- **coverage**: class=`reload` / role=`user` / status=`active` / exec=`light`
- **data**: setup=`seed` / own=`shared` / teardown=`none`
- **遷移マップ参照**: map#2
- **開始状態**: storageState=user で `/dashboard`（ログイン操作は踏まない）
- **開始状態の確認（precheck）**: `/dashboard` に留まり、ダッシュボード見出しが表示される（失効なら `[precheck]`）
- **操作**:
  1. ページをリロード
- **中間観測点**:
  - CP1: `GET /api/me` が成功応答を返す（セッション復元）。再読込前後で表示が同じなので、応答待ちを**リロード前**に仕掛けて確定させる
- **終了条件（END）**: ログイン状態が保持され `/dashboard` 表示、見出しと「user@example.com」表示
- **除外事項**: -

### S6. 途中離脱
- **coverage**: class=`abandon` / role=`guest` / status=`needs_review` / exec=`light`
- **data**: setup=`none` / own=`self` / teardown=`none`
- **遷移マップ参照**: map#1
- **開始状態**: `/login` でメールのみ入力
- **開始状態の確認（precheck）**: S1 と同じ
- **操作**:
  1. 別ページへ遷移し `/login` に戻る
- **中間観測点**: -
- **終了条件（END）**: 未確定。入力途中値を保持するかどうかの仕様が未確認（保持しないなら「空に戻る」を END にして `status=active` に上げる）
- **除外事項**: -

### S7. ネットワーク遅延（happy path の遅延版）
- **coverage**: class=`network` / role=`guest` / status=`active` / exec=`light`
- **data**: setup=`seed` / own=`shared` / teardown=`none`
- **遷移マップ参照**: map#2
- **開始状態**: 未ログイン / `/login` / `/api/login` の応答を「ローディング観測が済むまで」保留にモック（固定 3s 遅延にしない）
- **開始状態の確認（precheck）**: S1 と同じ
- **操作**:
  1. 有効な認証情報を入力
  2. 「ログイン」を押下
- **中間観測点**:
  - CP1: 応答までローディングインジケータが表示され続ける、ボタンは二重押下不可（観測後に応答を解放）
- **終了条件（END）**: 応答後 `/dashboard` へ遷移し、見出し表示後にローディングが消える
- **除外事項**: タイムアウト時のリトライUI

### S8. 権限差分（permission / user に管理メニュー非表示）
- **coverage**: class=`permission` / role=`user` / status=`active` / exec=`light`
- **data**: setup=`seed` / own=`shared` / teardown=`none`
- **遷移マップ参照**: map#5
- **開始状態**: storageState=user で `/dashboard`
- **開始状態の確認（precheck）**: `/dashboard` に留まり、ダッシュボード見出しが表示される
- **操作**:
  1. ダッシュボードのナビゲーションを確認
- **中間観測点**:
  - CP1: ユーザー名 `user@example.com` が表示される（描画完了の陽性ランドマーク。END の否定アサートより先に待つ）
- **終了条件（END）**: 「管理メニュー」リンクが**表示されない**（admin 側は admin ロールの state を用意し、別 project（storageState=admin）で「表示される」対を検証）
- **除外事項**: 管理機能の各操作の中身
