---
id: NFR-000
category: <performance | security | availability | …>
measured_by: <パス>    # optional（任意）— テスト以外で計測する場合のみ（負荷試験のスクリプト、CI ジョブの定義など。リポジトリ直下からの相対パス、複数はカンマ区切り）。テストの @covers NFR-000 で検証するなら行を削除する
status: draft          # draft | active | withdrawn（active = 人間承認済み）
---

# NFR-000

> <閾値 + 測定方法。測定方法のない NFR は書かない（R-104）>

<!-- 配置: docs/nfr/NFR-000.md。検証の所在は、テストの @covers NFR-000 か、上の measured_by のどちらか（active なら必須。trace-check C20）。 本文は日本語で書く。 -->
