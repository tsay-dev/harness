//  strict-yaml: 引用符付きのスカラーの読み方（二重引用符のエスケープ、単一引用符の ''）
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStrictYaml } from "../strict-yaml.mjs";

const read = (text) => parseStrictYaml(text);

test("二重引用符の中のエスケープを YAML の決まりどおりに解く（ブロックでもフロー記法でもキーでも同じ）", () => {
	const r = read(String.raw`nul: "a\u0000b"
tab: "a\tb"
newline: "a\nb"
backslash: "^\\d+$"
quote: "say \"hi\""
hex: "\x41\u3042\U0001F600"
flow: ["a\nb", { k: "c\td" }]
"key\u0041": 1
`);
	assert.deepEqual(r.problems, []);
	assert.equal(r.root.nul, "a\u0000b");
	assert.equal(r.root.tab, "a\tb");
	assert.equal(r.root.newline, "a\nb");
	assert.equal(r.root.backslash, "^\\d+$");
	assert.equal(r.root.quote, 'say "hi"');
	assert.equal(r.root.hex, "Aあ😀");
	assert.deepEqual(r.root.flow, ["a\nb", { k: "c\td" }]);
	assert.equal(r.root.keyA, 1);
});

test("単一引用符の中はエスケープを解かず、'' だけを ' に戻す", () => {
	const r = read(String.raw`pattern: '^\d+\n$'
apostrophe: 'it''s'
flow: ['\t', 'a''b']
`);
	assert.deepEqual(r.problems, []);
	assert.equal(r.root.pattern, "^\\d+\\n$");
	assert.equal(r.root.apostrophe, "it's");
	assert.deepEqual(r.root.flow, ["\\t", "a'b"]);
});

test("知らないエスケープ・桁の足りない符号・範囲の外の符号は違反にする（黙って別の文字列として読まない）", () => {
	for (const value of [String.raw`"^\d+$"`, String.raw`"\u12"`, String.raw`"\xZZ"`, String.raw`"\U00110000"`, String.raw`"end\"`]) {
		const r = read(`a: ${value}\n`);
		assert.equal(r.problems.length, 1, value);
		assert.equal(r.problems[0].line, 1);
		assert.match(r.problems[0].msg, /二重引用符の中のエスケープを読めない/);
	}
	//  フロー記法の中でも同じ行番号で違反にする
	const flow = read(`ok: 1\nb: ["\\q"]\n`);
	assert.equal(flow.problems.length, 1);
	assert.equal(flow.problems[0].line, 2);
});

test("引用符の中の # はコメントにならず、エスケープした引用符の後ろも値として読む", () => {
	const r = read(String.raw`a: "x \" # y" # コメント
`);
	assert.deepEqual(r.problems, []);
	assert.equal(r.root.a, 'x " # y');
});

test("YAML 1.2 のエスケープをすべて解く（1 文字のもの）", () => {
	const table = { 0: "\0", a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r", e: "\x1b", " ": " ", '"': '"', "/": "/", "\\": "\\", N: "\x85", _: "\xa0", L: "\u2028", P: "\u2029" };
	for (const [esc, want] of Object.entries(table)) {
		const r = read(`a: "x\\${esc}y"\n`);
		assert.deepEqual(r.problems, [], esc);
		assert.equal(r.root.a, `x${want}y`, esc);
	}
});

test("16 ビットの符号を 2 つ並べた書き方は 1 文字にまとめ、対になっていないサロゲートは違反にする", () => {
	const pair = read(String.raw`a: "\uD83D\uDE00"` + "\n");
	assert.deepEqual(pair.problems, []);
	assert.equal(pair.root.a, "😀");
	for (const value of [String.raw`"\uD83D"`, String.raw`"x\uDE00"`, String.raw`"\U0000D800"`]) {
		const r = read(`a: ${value}\n`);
		assert.equal(r.problems.length, 1, value);
	}
});

test("引用符付きのキーと列の要素は、中のコロン・エスケープした引用符で切らない", () => {
	const r = read(String.raw`"a\": b": 1
'c'' : d': 2
list:
  - "x: y"
  - 'p: q'
  - "x\" : y"
`);
	assert.deepEqual(r.problems, []);
	assert.equal(r.root['a": b'], 1);
	assert.equal(r.root["c' : d"], 2);
	assert.deepEqual(r.root.list, ["x: y", "p: q", 'x" : y']);
});
