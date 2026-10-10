# ADR の作成（オーケストレーター自身が書く）

オーケストレーターであるあなたが Architecture Decision Record を記録します。判断ごとに 1 ファイルを作り、「なぜこの設計や実装を選んだか」を後から追跡できるように残します。adr-writer agent はありません。判断の文脈は既にあなたの作業コンテキストにあるため、自ら記録します。典型的な契機は、スキーマゲートで承認された保証点、ルールの強制箇所、フレームワークやテスト戦略の選択、過去の判断の置き換えです。

> **言語**: ADR 本文（Context、Decision、Consequences、却下した選択肢）は日本語で書き、節見出しはテンプレートのまま維持します。
> `applyTo: docs/**` は `docs/adr/` に一致するため、**あなたが [docs.instructions.md](../../../instructions/docs.instructions.md) の受け手です**。書く前に読んでください（R-802、R-901、R-1001 と「各文書に書いてよいもの」表の ADR 行が適用されます）。

## 決着した判断だけを記録する

- **人間と決着した判断だけを書く。** ADR は判断を決める場所ではありません。判断、トレードオフ、検討した選択肢が未確定または不明なら、**人間に尋ねます。テンプレートを埋めるために選択肢や結果を捏造してはいけません。** 複数の判断が混在していたら ADR を分割します。
- 人間が既に判断を受け入れていなければ、ステータスは `proposed` で開始します。ADR は現在の設計状態（コード、`docs/design.md`、契約が保持するもの）を記録せず、ある時点の判断を記録します。

## 作成の要点

- **テンプレート**: `${HARNESS_ROOT}/templates/develop/ADR.md` を雛形にします。ファイルは `docs/adr/ADR-nnnn-<slug>.md`（slug は小文字の kebab-case。ファイル名の接頭辞は frontmatter の `id` と一致）です。
- **採番**は `node "${HARNESS_ROOT}/tools/trace-check/trace-check.mjs" --next adr`（原子的な予約。ディレクトリ一覧から次の番号を推測しません）。番号は飛ばさず、再利用しません。
- **1 ADR に 1 判断。**
- **却下した選択肢が本質です。** Context → Decision → Consequences → 却下した選択肢の順で、後から推論を追跡できるように書きます。検討した選択肢はすべて「却下した選択肢」に載せ、負けた理由を最低 1 文添えます。**悪い結果がゼロの ADR は検討不足です。** 利点だけでなくコストも書きます。
- Decision に**判断の強制箇所**（型、制約、検査、lint 規則）を明記します。説明文だけで強制する判断は説得による統制（R-901）なので、明示してください。
- **置き換え**（R-802）: 新しい記録に `supersedes: ADR-nnnn` を書き、古い記録の frontmatter を `status: superseded` にします。**古い本文を削除・書き換えしてはいけません。** 古いファイルのほかの箇所は変えません。

## 次に進む前に

`node "${HARNESS_ROOT}/tools/spec-lint/spec-lint.mjs" validate` と `node "${HARNESS_ROOT}/tools/trace-check/trace-check.mjs" --only C12`（ID 衝突）を実行し、自ら書いたファイルに関するエラーをすべて修正します。所属するスライスのコミットフッターから ADR を ID で参照します（[commit.md](commit.md)）。
