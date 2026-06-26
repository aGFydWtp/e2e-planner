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

---

## クロススキル観察
- **P1（未確認の繰り越し）は codegen でも再現しうる**: plan に「仕様未確認・要確認」が残っているとき、codegen がそれを推測で assert 化しないか（toBeVisible で断定する等）を CE 系で監視する。
- **P4 の教訓**: 上流成果物（map/plan）のフレーミングが下流 executor の判断を強く規定する。codegen 評価でも fixture（plan）の決定明示度が結果を左右する点に注意（codegen-edge は決定を焼き込み済みなので影響は限定的）。
- **P1 は map では再現しなかった（positive）**: spec で問題化した「未確認の繰り越しを各自の裁量で補完」が、map/iter1（edge）では本文の「未確認明記＋ask-don't-guess（価値を推測で決め打ちしない）」条項により裁量なくルール駆動で処理された（ME1/ME2 critical ○）。→ P1 系の懸念は map 本文側では既に内在的に解消済み。
- **実検証由来 critical アンカーのクロス生存**: run/iter1（edge）で、CE2/CE6（実検証の削除メニュー未発火＝teardown toHaveCount(0)）と verify-auth findings（SSO storageState 失効・コピー不可）が、run 本文の明示ルールにより白紙読みで正しく分類・ルーティングされた（RE1/RE2 ○）。executor は「前提データ不整合と誤分類したい誘惑」を自己申告で明示しつつ本文ルールに従って抗った＝**本文に実知見を明文で焼き込む戦略が下流の白紙読みでも効く**ことの再確認。

## map/run 総括（iter1 収束）
- map / run とも **baseline（Iter-1）で critical 全○・正答率100%・新規失敗パターンゼロ**＝早期収束。本文ロジックは無編集（map は description のみ M1 補強）。spec/codegen が baseline で P1/P3/C1 の class-level defect を出したのと対照的に、map/run は本文に実知見が既に明文化されていたため白紙読みで生存した。
- 監視のみ: **M-INV**（map・推測行の透明化補完）/ **R-OVL**（run・actionability の分類二義性）。いずれも実害ゼロで本文 defect でない。
