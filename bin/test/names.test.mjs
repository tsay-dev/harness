//  コマンドの名前とファイルの名前が 1 つであること（ADR-0071）のうち、「古い呼び名が残っていない」を守るテスト。
//  同梱ツールは、以前、コマンドの名前と別の名前のファイルに入っていた。古い呼び名が文書やコードに残ると、
//  同じものに名前が 2 つある状態に戻る。追跡しているファイルに 1 つでも残っていれば失敗にする。
//  新しい名前と古い名前の対応は、ADR-0071 の表と、docs/apm.md の移行の節にだけ書く。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

//  古い呼び名。文字をつないで作る（このファイル自身を、検査の対象から外さずに済ませる）
const j = (...parts) => parts.join("-");
const OLD_NAMES = [j("spec", "lint"), j("trace", "check"), j("exec", "check"), j("contract", "run"), j("gate", "hook"), j("stop", "gate"), j("git", "lint"), j("config", "lint"), j("merge", "reqs"), j("spec", "gate"), j("goals", "tree"), ["STOP", "GATE"].join("_")];
//  ツールの置き場としての古い名前（同じ名前の skill とテンプレートの置き場は別物なので、パスの形だけを見る）
const OLD_PATHS = [`tools/${j("docs", "migrate")}`];

//  古い呼び名を書いてよい場所
const ADR_DIR = "docs/adr/"; //  過去の記録（本文を書き換えない）と、改名の対応を書いた ADR-0071
const MIGRATION_DOC = "docs/apm.md"; //  下の見出しの節だけ（利用プロジェクトの移行の案内）
const MIGRATION_HEADING = "## 同梱ツールのファイルの名前を、コマンドの名前にそろえる（ADR-0071）";
//  凍結済みの保留の一覧（DEFERRED.md）の「昇格先」の語。利用プロジェクトの凍結済みの行が持っている値で、
//  行は書き換えない（ADR-0068）ので、語も変えない。語彙を書いた、決まった形の文字だけを認める
const DEFERRED_VOCAB = [
	["tools/lint-spec/lint-spec.mjs", `["${OLD_NAMES[0]}", "${OLD_NAMES[1]}", "${OLD_NAMES[3]}", "test", "typecheck", "lint", "hook", "未定"]`],
	["tools/lint-spec/README.md", `${OLD_NAMES[0]} | ${OLD_NAMES[1]} | ${OLD_NAMES[3]} | test | typecheck | lint | hook | 未定`],
	["templates/develop/DEFERRED.md", `${OLD_NAMES[0]} | ${OLD_NAMES[1]} | ${OLD_NAMES[3]} | test | typecheck | lint | hook | 未定`],
];

function trackedFiles() {
	const r = spawnSync("git", ["-C", ROOT, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
	assert.equal(r.status, 0, r.stderr);
	return r.stdout.split("\0").filter(Boolean);
}

//  移行の節（見出しから、次の同じ深さの見出しの手前まで）を除いた文面
function withoutMigrationSection(text) {
	const at = text.indexOf(MIGRATION_HEADING);
	assert.ok(at >= 0, `${MIGRATION_DOC} に移行の節の見出しが無い: ${MIGRATION_HEADING}`);
	const next = text.indexOf("\n## ", at + MIGRATION_HEADING.length);
	return text.slice(0, at) + (next < 0 ? "" : text.slice(next));
}

test("古い呼び名は、過去の ADR と移行の案内のほかに残っていない（文書、コード、ファイルと置き場の名前）", (t) => {
	const files = trackedFiles();
	if (files.length === 0) return t.skip("git で追跡しているファイルを読めない（checkout の外で実行している）");
	const found = [];
	for (const file of files) {
		if (file.startsWith(ADR_DIR)) continue;
		for (const name of [...OLD_NAMES, ...OLD_PATHS]) if (file.includes(name)) found.push(`${file}: ファイルか置き場の名前に ${name}`);
		let text;
		try {
			text = readFileSync(join(ROOT, file), "utf8");
		} catch {
			continue; //  作業ツリーから消したファイル
		}
		if (file === MIGRATION_DOC) text = withoutMigrationSection(text);
		for (const [f, vocab] of DEFERRED_VOCAB) if (f === file) text = text.split(vocab).join("");
		text.split("\n").forEach((line, i) => {
			for (const name of [...OLD_NAMES, ...OLD_PATHS]) if (line.includes(name)) found.push(`${file}:${i + 1}: ${name}`);
		});
	}
	assert.deepEqual(found, [], `古い呼び名が残っている。コマンドの名前（harness lint spec など。対応は docs/adr の ADR-0071）で書く:\n${found.join("\n")}`);
});

test("保留の一覧の「昇格先」の語を認める場所には、その語彙が実際に書いてある（認める一覧が古くならない）", () => {
	for (const [file, vocab] of DEFERRED_VOCAB) assert.ok(readFileSync(join(ROOT, file), "utf8").includes(vocab), `${file} に語彙の文字が無い（書き方を変えたなら、ここも合わせる）`);
});
