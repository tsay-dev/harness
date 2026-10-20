# ADR の作成（オーケストレーター自身が書く）

設計判断はあなたが Architecture Decision Record として記録します。判断の文脈はあなたの作業コンテキストにあり、別 agent に渡すと要約で失われます。典型的な契機は、スキーマゲートで承認された保証点、ルールの強制箇所、フレームワークやテスト戦略の選択、過去の判断の置き換えです。本文は `traceconfig.json` の `policy.language`（未宣言なら日本語）、節見出しはテンプレートのままです。

`applyTo: docs/**` は `docs/adr/` に一致するので、あなたが [docs.instructions.md](../../../instructions/docs.instructions.md) の受け手です。書く前に読みます。

- **決着した判断だけを書く。** ADR は判断を決める場所ではありません。判断、トレードオフ、検討した選択肢が未確定なら人間に尋ね、テンプレートを埋めるために捏造しません。人間が受け入れていない判断は `status: proposed` で始めます。複数の判断が混在していたら分割します。
- **テンプレート**は `${HARNESS_ROOT}/templates/develop/ADR.md`、ファイルは `docs/adr/ADR-nnnn-<slug>.md`（slug は小文字 kebab-case、接頭辞は frontmatter の `id` と一致）。
- **採番**は `node "${HARNESS_ROOT}/tools/trace-check/trace-check.mjs" --next adr`。ディレクトリ一覧から推測せず、番号を飛ばさず、再利用しません。
- **却下した選択肢が本質です。** 検討した選択肢をすべて載せ、負けた理由を最低 1 文添えます。悪い結果がゼロの ADR は検討不足です。Decision には判断の強制箇所（型、制約、検査、lint 規則）を明記し、説明文だけで強制する判断は説得による統制（R-901）だと書きます。
- **置き換え**は新しい記録に `supersedes: ADR-nnnn` を書き、古い記録の frontmatter を `status: superseded` にします。古い本文は削除も書き換えもしません（R-802）。
- 書いたら `node "${HARNESS_ROOT}/tools/spec-lint/spec-lint.mjs" validate` と `node "${HARNESS_ROOT}/tools/trace-check/trace-check.mjs" --only C12` を実行し、自ら書いたファイルのエラーを直します。所属するスライスのコミット footer から ADR を ID で参照します（[commit.md](commit.md)）。
