---
description: E2E スイート全体の横断 coverage audit。e2e/plans/ tests/ reports/ をスキャンして feature 横断の不足（網羅クラス/ロールの穴・未検証経路・承認待ち）を算出し、e2e/index.md（派生スナップショット）を生成・上書きする。テストは再実行しない。
argument-hint: （引数不要。e2e/ 配下のスイート全体をスキャンする）
---

# E2E 横断 coverage audit

補足コンテキスト（任意）: $ARGUMENTS

**`e2e-audit` skill** を起動し、`e2e/plans/ tests/ reports/` をスキャンして feature 横断の coverage 不足を算出し、`e2e/index.md` を生成（上書き）する。

- スキャンのみ。**テストは再実行しない**（reports の feature ごと最新を `last_run`/`last_status` としてパースするだけ）。
- 出力は feature 一覧表・class×gap・role×gap・優先 gap 一覧。詳細は skill 本文に従う。
- `e2e/index.md` は手書き台帳ではなく**毎回まるごと上書きされる派生物**。承認ゲートは挟まない。
- `/e2e-planner:e2e-plan` の Step4（run）後にも自動実行される。単独実行は feature を足さずスイート全体を再点検したいときに使う。
