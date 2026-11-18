# docs-migrate

文書の置き方を、意味を変えずに移すスクリプトを置く。判断の要る移行（旧配置からの移行など）は、`docs-migrate` の skill が担当する。

## merge-reqs — REQ を UC の文書へ移す

入口からは `harness migrate reqs`。REQ を 1 ID 1 ファイル（`REQ-nnn.md`）で置く形から、`UC.md` の「要件」の節に小節として書く形（ADR-0067）へ移す。

```bash
node .harness/bin/harness.mjs migrate reqs            # 何を移すかを表示するだけ
node .harness/bin/harness.mjs migrate reqs --write    # 書き換える
```

monorepo では、文書を持つ unit のディレクトリで、unit ごとに実行する（`--root <unit>` でもよい）。

UC のディレクトリごとに、次を行う。

1. `REQ-nnn.md` を番号の順に読み、1 つずつ小節（`### REQ-nnn`、項目の並び、本文）に直す。
2. 直した小節を、検査ツールと同じ読み方（`tools/_shared/reqs.mjs`）で読み戻し、元のファイルと同じ中身になることを確かめる。
3. `UC.md` の末尾に `## 要件` の節を足し、`REQ-nnn.md` を消す（`--write` のときだけ）。

変えるのは、次のものだけである。ほかは 1 文字も変えない。落とすのは、ひな形の案内の文面と一致するものだけで、人が書いた文は落とさない。

| 元の REQ-nnn.md にあるもの | 移した後 |
| --- | --- |
| frontmatter の `id` と、本文の `# REQ-nnn` の題 | 小節の見出し `### REQ-nnn` |
| frontmatter の `uc` | 書かない（どの UC の要件かは、書かれている `UC.md` で決まる） |
| frontmatter の `pattern` / `br` / `status` | 小節の先頭の `- キー: 値` の並び |
| `status` の値の後ろの、ひな形の案内の文面（`# draft \| active \| withdrawn（active = 人間承認済み）` など） | 落とす |
| `status` の値の後ろに、案内に続けて書かれた文（撤回した理由など） | 項目 `note` に移す（`- note: …`） |
| 検証方針の下の、ひな形の案内の HTML コメント | 落とす（案内は `UC.md` のひな形の「要件」の節の先頭に 1 回だけある） |
| 本文の見出し（`## 検証方針` など） | 2 段深くする（`#### 検証方針`） |

移せないものが 1 つでもあれば、どのファイルも書き換えずに失敗する（終了コード 1）。

- `uc` が、置き場の UC と違う。
- `id` が、ファイル名と違う。
- 小節に書けない項目（`pattern` / `br` / `status` / `note` 以外）がある。
- `status` 以外の項目の行末にコメント（` # …`）がある。
- 本文が `# REQ-nnn` で始まらない。
- `UC.md` が無い。または、`UC.md` にすでに「要件」の節がある。

移した後は、文書の中の `…/REQ-nnn.md` への参照（保留の一覧の対象など）を、`…/UC.md#REQ-nnn` に直す。このスクリプトは参照を直さない。

## テスト

```bash
node --test tools/docs-migrate/test/*.test.mjs < /dev/null
```
