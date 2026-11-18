//  contract-vocab のテスト。契約の語彙と、項目が「書いてある」の判定を固定する（lint spec と lint entries が同じ判定を使う）
import { test } from "node:test";
import assert from "node:assert/strict";
import { ENTRY_TRANSPORTS, TRANSPORTS, isFilledText } from "../contract-vocab.mjs";

test("契約の語彙: entry を書く transport は transport の語彙の一部。項目が書いてあるのは、空でない文字列だけ（空白だけは空）", () => {
	for (const t of ENTRY_TRANSPORTS) assert.ok(TRANSPORTS.includes(t));
	assert.ok(TRANSPORTS.includes("http"));
	for (const v of ["a", " a ", "/"]) assert.equal(isFilledText(v), true);
	for (const v of ["", " ", "\t\n", 1, true, null, undefined, ["a"], {}]) assert.equal(isFilledText(v), false);
});
