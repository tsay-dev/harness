# next-id

次の空き ID を出力し、同時に予約する（`harness next-id`。R-204）。

ディレクトリの一覧から次の番号を推測すると、並行して動く作業が同じ番号を取る。このコマンドは、定義済みの ID と、まだ使われていない予約の両方を使用済みとして数える。
定義済みの ID の集め方と、設定（`harness.config.json`）の宣言は、紐づきの検査（`harness lint refs`）と同じものを使う。宣言の書き方は `../lint-refs/README.md` が正本。

```bash
harness next-id <goal|uc|req|br|nfr|adr> [--reserve N] [--root .] [--config harness.config.json]
```

- 次の空き ID を N 個（既定 1）、一行ずつ出す。
- 原子的: mkdir ロックで `.trace-reservations.json` に番号を予約するため、並行する Tasks がすべて呼んでも同じ番号を受け取らない。
  予約は、ID が定義された時点で消える。1 日たっても使われない予約は落とす。`.trace-reservations.json` と `.trace-next.lock` はコミットしない。
- `req` は、UC.md の表が予約する ID も、ファイル作成前から使用済みと数える。`goal` は、概要（`docs.overview`）の GOAL の表のすべての行（`planned`・`withdrawn` を含む）と、GOAL のフォルダの名前の番号を数える（`docs.overview` が none なら使い方の誤り）。
- 要るのは `docs.goals_dir`・`docs.rules_dir`・`docs.nfr_dir`・`docs.adr_dir` の宣言だけ（ほかの宣言が足りなくても採番はできる）。

終了コード: `0` = 出力した / `2` = 使用法・設定エラー。

回帰テスト: `node --test "tools/next-id/test/*.test.mjs"`。
