# lint git uc

コミットが指す UC が、実装に入れる状態かを検査する（`harness lint git uc`。draft のまま実装する事故を防ぐ）。

コミットメッセージの `UC:` trailer（または `--uc`）の UC について、UC と REQ が `active` で、契約（`contract.yaml`）が存在して `fixed` であることを確かめる。
文書の読み方と違反の報告は、仕様の文書の検査（`harness lint spec`。`../lint-spec/README.md`）と同じものを使う。

```bash
harness lint git uc --message <file>       # コミットの UC: trailer を検証（UC / REQs が active、契約が fixed）
harness lint git uc --uc UC-012            # 一 UC に同じ検査 [モノレポ直下では --unit <name>]
```

commit-msg hook に接続してもよい（任意。各プロジェクト側で設定）。CI では再利用 workflow `.github/workflows/verify.yml` が、pull request の各コミットに実行する。

モノレポの利用プロジェクト（`harness.config.json` が `git.units` を宣言し、repository 直下から実行）では docs と
UC 番号は単位ごと。一単位の `docs/` を検索する。`--message` はコミットヘッダーの `scope` から、
`--uc` は `--unit` から単位を取る。宣言済み単位でない scope（`repo`、なし）で `UC:` を持つコミットは失敗する。
trailer のないコミットは、ほかと同様、そのまま通す（ADR-0040）。読むのは unit の対応表だけで、`git.units` の形式は
`harness lint git branch` と `harness lint git message` が検査する。

終了コード: `0` = 正常 / `1` = 違反 / `2` = 使用法エラー。baseline は無い（ADR-0056）。

回帰テスト: `node --test "tools/lint-git-uc/test/*.test.mjs"`。
