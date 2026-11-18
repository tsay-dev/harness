# index

1 行 1 ID の索引を出力する（`harness index`）。全プロジェクトの対応図で、GOAL / UC / REQ / BR / NFR / ADR と、それを確かめるテストのファイルを並べる。

導出できる地図なので、ファイルに書いてコミットしない（R-1003 / R-603）。必要なときに生成する。
文書と注釈の読み方、設定（`harness.config.json`）の宣言は、紐づきの検査（`harness lint refs`）と同じものを使う。宣言の書き方は `../lint-refs/README.md` が正本。

```bash
harness index [--root .] [--config harness.config.json]
```

- REQ・BR・NFR には `tests:`、UC には `scenario:` の行で、その ID を `@covers` / `@scenario` するテストのファイルを出す
  （保留のテストしか無いファイルは `(保留)` を付ける）。実装のファイルは出さない（どのコードが実行されたかは、実行の記録が持つ）。
- `tests` を none と宣言したプロジェクトでは、テストの行に `(tests は none)` と出す。

終了コード: `0` = 出力した / `2` = 使用法・設定エラー（宣言の不足を含む）。

回帰テスト: `node --test "tools/index/test/*.test.mjs"`。
