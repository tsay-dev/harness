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
//         exec-check entry             テストの入口が、本番と同じ組み立てを呼んでいるか
//         exec-check entries           commands.list_entries がコマンドでないとき（未宣言・none・形の誤り）は、ここで読むだけの判定をする
//                                      （none にできるのは、撤回されていない契約に inbound の操作が無い間だけ）
//      commands の宣言の検査（typecheck / lint / test / system は、コマンドか理由付きの none が必須）
//    level fast 以上
//      4. commands.list_entries → exec-check entries
//                                      アプリの入口の一覧をコマンドに出させ、契約と突き合わせる（契約に無い入口・入口の無い操作）。
//                                      exec-check は読むだけなので、コマンドはここで実行し、標準出力を一時ファイルに書いて渡す
//         contract-run                 契約の実例を実装に当てて実行する
//      5. commands.typecheck → lint → test → exec-check coverage（test が書いた実行の記録で、どのテストからも
//         実行されなかったソースが無いか）→ commands.extra の各コマンド（書いた順）
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
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CONFIG_FILE, renamedConfigHint } from "../_shared/config.mjs";

export const LEVELS = ["lint", "fast", "full"];
export const COMMAND_KEYS = ["typecheck", "lint", "test", "system"];
//  検査の指紋に入れる、使う harness ツール（tools/ からの相対パス）
export const TOOL_SCRIPTS = ["config-lint/config-lint.mjs", "spec-lint/spec-lint.mjs", "trace-check/trace-check.mjs", "exec-check/exec-check.mjs", "contract-run/contract-run.mjs", "gate-hook/suite.mjs"];

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

//  coverage が none でなく宣言されているか
const declaresCoverage = (cfg) => cfg && isMap(cfg.coverage) && !isNone(cfg.coverage);

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
//  実行中のコマンドを打ち切る関数（コマンド自身が終わっているのに、孫が出力の口を握って戻らないときに使う）
let currentAbort = null;
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
	if (current) {
		killTree(current);
		currentAbort?.();
	} else stopSelf();
};
//  検査の途中で作った一時フォルダ。止められたときは finally に戻らないので、ここから消す
const tempDirs = new Set();
function stopSelf() {
	for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
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
		//  制限時間 0 は「制限なし」。setTimeout が扱える上限（約 24 日）を超える値は上限に丸める
		const timer =
			timeoutSec > 0
				? setTimeout(() => {
						timedOut = true;
						killTree(child);
						abort();
					}, Math.min(timeoutSec * 1000, 2 ** 31 - 1))
				: null;
		let spawnError = null;
		let finished = false;
		let exited = null; //  コマンド自身が終わっていれば { code, signal }
		const finish = (code, signal) => {
			if (finished) return;
			finished = true;
			clearTimeout(timer);
			current = null;
			currentAbort = null;
			if (stopBy) return stopSelf(); //  止められた。続きを実行しない
			if (spawnError) output += `\n${spawnError.message}`;
			done({ name: timedOut ? `timeout:${name}` : name, ok: !timedOut && !spawnError && code === 0, code, signal, timedOut, output });
		};
		child.on("error", (e) => {
			spawnError = e;
		});
		child.on("close", finish);
		//  コマンドが、プロセスグループを抜けた孫（setsid したデーモンなど）を残していると、孫が出力の口を
		//  握ったままになり close が来ない。止めたとき（制限時間・停止）は、コマンド自身が終わっていれば、
		//  口を閉じて打ち切る。コマンドが先に終わっていた場合も、後から止めた時点で打ち切る
		const abort = () => {
			if (!exited) return;
			child.stdout.destroy();
			child.stderr.destroy();
			finish(exited.code, exited.signal);
		};
		currentAbort = abort;
		child.on("exit", (code, signal) => {
			exited = { code, signal };
			if (timedOut || stopBy) abort();
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
//  戻り: { failures, skipped, notes, ran, outputs }
export async function runSuite(root, opts, toolsDir, configPath, loaded) {
	const q = (p) => `"${p.replace(/"/g, '\\"')}"`;
	const level = LEVELS.indexOf(opts.level ?? "full");
	const failures = [];
	const skipped = [];
	//  表示は判定が終わってから呼び出し側が出す（フックの解放時は、stdout を systemMessage の JSON だけにするため）
	const notes = [];
	//  実行した検査の出力（通ったものも）。verify --verbose が、警告などを CI のログに出すのに使う
	const outputs = [];
	let ran = 0;
	const run = async (name, cmd, cwd = root) => {
		ran++;
		const r = await runStep(name, cmd, cwd, opts.timeout);
		outputs.push({ name: r.name, ok: r.ok, output: r.output });
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
		return { failures, skipped, notes, ran, outputs };
	}
	if (loaded.error) {
		await specLint("", resolve(root, opts.docs));
		fail("config", `${loaded.error}。${CONFIG_FILE} を直す（検査の範囲とコマンドを読めないので、紐づきの検査と commands を実行できない）`);
		return { failures, skipped, notes, ran, outputs };
	}

	//  1. 設定の形（unit の設定も config-lint が読む）
	await run("config-lint", `node ${tool("config-lint")} --config ${q(configPath)}`);

	//  2〜4 を 1 組の docs / 設定に対して実行する（失敗を集める）
	const checkDocs = async (label, unitRoot, docsDir, cfgPath, unitCfg) => {
		await specLint(label, docsDir);
		await run(`trace-check${label}`, `node ${tool("trace-check")} --root ${q(unitRoot)} --config ${q(cfgPath)}`);
		await run(`entry${label}`, `node ${tool("exec-check")} entry --root ${q(unitRoot)} --config ${q(cfgPath)}`);
		//  入口の一覧と契約の突き合わせ。一覧を出すコマンドは利用プロジェクトのものなので、level fast 以上でだけ実行する。
		//  コマンドでない宣言（未宣言・none・形の誤り）は、exec-check が読むだけで判定できるので、level によらず渡す
		const entriesCheck = `node ${tool("exec-check")} entries --root ${q(unitRoot)} --config ${q(cfgPath)}`;
		const listCmd = isMap(unitCfg.commands) ? unitCfg.commands.list_entries : undefined;
		if (typeof listCmd !== "string" || !listCmd.trim()) await run(`entries${label}`, entriesCheck);
		else if (level < 1) skip(`entries${label}`, `entries${label}（--level lint では、入口の一覧を出すコマンド commands.list_entries を実行しない）`);
		else {
			//  一覧は標準出力だけを受け取る（標準エラーは、失敗したときの表示に残す）。置き場はプロジェクトの外（ツリーを変えない）
			const dir = mkdtempSync(join(tmpdir(), "harness-entries-"));
			tempDirs.add(dir);
			const listFile = join(dir, "entries.jsonl");
			//  コマンドの後ろに改行を置く（末尾が「# コメント」でも、閉じ括弧とリダイレクトがコメントに飲まれない）。
			//  「a | b」の左側の失敗を見逃さないよう、シェルが対応していれば pipefail を付ける（対応していないシェルで
			//  set -o pipefail をそのまま実行すると、シェルごと止まるので、先にサブシェルで試す）。
			//  対応していないシェル（古い dash など）では、左側の失敗は終了コードに出ない。空や途中までの一覧は、E2・E4 が見る
			const wrapped = posix
				? `(set -o pipefail) 2>/dev/null && set -o pipefail\n(\n${listCmd}\n) > ${q(listFile)}`
				: `(${listCmd}) > ${q(listFile)}`;
			try {
				if (await run(`list_entries${label}`, wrapped, unitRoot)) await run(`entries${label}`, `${entriesCheck} --from ${q(listFile)}`);
			} finally {
				rmSync(dir, { recursive: true, force: true });
				tempDirs.delete(dir);
			}
		}
		if (level >= 1) await run(`contract-run${label}`, `node ${tool("contract-run")} --root ${q(unitRoot)} --config ${q(cfgPath)} --docs ${q(docsDir)}`);
		else skip(`contract-run${label}`, `contract-run${label}（--level lint では実行しない）`);
	};

	//  5〜6: commands の宣言（欠落・型の誤りは失敗）と実行
	const runCommands = async (label, cwd, unitCfg, cfgPath) => {
		const { keys, extra, extraError } = readCommands(unitCfg, declaresTests(unitCfg));
		for (const k of COMMAND_KEYS)
			if (keys[k].error) fail(`commands.${k}${label}`, keys[k].error);
		if (extraError) fail(`commands.extra${label}`, extraError);
		const steps = [];
		for (const k of ["typecheck", "lint", "test"]) steps.push({ key: k, name: `${k}${label}`, decl: keys[k], need: 1 });
		//  extra の形が誤っているときは、どれを実行すべきかが決まらないので、extra から先を実行しない
		if (extraError) steps.push({ key: "extra", name: `extra${label}`, decl: { error: extraError }, need: 1 });
		for (const x of extra) steps.push({ key: `extra.${x.name}`, name: `extra.${x.name}${label}`, decl: { cmd: x.cmd }, need: 1 });
		steps.push({ key: "system", name: `system${label}`, decl: keys.system, need: 2 });
		for (const s of steps) {
			if (s.decl.error) break; //  順序に意味がある（前提が欠けたまま後続を実行しない）
			//  実行の記録の検査は test の直後にだけ実行する。宣言しているのに test を実行しないときは、その旨を表示する
			const noCoverage = (why) => {
				if (s.key === "test" && declaresCoverage(unitCfg)) skip(`coverage${label}`, `coverage${label}（${why}）`);
			};
			if (s.decl.none !== undefined) {
				skip(s.name, `commands.${s.key}${label} = none（${s.decl.none}）`);
				noCoverage("commands.test が none なので、実行の記録が無い");
				continue;
			}
			if (level < s.need) {
				skip(s.name, `commands.${s.key}${label}（--level ${LEVELS[level]} では実行しない）`);
				noCoverage(`--level ${LEVELS[level]} では実行しない`);
				continue;
			}
			//  実行の記録は test が書く。前回の記録で通さないよう、test を始めた時刻より新しいことを確かめる
			//  （ファイルの時刻の粒度の分だけ、2 秒さかのぼる）
			const since = Date.now() - 2000;
			if (!(await run(s.name, s.decl.cmd, cwd))) break;
			if (s.key === "test" && !(await run(`coverage${label}`, `node ${tool("exec-check")} coverage --root ${q(cwd)} --config ${q(cfgPath)} --since ${since}`))) break;
		}
	};

	const units = unitsOf(cfg);
	const only = [...new Set(opts.only ?? [])];
	if (!units) {
		if (only.length) fail("config", `--unit は、設定に git.units を宣言したプロジェクトでだけ使える（指定: ${only.join(", ")}）`);
		await checkDocs("", root, resolve(root, opts.docs), configPath, cfg);
		await runCommands("", root, cfg, configPath);
		return { failures, skipped, notes, ran, outputs };
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
		await checkDocs(`:${name}`, unitRoot, unitDocs, unitCfgPath, u.cfg);
		await runCommands(`:${name}`, unitRoot, u.cfg, unitCfgPath);
	}
	//  ルートの commands は、宣言があるときだけ実行する（リポジトリ全体に掛ける検査）
	if (cfg.commands !== undefined) {
		if (only.length) notes.push("[verify] --unit を指定したので、ルートの commands は実行しない");
		else await runCommands("", root, cfg, configPath);
	}
	return { failures, skipped, notes, ran, outputs };
}
