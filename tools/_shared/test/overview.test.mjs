import { test } from "node:test";
import assert from "node:assert/strict";
import { policyFilled } from "../overview.mjs";

//  全体の方針の小節が「埋まっている」とみなすのは、未記入の印で始まらない本文だけ（ADR-0076）。
//  未記入のうちは、UC の並行性・外部依存の行を省けない
test("overview: 未記入・未定・TODO・TBD で始まる本文と空の本文は、方針を埋めたことにならない", () => {
	for (const text of ["", "（未記入: 未記入の間は、UC の並行性・外部依存の行を省けない）", "(未記入)", "未記入", "未定", "TODO", "todo: あとで", "TBD"]) {
		assert.equal(policyFilled(text), false, text);
	}
	assert.equal(policyFilled("先に届いた要求を通し、後の要求には競合を返す。"), true);
	assert.equal(policyFilled("未来の予約は受け付けない。"), true);
});
