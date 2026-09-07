# Architecture Decision Records

「後から『なぜこうしたのか』と問われる判断」を残す場所。後戻りコストが高い判断、
他の選択肢を検討して捨てた判断、「これはやらない」と決めたスコープ判断を起票する。
実装の細部（命名・ファイル分割の粒度）や可逆で影響範囲の小さい選択は書かない。

`claudedocs/` は開発アーティファクト置き場であり、プラグインの配布物ではない（README 参照）。
ADR も出荷物ではないが、**参考記事の製品名・固有スタック名・記事 URL・個別プロジェクトの
画面文言は書かない**（出荷物と同じ制約。一般的な技術名は可）。

## 運用

- ファイル名: `NNNN-<slug>.md`（4桁連番 + 英小文字ケバブケース）。連番は既存の最大値 + 1。
  既存の番号を再利用しない
- 書式は adr-tools / adrs 互換ヘッダ + MADR minimal 本文（下記テンプレート）。
  ヘッダの行順と `## Status` 節の 1 行目（`Proposed` / `Accepted` / `Deprecated` /
  `Superseded` / `Rejected` の 1 語）は adrs が読むので崩さない
- `Deciders:` は `Date:` の直後に置き、`## Status` 節の中に書かない
- 既存 ADR の本文は書き換えない。決定が変わったら新しい ADR を起票し、旧 ADR の
  `## Status` 節だけを `Superseded` + 空行 + `Superseded by [N. タイトル](NNNN-slug.md)` にする
- traceability は PR → ADR の一方向。ADR に PR URL を書かない

## テンプレート

```markdown
# N. <決定の要約（体言止め）>

Date: YYYY-MM-DD
Deciders: <判断した人・エージェント>

## Status

Accepted

## Context and Problem Statement

<何を決める必要があったか。1〜3段落>

## Considered Options

- <選択肢A>
- <選択肢B>

## Decision Outcome

選んだのは **<選択肢A>**。

理由: <なぜ。捨てた選択肢の何が問題だったか>

### Consequences

- Good, because <良い点>
- Bad, because <悪い点・受け入れたコスト>

## Links

- 関連 plan: <`claudedocs/plans/<slug>-plan.md` または「なし」>
- 関連 spec: <`.kiro/specs/<feature>/` または「なし」>
```
