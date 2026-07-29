# EPT 失敗パターン台帳（spec / codegen 共通）

> empirical-prompt-tuning の「失敗パターン台帳」。白紙 subagent が SKILL.md だけを読んで成果物を作ったとき、
> **本文の曖昧さ・暗黙前提・抜け**が原因で踏み外したものを class-level ルールとして積む。
> 各パターンに「Seen in: <skill>/<iter>」タグを付け、spec↔codegen のクロススキル学習を効かせる。
> 出典: mizchi/skills meta/empirical-prompt-tuning。

## 凡例
- **Phase**: Understanding / Planning / Execution / Formatting（自己申告のフェーズタグ）
- **Class-level ルール**: 個別事象ではなく「この種の指示はこう誤読される」という一般化
- **対策**: 本文 diff の方針（具体 diff は <skill>-eval.md に残す）

---

## パターン一覧

| # | パターン（class-level） | Phase | Seen in | 対策の方向 | 状態 |
|---|------------------------|-------|---------|-----------|------|
| P1 | 遷移マップの「未確認」観測点/分岐を spec の中間観測点・終了条件にどう繰り越すか規定が無く、作者ごとに自前ルールで裁量補完（不統一） | Understanding/Execution | spec/iter1（median＋edge 両方） | spec本文に「未確認は推測で断定せず中間観測点/終了条件に『未確認・要確認』と明記しゲート①へ送る」を追記 | ✅ **解消**（spec/iter2 で両fixtureがルール文言を引用・裁量消失） |
| P3 | 無人オーサリング時「除外」の解像度不足（シナリオ枠ごと削除か／枠を残し『要確認』明示か） | Understanding | spec/iter1（edge） | 無人節に「枠は残し『要確認(無人除外)』＋想定teardownを書きゲート①へ／削除しない・承認まで有効化しない」を明文化 | ✅ **解消**（spec/iter2 で枠＋teardown想定付き要確認・「迷い少なかった」と明言） |
| P4 | permission差分を storageState=role 対比でなくログイン帰結で表現 | Planning | spec/iter1（median のみ） | **本文不変**（median fixture の map フレーミング依存。map が対比を明示した edge では正しく表現） | 本文defectでない・監視のみ |
| P2 | 7必須クラスに「401」が無く別節にのみある→クラス割当に迷い | Understanding | spec/iter1（median のみ） | 軽微。単発なら本文不変。codegen でも401帰属の混乱が出るか監視 | 監視のみ |
| C1 | 中間観測点（ローディング/二重押下不可/skeleton）を「アプリ依存」とコメント降格し非アクティブ化。**既知ロケータの toBeDisabled() まで**コメント化し遅延シナリオの中核検証が消える | Execution | codegen/iter1（median CM5 ＋ edge S6 両方） | codegen変換方針に「既知ロケータの観測点は必ず active assert／ローディングは progressbar・status role を第一候補」を追記 | ✅ **解消**（codegen/iter2 で disabled・loading が active 化・中核/非中核を弁別） |
| M-INV | doc/探索が無い領域について、executor が「妥当な次状態」を**推測行として補う**傾向（median でも発生） | Execution | map/iter1（median） | 本文不変。map 本文の「未確認明記・捏造しない」により**「推測」ラベル＋未確認送り**で透明化され実害なし | 監視のみ（透明化されており本文defectでない） |
| R-OVL | 「要素は DOM に在るがオーバーレイで操作不能（actionability 未充足）」のクリック hang が6分類の**「ロケータ破損」「待機不足」どちらにも読める** | Planning | run/iter1（edge S2/S6） | 本文不変。**両分類とも修正先=spec で実害ゼロ**。executor は根拠明示で主因を選び RE3 を満たした | 監視のみ（頻発するなら6分類表に actionability 一文を検討） |
| C2 | 遷移を伴うクリック（URL変化/SPA画面切替）の直後に遷移を assert せず、**まだ遷移前ページのまま次の要素を探して `element(s) not found`**（codegen が `click()` を遷移完了待ちと誤認）。`networkidle` 待ちで塞ごうとすると Playwright 非推奨で flaky 化 | Execution | **実検証由来**（`回答する` クリック後すぐ `次のページへ` を探し agreement のまま落ちた／5件） | codegen 待機方針に「遷移クリック直後は遷移先ロケータを触る前に `toHaveURL`/遷移先固有要素 `toBeVisible` を1行・`networkidle` 不使用」を追記＋self-check／run 6分類「待機不足」に同症状と遷移assert修正を追記 | ✅ **本文焼き込み済**（codegen/run 本文 diff・白紙再検証は次 EPT へ） |
| B-NAV | 価値フロー途中の遷移リンクが今の画面に無いとき、UI 動線を再発見せず **`page.goto()` で直行して journey を飛ばす**（healer が「最短で緑」に倒し、その遷移導線自体の検証が消える）。codegen が入口 goto を推奨していることと境界が未定義だったのが温床 | Planning/Execution | **実検証由来**（SC-01: エディタに `アンケートの基本設定` リンク無→healer が goto 提案／ユーザーが「ヘッダーから実動線で辿れ」と却下） | codegen に「goto は入口（開始状態）と teardown 起点のみ・操作列の途中遷移は UI を辿る」を明文化／run 修正節に「途中遷移リンク破損は goto で飛ばさず実画面探索で動線再発見・goto 許可は入口のみ」を追記 | ✅ **本文焼き込み済**（codegen/run 本文 diff・白紙再検証は次 EPT へ） |

| T-GATE | teardown の消滅検証（`toHaveCount(0)`）が**未ロード状態で自明に通る**。`if (await row.count())` ガードが未ロードの 0 を拾って削除をスキップし、直後の検証も同じ未ロード状態で 0 を返す → **teardown が完全な no-op でも green のまま残骸が蓄積**。codegen:88 の規約と codegen の例コード自身が同型だった（対策 assert の二段目の穴） | Execution | **実検証由来**（実運用feature②＝一覧のCRUD一巡・3 worker の flaky 再評価で全 green のまま残骸1件発生。2 worker のフレッシュ実行では出ず） | codegen 破壊的節に「消滅検証はロード完了ゲートの後段／teardown では行の出現待ちを代用にできない／行スコープの完全一致で数える」を追記＋**例コードを同時修正**。run 側に「全 green ≠ 残骸ゼロ」と残骸スキャンを追加 | ✅ **本文焼き込み済**（codegen/run/例コード・白紙再検証は次 EPT へ） |
| T-PROP | **1本目の feature で発見・修正した教訓が spec のコメント止まりで、SKILL.md に焼かれず2本目で変種として再発**。実運用feature①（共有フロー）の spec コメントに「旧実装の `if (await row.count())` はロード前に 0 を返す false-negative だった」と明記されていたが、その解法（行の出現待ち）は「対象が既に消えている可能性がある teardown」には転用できず、実運用feature② で T-GATE として再発 | Understanding | **実検証由来**（feature 間の伝播失敗） | class-level の教訓は**必ず本文へ**。spec/plan のコメントは当該 feature 内でしか効かない。台帳運用（実知見の本文焼き込み）の存在意義そのものの実証 | ✅ **記録**（T-GATE の焼き込みで対処済み） |
| A-NEG | **否定アサート（`toHaveCount(0)` / `not.toHaveURL` / 「エラーが出ない」）が、前提が成立していないために自明に通る**。画面未ロード・障害注入の未発火のどちらでも成立し、失敗より気づきにくい。T-GATE の上位概念で、既存の件数ガード（codegen:67）・遷移 assert も同原則の実例 | Execution | **実検証由来**（実運用feature②: 消滅検証／S8 の「遷移しない」検証。spec 側は `abortedWrites` カウンタの `expect.poll` で自力回避しコメントに「トリビアルな green の防止」と明記していた） | codegen 変換方針に class ルールとして追記＋自己点検にチェック項目 | ✅ **本文焼き込み済**（codegen・白紙再検証は次 EPT へ） |
| E-REFUT | **実画面には要素も動線もあるが、plan が期待した挙動が実装されていない**（silent failure・検証なし保存・エラー未描画）。収束ループの出口 (a)(b)(c) のどれにも当てはまらず、置き場が無いため処理が作業者依存になっていた（実運用では2 feature で計6件、毎回同じ4点セットで処理していた） | Planning | **実検証由来**（実運用feature① 2件・実運用feature② 4件） | codegen の出口に **(a') 期待の反証で収束**を新設（実挙動を確定アサート化／plan へ書き戻し／要起票の明記／反転コメント）＋濫用ガード。run の成果物に要起票節 | ✅ **本文焼き込み済**（codegen/run・白紙再検証は次 EPT へ） |
| CNT-SCOPE | 「一覧の件数が開始時に戻る」等の**総件数 before/after を終了条件に書くと、並列・共用環境で本質的に flaky** になり Step3 が実装できない → Coverage Matrix に恒久的な「部分」が積もる。**spec が検証できない終了条件を plan に残す**構造的欠陥 | Planning | **実検証由来**（実運用feature② の実行レポート: S2/S5/S8 の終了条件が「部分」判定） | e2e-spec に「件数系は自スコープ（ユニーク名・runId・完全一致）で書く」を追記。run の Coverage Matrix 凡例に「部分」を追加し観測点の1件ずつ突合を明示 | ✅ **本文焼き込み済**（spec/run・白紙再検証は次 EPT へ） |

---

## クロススキル観察
- **P1（未確認の繰り越し）は codegen でも再現しうる**: plan に「仕様未確認・要確認」が残っているとき、codegen がそれを推測で assert 化しないか（toBeVisible で断定する等）を CE 系で監視する。
- **P4 の教訓**: 上流成果物（map/plan）のフレーミングが下流 executor の判断を強く規定する。codegen 評価でも fixture（plan）の決定明示度が結果を左右する点に注意（codegen-edge は決定を焼き込み済みなので影響は限定的）。
- **P1 は map では再現しなかった（positive）**: spec で問題化した「未確認の繰り越しを各自の裁量で補完」が、map/iter1（edge）では本文の「未確認明記＋ask-don't-guess（価値を推測で決め打ちしない）」条項により裁量なくルール駆動で処理された（ME1/ME2 critical ○）。→ P1 系の懸念は map 本文側では既に内在的に解消済み。
- **実検証由来 critical アンカーのクロス生存**: run/iter1（edge）で、CE2/CE6（実検証の削除メニュー未発火＝teardown toHaveCount(0)）と verify-auth findings（SSO storageState 失効・コピー不可）が、run 本文の明示ルールにより白紙読みで正しく分類・ルーティングされた（RE1/RE2 ○）。executor は「前提データ不整合と誤分類したい誘惑」を自己申告で明示しつつ本文ルールに従って抗った＝**本文に実知見を明文で焼き込む戦略が下流の白紙読みでも効く**ことの再確認。
- **C2（遷移assert欠落）と B-NAV（途中遷移 goto 飛ばし）は実運用の修復ループ由来**: EPT の白紙 subagent ではなく、実サイトの spec 実行→承認ゲート②（修正方針）で表面化した（1 passed / 6 failed の主因2種）。台帳方針どおり**本文へ明文で焼き込み済**（codegen 待機方針＋goto 境界、run 6分類＋修正節）。次 EPT サイクルで codegen-edge / run-edge の fixture に遷移クリック・途中遷移ケースを足し、白紙読みで遷移assert／UI動線が再現されるか検証する（C2/B-NAV の「✅」確定は白紙再現をもって）。

## map/run 総括（iter1 収束）
- map / run とも **baseline（Iter-1）で critical 全○・正答率100%・新規失敗パターンゼロ**＝早期収束。本文ロジックは無編集（map は description のみ M1 補強）。spec/codegen が baseline で P1/P3/C1 の class-level defect を出したのと対照的に、map/run は本文に実知見が既に明文化されていたため白紙読みで生存した。
- 監視のみ: **M-INV**（map・推測行の透明化補完）/ **R-OVL**（run・actionability の分類二義性）。いずれも実害ゼロで本文 defect でない。
