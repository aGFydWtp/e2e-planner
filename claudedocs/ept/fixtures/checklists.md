# 要件チェックリスト（事前固定・後で動かさない）

判定方針:
- **成果物そのもの（plan.md / .spec.ts）を判定**する。本文のオウム返し・「自己点検した」という申告は数えない。
- 成功○ = **[critical] 全○のときのみ**。正答率% = 満たした項目 / 総項目。
- [critical] は **実 Asana 検証で実際に壊れた外部グラウンドな失敗モード**、または当該スキルの定義責務にアンカーする。
- 各 iter でこのリストは固定。改訂が要るほどの設計欠陥が出たら、その旨を eval に記録した上で**次バージョンとして別表**に切り、過去 iter は旧表で再掲する（遡及改訂しない）。

---

## e2e-spec

### spec-median（login / form認証）
| # | 項目 | 種別 |
|---|------|------|
| SM1 | form認証なので「ログイン成功/検証エラー/401」のログインフロー群を**未ログイン開始（storageStateなし）**で起こし、かつ認証前提シナリオ（再読込/権限差分等）は**開始状態に storageState=role を明記しログイン操作を操作列に書いていない** | **critical**（認証=前提条件 vs シナリオ の定義責務） |
| SM2 | 7網羅クラス（happy/validation/permission/戻る/再読込/途中離脱/遅延）を最低1件ずつ。対象に無いクラスは「該当なし＋理由」明記 | normal |
| SM3 | 各シナリオに必須6項目（開始状態/操作/中間観測点/終了条件/後始末/除外事項）が揃う | normal |
| SM4 | permission差分が role の対比（user非表示/admin表示 等）で表現されている | normal |
| SM5 | 中間観測点が具体（ローディング/URL変化/API呼出有無）で、終了条件（success criteria）が曖昧でない | normal |

### spec-edge（SSO / タスクボード / **無人オーサリング**）
| # | 項目 | 種別 |
|---|------|------|
| SE1 | SSO のため「ログイン成功/検証エラー/401」を**「該当なし（SSOのためログインフロー検証対象外）」と明記**し、ログインフローのシナリオを作っていない | **critical**（SSO自動化はbot検知で弾かれる実知見） |
| SE2 | 無人オーサリングなので破壊的シナリオ（タスク作成→完了→削除）を**除外し「要確認」と明記**（未検証の破壊的テストを自己完結で勝手に書いていない） | **critical**（無人で未検証破壊テストを書かない条項） |
| SE3 | 未ログイン→IdP/ログイン画面リダイレクトを **permission差分として1件**起こしている（SSOでも書ける範囲） | normal |
| SE4 | 招待メール（不可逆・teardown不能）を除外に倒している（自己完結化していない） | normal |
| SE5 | 残りの網羅クラス（happy=閲覧/戻る/再読込/途中離脱/遅延）を非破壊シナリオで最低1件ずつ起こしている | normal |
| SE6 | 破壊的シナリオを一括（表等）で扱い1件ずつ逐次判断していない／各シナリオに必須項目が揃う | normal |

---

## e2e-codegen

> 注: codegen 本文の「生成後の自己点検」項目と重なるが、ここでは**生成された .spec.ts のコードが実際にその性質を満たすか**を判定する（チェックリストを書いたか・復唱したかは測らない）。これは循環ではなく、実失敗モードを成果物で測る正攻法。

### codegen-median（login / form認証 / 承認済みフル plan）
| # | 項目 | 種別 |
|---|------|------|
| CM1 | 固定待機 `waitForTimeout` を使わず web-first assertion（`await expect(...).toBeVisible()` 等）で待っている | **critical**（待機不足=flaky の実失敗） |
| CM2 | plan の S1..S8 が test に概ね1対1で対応し、各 test に「終了条件」対応の assertion がある | normal |
| CM3 | ロケータが role/text/label/testid 優先（CSS/XPath は理由コメント付きのみ） | normal |
| CM4 | ログインフロー群(S1/S2/S3/S7)は未ログイン開始（project state を `test.use({ storageState:{cookies:[],origins:[]} })` 等で打ち消す）で書き、認証前提シナリオは state 前提で goto から直接書く（テスト内でログインを踏まない） | normal |
| CM5 | ネットワーク遅延 S7 で `page.route` モックとローディング/二重押下不可の検証がある | normal |

### codegen-edge（SSO / 自己完結破壊シナリオ / 承認済み・決定焼き込み済み）
| # | 項目 | 種別 |
|---|------|------|
| CE1 | **新規作成行を「出現待ちなしの nth()/last()/first()」で掴んでいない**。新規行は keyboard 直接入力か `toHaveCount(before+1)` で件数増加を待ってから特定 | **critical**（実 Asana で `.last()` が既存タスクを改名した破壊事故） |
| CE2 | **破壊的・自己完結 S7 の teardown 末尾に `expect(...).toHaveCount(0)`（作成名が消えたことの検証）がある** | **critical**（削除メニューが実DOMで発火せず残骸が溜まった実知見） |
| CE3 | **teardown が `browser.newContext({ storageState })`（認証済みコンテキスト）から開いている**（`browser.newPage()` でログイン画面に飛んでいない） | **critical**（newPageだとstate無しで削除も検証も失敗する実知見） |
| CE4 | best-effort なバナー閉じを `.click().catch(()=>{})` で書いていない（存在確認後のみ操作 / 短い timeout 明示 / そもそも閉じない） | normal（.click().catch hang で6件全滅の実知見） |
| CE5 | SSO のためログインフロー検証(成功/検証エラー/401)の test を生成していない（plan の「該当なし」に従う）。除外シナリオ（招待メール）を test.skip で眠らせず、そもそも生成していない | normal |
| CE6 | 削除クリック self は try/catch で best-effort（失敗は警告に留める）だが、消滅検証アサートは try/catch の外にある（teardown失敗を隠さない）／作成名は timestamp 等ユニーク名 | normal |
| CE7 | ロケータ role/text/testid 優先・`waitForTimeout` 無し・各 test に終了条件の assertion | normal |
