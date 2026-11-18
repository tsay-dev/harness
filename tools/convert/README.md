# convert

旧 OpenAPI 契約を harness 契約へ機械変換する（`harness convert`）。

`docs/adr/ADR-0001` で決めた書式変更の機械処理部分。緩い parser（block scalar を畳む）で
OpenAPI 3.x 契約を読み、形状を保持して harness 契約を書く:
`paths.*.<method>`（`operationId`）→ `transport: http` と `wire` 付きの `operations.<name>`、path / query
`parameters` + `requestBody` → 一つの `request` object、最初の 2xx → `response`、各 4xx / 5xx → `errors[]`
（`code` は `x-error-code`、なければ response schema の `code` の `const` / `enum`、なければ 400 の
`INVALID_INPUT` などステータス既定値）、`example(s)` → `examples`、`components.schemas` → 契約の最上位
`schemas:`（`$ref` を `#/schemas/<Name>` に書き換え）、`security` → `auth`（`[]` = `none`）、`x-status` は引き継ぐ。
判断できないもの — direction（`--direction`、既定 `outbound` = このアプリが API を呼ぶ。サーバー自身の API は
`inbound`）、欠落した `security`、推測したエラーコード、欠落した `summary`、UC（`--uc`）— はすべて
ファイル末尾の `# convert:` 注記として残し、stderr に表示する。旧契約に 4xx がない操作は `errors: []` にする
（失敗経路を創作しない）。注記を解消後に `harness lint spec` を通すことを意図した結果。

```bash
harness convert <openapi.yaml> --uc UC-012 [--direction outbound|inbound] [--out contract.yaml] [--date YYYY-MM-DD]
```

終了コード: `0` = 変換した / `2` = 使用法エラー（入力が無い、OpenAPI 文書でない、`--direction` の値が誤り）。
