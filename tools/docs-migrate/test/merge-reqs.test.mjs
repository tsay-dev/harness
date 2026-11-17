//  merge-reqs（REQ-nnn.md を UC.md の「要件」の節へ移す）と、節の読み方（tools/_shared/reqs.mjs）のテスト
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reqDocsOf, sectionFromReqDoc, splitUc } from "../../_shared/reqs.mjs";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..", "merge-reqs.mjs");
const TEMP = [];
after(() => TEMP.forEach((d) => rmSync(d, { recursive: true, force: true })));

const UC = `---\nid: UC-001\ntitle: t\nstatus: active\n---\n\n# UC-001 t\n\n## 概要\n\n本文\n\n## 事後条件\n\n- 成功時: x\n`;
const req = (id, { uc = "UC-001", br = "BR-016", status = "active          # draft | active | withdrawn（active = 人間承認済み）", extra = "" } = {}) =>
	`---\nid: ${id}\npattern: Event-driven\nuc: ${uc}\n${br ? `br: ${br}\n` : ""}status: ${status}\n${extra}---\n\n# ${id}\n\n> ${id} の要件文。\n\n## 検証方針\n\n<!--\n要件作成者ではなくテスト設計者が所有する（要件作成者は以下のひな形のまま残す）。\n本文は日本語で書く。\n-->\n\n- **分割クラス**:\n  - \`#first\` — 最初\n  - \`#second\` — 次\n- **参照先**: \`tests/a.test.ts\`\n\n### 補足\n\n\`\`\`\n# コードの中の見出しはずらさない\n\`\`\`\n`;

function project(files) {
	const d = mkdtempSync(join(tmpdir(), "merge-reqs-"));
	TEMP.push(d);
	for (const [f, body] of Object.entries(files)) {
		mkdirSync(dirname(join(d, f)), { recursive: true });
		writeFileSync(join(d, f), body);
	}
	return d;
}
const DIR = "docs/goals/GOAL-01-a/UC-001-b";
const run = (d, args = []) => spawnSync(process.execPath, [TOOL, "--root", d, ...args], { encoding: "utf8", input: "" });

test("--write なしでは、移せることを表示するだけで何も書き換えない", () => {
	const d = project({ [`${DIR}/UC.md`]: UC, [`${DIR}/REQ-002.md`]: req("REQ-002"), [`${DIR}/REQ-010.md`]: req("REQ-010", { br: "" }) });
	const r = run(d);
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /移せる: UC 1 件、REQ 2 件/);
	assert.equal(readFileSync(join(d, DIR, "UC.md"), "utf8"), UC);
	assert.ok(existsSync(join(d, DIR, "REQ-002.md")));
});

test("--write で、REQ を番号の順に「要件」の節へ移し、REQ-nnn.md を消す。読み戻すと元と同じ中身になる", () => {
	const d = project({ [`${DIR}/UC.md`]: UC, [`${DIR}/REQ-010.md`]: req("REQ-010", { br: "" }), [`${DIR}/REQ-002.md`]: req("REQ-002") });
	const r = run(d, ["--write"]);
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.ok(!existsSync(join(d, DIR, "REQ-002.md")) && !existsSync(join(d, DIR, "REQ-010.md")));
	const text = readFileSync(join(d, DIR, "UC.md"), "utf8");
	assert.ok(text.startsWith(UC.replace(/\s+$/, "")), "UC 自身の部分が変わっている");
	assert.ok(text.indexOf("### REQ-002") < text.indexOf("### REQ-010"), "番号の順になっていない");
	assert.match(text, /### REQ-002\n\n- pattern: Event-driven\n- br: BR-016\n- status: active\n\n> REQ-002 の要件文。\n\n#### 検証方針\n\n- \*\*分割クラス\*\*:/);
	assert.match(text, /### REQ-010\n\n- pattern: Event-driven\n- status: active\n/);
	assert.doesNotMatch(text, /要件作成者ではなくテスト設計者が所有する/); //  ひな形の案内のコメントは落とす
	assert.doesNotMatch(text, /uc: UC-001/); //  どの UC の要件かは置き場で決まる
	assert.match(text, /##### 補足\n\n```\n# コードの中の見出しはずらさない\n```/);

	const parts = reqDocsOf("UC.md", text, "UC-001");
	assert.deepEqual(parts.problems, []);
	assert.deepEqual(parts.docs.map((x) => [x.id, x.status]), [["REQ-002", "active"], ["REQ-010", "active"]]);
	assert.match(parts.docs[0].text, /^---\nid: REQ-002\npattern: Event-driven\nuc: UC-001\nbr: BR-016\nstatus: active\n---\n\n# REQ-002\n\n> REQ-002 の要件文。\n\n## 検証方針\n/);
	assert.equal(parts.ucText.replace(/\s+$/, ""), UC.replace(/\s+$/, ""));
	//  2 回目は移すものが無い
	assert.match(run(d, ["--write"]).stdout, /移した: UC 0 件、REQ 0 件/);
});

const BAD = [
	["uc が置き場の UC と違う", { [`${DIR}/REQ-001.md`]: req("REQ-001", { uc: "UC-009" }) }, /uc（UC-009）が置き場の UC（UC-001）と違う/],
	["id がファイル名と違う", { [`${DIR}/REQ-001.md`]: req("REQ-007") }, /id（REQ-007）がファイル名と違う/],
	["小節に書けない項目がある", { [`${DIR}/REQ-001.md`]: req("REQ-001", { extra: "owner: x\n" }) }, /小節に移せない項目がある: owner/],
	["本文が題で始まらない", { [`${DIR}/REQ-001.md`]: req("REQ-001").replace("# REQ-001\n", "# 別の題\n") }, /本文が「# REQ-001」で始まらない/],
	["frontmatter が無い", { [`${DIR}/REQ-001.md`]: "# REQ-001\n\n> x\n" }, /frontmatter が無い/],
	["UC.md が無い", { [`${DIR}/REQ-001.md`]: req("REQ-001"), [`${DIR}/UC.md`]: null }, /REQ があるのに UC\.md が無い/],
	["UC.md にすでに「要件」の節がある", { [`${DIR}/REQ-001.md`]: req("REQ-001"), [`${DIR}/UC.md`]: `${UC}\n## 要件\n\n### REQ-005\n\n- status: active\n\n> x\n` }, /すでに「要件」の節がある/],
];
for (const [name, files, re] of BAD) {
	test(`移せないもの（${name}）があれば、どのファイルも書き換えずに失敗する`, () => {
		const all = { [`${DIR}/UC.md`]: UC, "docs/goals/GOAL-01-a/UC-002-c/UC.md": UC.replaceAll("UC-001", "UC-002"), "docs/goals/GOAL-01-a/UC-002-c/REQ-020.md": req("REQ-020", { uc: "UC-002" }), ...files };
		const d = project(Object.fromEntries(Object.entries(all).filter(([, v]) => v !== null)));
		const r = run(d, ["--write"]);
		assert.equal(r.status, 1, r.stdout + r.stderr);
		assert.match(r.stdout, re);
		assert.match(r.stdout, /どのファイルも書き換えていない/);
		assert.ok(existsSync(join(d, "docs/goals/GOAL-01-a/UC-002-c/REQ-020.md")), "移せる UC まで書き換えている");
	});
}

test("節の読み方: 小節の外の行、REQ でない小節、書けない項目、重複を問題として返す", () => {
	const uc = (body) => `---\nid: UC-001\n---\n\n# UC-001\n\n## 要件\n\n${body}\n\n## 事後条件\n\nx\n`;
	const msgs = (body) => reqDocsOf("UC.md", uc(body), "UC-001").problems.map((p) => p.msg).join("\n");
	assert.match(msgs("ここに説明の文\n\n### REQ-001\n\n- status: active\n\n> x"), /小節だけを書く/);
	assert.match(msgs("### 補足\n\n本文"), /小節だけを書く（小節の外の行: ### 補足）/);
	assert.match(msgs("### REQ-001\n\n- status: active\n\n> x\n\n### 補足\n\n本文"), /小節の見出しは「### REQ-nnn」だけ/);
	assert.match(msgs("### REQ-001\n\n- status: active\n- uc: UC-001\n\n> x"), /項目「uc」は書けない/);
	assert.match(msgs("### REQ-001\n\n- status: active\n- status: draft\n\n> x"), /項目「status」が重複している/);
	assert.match(msgs("### REQ-001\n\n- status: active\n\n> x\n\n### REQ-001\n\n- status: draft\n\n> y"), /REQ-001 の小節が重複している/);
	//  小節の前の HTML コメント（案内）は置ける
	assert.equal(msgs("<!--\n案内\n複数行\n-->\n\n### REQ-001\n\n- status: active\n\n> x"), "");
	//  「要件」の節が無ければ、REQ は 0 件で、UC の文面はそのまま
	const none = splitUc("---\nid: UC-001\n---\n\n# UC-001\n");
	assert.equal(none.hasSection, false);
	assert.deepEqual(none.reqs, []);
	//  節の後ろの UC の節は、UC 自身の部分に残る
	assert.match(reqDocsOf("UC.md", uc("### REQ-001\n\n- status: active\n\n> x"), "UC-001").ucText, /## 事後条件\n\nx/);
	//  コードの囲みの中の「### REQ-nnn」や「## 見出し」は、小節や節の区切りにしない
	const fenced = reqDocsOf("UC.md", uc("### REQ-001\n\n- status: active\n\n> x\n\n```\n### REQ-002\n## 別の節\n```\n\n続き"), "UC-001");
	assert.deepEqual(fenced.docs.map((d) => d.id), ["REQ-001"]);
	assert.match(fenced.docs[0].text, /続き/);
});

test("1 つの REQ の文書を小節に直す: 落とすのは決めたものだけ", () => {
	const r = sectionFromReqDoc(req("REQ-003").replace("- **参照先**", "<!-- これは案内ではない独自のコメント -->\n- **参照先**"), { guidance: ["要件作成者ではなくテスト設計者が所有する"], statusGuidance: ["draft | active | withdrawn（active = 人間承認済み）"] });
	assert.equal(r.id, "REQ-003");
	assert.match(r.section, /これは案内ではない独自のコメント/);
	assert.doesNotMatch(r.section, /要件作成者ではなく/);
	assert.doesNotMatch(r.section, /人間承認済み/); //  status の後ろの案内
});

test("status の後ろに、案内に続けて人が書いた文（撤回した理由など）は、落とさずに項目 note に移す", () => {
	const why = "フォローリクエストを廃止した（ADR-0064）ので撤回した";
	const d = project({
		[`${DIR}/UC.md`]: UC,
		[`${DIR}/REQ-001.md`]: req("REQ-001", { status: `withdrawn       # draft | active | withdrawn（active = 人間承認済み）。${why}` }),
		[`${DIR}/REQ-002.md`]: req("REQ-002", { status: "withdrawn  # REQ-205 に統合した" }),
		[`${DIR}/REQ-003.md`]: req("REQ-003", { status: "active   # draft | active | withdrawn (active = approved by a human)" }),
	});
	const r = run(d, ["--write"]);
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /note に移したもの 2 件/);
	const text = readFileSync(join(d, DIR, "UC.md"), "utf8");
	assert.match(text, new RegExp(`### REQ-001\\n\\n- pattern: Event-driven\\n- br: BR-016\\n- status: withdrawn\\n- note: ${why.replace(/[()（）]/g, "\\$&")}\\n`));
	assert.match(text, /### REQ-002\n\n- pattern: Event-driven\n- br: BR-016\n- status: withdrawn\n- note: REQ-205 に統合した\n/);
	assert.match(text, /### REQ-003\n\n- pattern: Event-driven\n- br: BR-016\n- status: active\n\n>/); //  案内だけなら note は付かない
	assert.deepEqual(reqDocsOf("UC.md", text, "UC-001").docs.map((x) => x.status), ["withdrawn", "withdrawn", "active"]);
});

test("status 以外の項目の行末にコメントがあれば、黙って落とさずに失敗する", () => {
	const d = project({ [`${DIR}/UC.md`]: UC, [`${DIR}/REQ-001.md`]: req("REQ-001").replace("br: BR-016", "br: BR-016   # 見直し中") });
	const r = run(d, ["--write"]);
	assert.equal(r.status, 1);
	assert.match(r.stdout, /br の行末にコメントがある/);
});

test("節の読み方: status は、行末の案内のコメントや引用符があっても、検査ツールと同じ値に読む", () => {
	const uc = (line) => `---\nid: UC-001\n---\n\n# UC-001\n\n## 要件\n\n### REQ-001\n\n- pattern: Ubiquitous\n${line}\n\n> x\n`;
	const status = (line) => reqDocsOf("UC.md", uc(line), "UC-001").docs[0].status;
	assert.equal(status("- status: draft          # draft | active | withdrawn（active = 人間承認済み）"), "draft");
	assert.equal(status("- status: active   # 承認済み"), "active");
	//  引用符つきの値は、検査ツール（frontmatter の読み方）も引用符ごと読み、語彙の外として違反にする。ここでも同じ値にする
	assert.equal(status('- status: "active"'), '"active"');
	assert.equal(status("- status: active"), "active");
});

test("節の読み方: 節の外に書いた REQ の小節と、2 つ目の「要件」の節は問題にする", () => {
	const head = "---\nid: UC-001\n---\n\n# UC-001\n\n";
	const msgs = (body) => reqDocsOf("UC.md", head + body, "UC-001").problems.map((p) => p.msg).join("\n");
	assert.match(msgs("## 概要\n\n### REQ-777\n\n- status: active\n\n> x\n\n## 要件\n\n### REQ-001\n\n- status: active\n\n> y\n"), /### REQ-777 が「要件」の節の外にある/);
	assert.match(msgs("## 要件\n\n### REQ-001\n\n- status: active\n\n> y\n\n## メモ\n\n### REQ-002\n\n- status: draft\n\n> z\n"), /### REQ-002 が「要件」の節の外にある/);
	assert.match(msgs("## 要件\n\n### REQ-001\n\n- status: active\n\n> y\n\n## 要件\n\n### REQ-002\n\n- status: draft\n\n> z\n"), /「## 要件」の節が 2 つある/);
	//  コードの囲みの中と、小節の前の案内のコメントの中の見出しは、小節として読まない
	assert.equal(msgs("## 概要\n\n```\n### REQ-777\n```\n\n## 要件\n\n<!--\n### REQ-000 のように書く\n-->\n\n### REQ-001\n\n- status: active\n\n> y\n"), "");
	assert.deepEqual(reqDocsOf("UC.md", head + "## 要件\n\n<!--\n### REQ-000\n-->\n\n### REQ-001\n\n- status: active\n\n> y\n", "UC-001").docs.map((d) => d.id), ["REQ-001"]);
});
