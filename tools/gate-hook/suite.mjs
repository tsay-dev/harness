//  suite — 完了の判定が実行する検査の並び（共有の部品。単独では実行しない）
//
//  Stop フック（stop-gate.mjs）と、CI・手元から呼ぶ verify.mjs が、同じ並びを同じ規則で実行する。
//  検査の並びを 2 か所に書くと、フックで通って CI で落ちる（またはその逆の）食い違いになる。
//
//  検査の並び（level で、どこまで実行するかを選ぶ）:
//    level lint 以上（読むだけ。利用プロジェクトのコマンドは実行しない）
//      1. config-lint                  設定の形（ルートで 1 回。unit の設定も config-lint が読む）
//      2. spec-lint validate           仕様の文書の書式と状態の決まり
//      3. trace-check                  仕様・コード・テストの ID の紐づき
//      commands の宣言の検査（typecheck / lint / test / system は、コマンドか理由付きの none が必須）
//    level fast 以上
//      4. contract-run                 契約の実例を実装に当てて実行する
//      5. commands.typecheck → lint → test → commands.extra の各コマンド（書いた順）
//    level full
//      6. commands.system              シナリオテスト全件
//  1〜4 は全部実行して失敗を集める。5〜6 は、最初の失敗で止める（型が通らないのにテストを回しても意味がない）。
//  level で実行しなかった検査は、skip として理由と一緒に返す（黙って省かない）。
//
//  monorepo（設定の git.units = { 単位名: ディレクトリ }）:
//    2〜6 を unit ごとに、<dir>/harness.config.json と <dir>/docs で実行する。commands は unit の設定のものを、
//    unit のディレクトリで実行する。ルートの設定に commands があれば、最後にルートで実行する（無くてもよい）。
//    docs も設定も持たない unit は「docs なし」と表示するだけ。docs を持つのに設定が無い unit は失敗。
//    only（--unit）で名前を挙げたら、その unit だけを検査する（ルートの commands は実行しない）。
//
//  コマンドは、設定に宣言されたものしか実行しない。推測・発明はしない。
//  制限時間を過ぎたコマンドは、プロセスグループごと止める（シェルの子として動くテストランナーを残さない）。

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CONFIG_FILE, renamedConfigHint } from "../_shared/config.mjs";

export const LEVELS = ["lint", "fast", "full"];
export const COMMAND_KEYS = ["typecheck", "lint", "test", "system"];
//  検査の指紋に入れる、使う harness ツール（tools/ からの相対パス）
export const TOOL_SCRIPTS = ["config-lint/config-lint.mjs", "spec-lint/spec-lint.mjs", "trace-check/trace-check.mjs", "contract-run/contract-run.mjs", "gate-hook/suite.mjs"];

const MAX_OUTPUT = 8 * 1024 * 1024; //  1 つの検査の出力のうち、覚えておく末尾の量
const posix = process.platform !== "win32";

//  ---- 設定 ------------------------------------------------------------------

//  読めなければ { error }。無ければ { missing: true }
export function readConfig(path) {
	if (!existsSync(path)) return { missing: true };
	try {
		const cfg = JSON.parse(readFileSync(path, "utf8"));
		if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return { error: `${path}: 最上位が JSON のオブジェクトでない` };
		return { cfg };
	} catch (e) {
		return { error: `${path}: JSON として読めない（${e.message}）` };
	}
}

const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

//  git.units（{ 単位名: ディレクトリ }）。無ければ null
export function unitsOf(cfg) {
	const u = cfg?.git?.units;
	return isMap(u) && Object.keys(u).length > 0 ? u : null;
}

const isNone = (v) => isMap(v) && "none" in v;

//  tests が none でなく宣言されているか
const declaresTests = (cfg) => cfg && cfg.tests !== undefined && !isNone(cfg.tests);

//  commands の宣言を検査する。戻り: { keys: { k: { cmd } | { none: 理由 } | { error } }, extra: [{ name, cmd }], extraError }
function readCommands(cfg, testsDeclared) {
	const commands = isMap(cfg.commands) ? cfg.commands : null;
	const keys = {};
	for (const k of COMMAND_KEYS) {
		const v = commands ? commands[k] : undefined;
		if (v === undefined) keys[k] = { error: `commands.${k} が宣言されていない（無いなら none に理由を書く: "${k}": { "none": "<理由>" }）` };
		else if (typeof v === "string" && v.trim()) keys[k] = { cmd: v };
		else if (isNone(v)) {
			if (typeof v.none !== "string" || !v.none.trim()) keys[k] = { error: `commands.${k} の none に理由が無い（{ "none": "<理由>" }）` };
			else if (k === "test" && testsDeclared)
				keys[k] = { error: `commands.test は none にできない（${CONFIG_FILE} が tests を宣言している。テストがあるなら実行するコマンドを書く）` };
			else keys[k] = { none: v.none };
		} else keys[k] = { error: `commands.${k} は文字列のコマンドか { "none": "<理由>" }（実際: ${JSON.stringify(v)}）` };
	}
	const extra = [];
	let extraError = null;
	const x = commands ? commands.extra : undefined;
	if (x !== undefined) {
		if (!isMap(x)) extraError = `commands.extra は { "<名前>": "<コマンド>" } で書く（実際: ${JSON.stringify(x)}）`;
		else
			for (const [name, cmd] of Object.entries(x)) {
				if (name.startsWith("_")) continue; //  説明の欄
				if (typeof cmd === "string" && cmd.trim()) extra.push({ name, cmd });
				else extraError ??= `commands.extra.${name} は文字列のコマンドで書く（実際: ${JSON.stringify(cmd)}）`;
			}
	}
	return { keys, extra, extraError };
}

//  ---- 検査の実行 ------------------------------------------------------------

//  実行中のコマンド（プロセスグループの先頭）。止められたら、これを止めてから自分も止まる
let current = null;
const killTree = (child) => {
	try {
		if (posix && child.pid) process.kill(-child.pid, "SIGKILL");
		else child.kill("SIGKILL");
	} catch {
		try {
			child.kill("SIGKILL");
		} catch {}
	}
};
const STOP_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"];
let stopBy = null;
const onStop = (sig) => {
	stopBy ??= sig;
	if (current) killTree(current);
	else stopSelf();
};
function stopSelf() {
	for (const s of STOP_SIGNALS) process.removeListener(s, onStop);
	process.kill(process.pid, stopBy);
}
let listening = false;
function listen() {
	if (listening) return;
	listening = true;
	for (const s of STOP_SIGNALS) process.on(s, onStop);
}

//  1 ステップ実行。戻り: { name, ok, code, signal, timedOut, output }
function runStep(name, cmd, cwd, timeoutSec) {
	listen();
	return new Promise((done) => {
		let output = "";
		let timedOut = false;
		const child = spawn(cmd, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"], detached: posix });
		current = child;
		const keep = (chunk) => {
			output += chunk;
			if (output.length > MAX_OUTPUT * 2) output = output.slice(-MAX_OUTPUT);
		};
		child.stdout.setEncoding("utf8").on("data", keep);
		child.stderr.setEncoding("utf8").on("data", keep);
		const timer = setTimeout(() => {
			timedOut = true;
			killTree(child);
		}, timeoutSec * 1000);
		let spawnError = null;
		child.on("error", (e) => {
			spawnError = e;
		});
		child.on("close", (code, signal) => {
			clearTimeout(timer);
			current = null;
			if (stopBy) return stopSelf(); //  止められた。続きを実行しない
			if (spawnError) output += `\n${spawnError.message}`;
			done({ name: timedOut ? `timeout:${name}` : name, ok: !timedOut && !spawnError && code === 0, code, signal, timedOut, output });
		});
	});
}

//  実行せずに失敗にする項目（設定の誤り・欠落）
const configFailure = (name, output) => ({ name, ok: false, code: null, signal: null, timedOut: false, config: true, output });

export const tailLines = (text, n) => {
	const lines = text.replace(/\s+$/, "").split(/\r?\n/);
	return lines.slice(Math.max(0, lines.length - n));
};

//  検査を実行する。
//    root: プロジェクトのルート / configPath: ルートの設定 / loaded: readConfig(configPath) の結果
//    opts: { docs, timeout, level, only: [unit の名前], ignoreLegacyLayout: 旧レイアウトが残っていても続ける（spec-lint へ渡す。移行中だけ） }
//  戻り: { failures, skipped, notes, ran }
export async function runSuite(root, opts, toolsDir, configPath, loaded) {
	const q = (p) => `"${p.replace(/"/g, '\\"')}"`;
	const level = LEVELS.indexOf(opts.level ?? "full");
	const failures = [];
	const skipped = [];
	//  表示は判定が終わってから呼び出し側が出す（フックの解放時は、stdout を systemMessage の JSON だけにするため）
	const notes = [];
	let ran = 0;
	const run = async (name, cmd, cwd = root) => {
		ran++;
		const r = await runStep(name, cmd, cwd, opts.timeout);
		if (!r.ok) failures.push(r);
		return r.ok;
	};
	const fail = (name, output) => {
		ran++;
		failures.push(configFailure(name, output));
	};
	const skip = (name, why) => {
		skipped.push(name);
		notes.push(`[verify] skip: ${why}`);
	};
	const tool = (name) => q(join(toolsDir, name, `${name}.mjs`));
	const specLint = (label, docsDir) => run(`spec-lint${label}`, `node ${tool("spec-lint")} validate --docs ${q(docsDir)}${opts.ignoreLegacyLayout ? " --ignore-legacy-layout" : ""}`);

	const { cfg } = loaded;
	if (loaded.missing) {
		//  設定が無いことは「検査しない理由」ではなく失敗（紐づきの検査は黙って省かない / ADR-0056）
		await specLint("", resolve(root, opts.docs));
		fail(
			"trace-check",
			`${CONFIG_FILE} が無い。紐づきの検査は省略できない（ADR-0056）。templates/develop/${CONFIG_FILE} から置き、対象が無い範囲は { "none": "<理由>" } と宣言する${renamedConfigHint(configPath)}`,
		);
		return { failures, skipped, notes, ran };
	}
	if (loaded.error) {
		await specLint("", resolve(root, opts.docs));
		fail("config", `${loaded.error}。${CONFIG_FILE} を直す（検査の範囲とコマンドを読めないので、紐づきの検査と commands を実行できない）`);
		return { failures, skipped, notes, ran };
	}

	//  1. 設定の形（unit の設定も config-lint が読む）
	await run("config-lint", `node ${tool("config-lint")} --config ${q(configPath)}`);

	//  2〜4 を 1 組の docs / 設定に対して実行する（失敗を集める）
	const checkDocs = async (label, unitRoot, docsDir, cfgPath) => {
		await specLint(label, docsDir);
		await run(`trace-check${label}`, `node ${tool("trace-check")} --root ${q(unitRoot)} --config ${q(cfgPath)}`);
		if (level >= 1) await run(`contract-run${label}`, `node ${tool("contract-run")} --root ${q(unitRoot)} --config ${q(cfgPath)} --docs ${q(docsDir)}`);
		else skip(`contract-run${label}`, `contract-run${label}（--level lint では実行しない）`);
	};

	//  5〜6: commands の宣言（欠落・型の誤りは失敗）と実行
	const runCommands = async (label, cwd, unitCfg) => {
		const { keys, extra, extraError } = readCommands(unitCfg, declaresTests(unitCfg));
		for (const k of COMMAND_KEYS)
			if (keys[k].error) fail(`commands.${k}${label}`, keys[k].error);
		if (extraError) fail(`commands.extra${label}`, extraError);
		const steps = [];
		for (const k of ["typecheck", "lint", "test"]) steps.push({ key: k, name: `${k}${label}`, decl: keys[k], need: 1 });
		for (const x of extra) steps.push({ key: `extra.${x.name}`, name: `extra.${x.name}${label}`, decl: { cmd: x.cmd }, need: 1 });
		steps.push({ key: "system", name: `system${label}`, decl: keys.system, need: 2 });
		for (const s of steps) {
			if (s.decl.error) break; //  順序に意味がある（前提が欠けたまま後続を実行しない）
			if (s.decl.none !== undefined) {
				skip(s.name, `commands.${s.key}${label} = none（${s.decl.none}）`);
				continue;
			}
			if (level < s.need) {
				skip(s.name, `commands.${s.key}${label}（--level ${LEVELS[level]} では実行しない）`);
				continue;
			}
			if (!(await run(s.name, s.decl.cmd, cwd))) break;
		}
	};

	const units = unitsOf(cfg);
	const only = opts.only ?? [];
	if (!units) {
		if (only.length) fail("config", `--unit は、設定に git.units を宣言したプロジェクトでだけ使える（指定: ${only.join(", ")}）`);
		await checkDocs("", root, resolve(root, opts.docs), configPath);
		await runCommands("", root, cfg);
		return { failures, skipped, notes, ran };
	}

	//  monorepo: 紐づきの宣言と commands は unit の側が持つ
	for (const name of only) if (!Object.hasOwn(units, name)) fail(`config:${name}`, `--unit ${name} は、設定の git.units に無い（宣言された unit: ${Object.keys(units).join(", ")}）`);
	for (const [name, dir] of Object.entries(units)) {
		if (only.length && !only.includes(name)) continue;
		if (typeof dir !== "string" || !dir.trim()) {
			fail(`config:${name}`, `git.units.${name} の値がディレクトリの文字列でない（実際: ${JSON.stringify(dir)}）`);
			continue;
		}
		const unitRoot = resolve(root, dir);
		const unitDocs = join(unitRoot, "docs");
		const unitCfgPath = join(unitRoot, CONFIG_FILE);
		if (!existsSync(unitCfgPath)) {
			if (existsSync(unitDocs))
				fail(
					`trace-check:${name}`,
					`unit ${name}（${dir}）は docs を持つのに ${dir}/${CONFIG_FILE} が無い。紐づきの検査は省略できない（ADR-0056）。templates/develop/${CONFIG_FILE} から置く${renamedConfigHint(unitCfgPath)}`,
				);
			else if (renamedConfigHint(unitCfgPath)) fail(`config:${name}`, `unit ${name}（${dir}）に ${dir}/${CONFIG_FILE} が無い${renamedConfigHint(unitCfgPath)}`);
			else notes.push(`[verify] unit ${name}（${dir}）: docs なし`);
			continue;
		}
		const u = readConfig(unitCfgPath);
		if (u.error) {
			fail(`config:${name}`, `${u.error}。${dir}/${CONFIG_FILE} を直す`);
			continue;
		}
		await checkDocs(`:${name}`, unitRoot, unitDocs, unitCfgPath);
		await runCommands(`:${name}`, unitRoot, u.cfg);
	}
	//  ルートの commands は、宣言があるときだけ実行する（リポジトリ全体に掛ける検査）
	if (cfg.commands !== undefined) {
		if (only.length) notes.push("[verify] --unit を指定したので、ルートの commands は実行しない");
		else await runCommands("", root, cfg);
	}
	return { failures, skipped, notes, ran };
}
