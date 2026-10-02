#!/usr/bin/env node
//
//  git-lint — ブランチ名とコミットメッセージの書式検査（harness 同梱ツール。依存ゼロの Node）
//
//  develop の commit.md（Cutting the branch / Format reference）が定める形のうち、
//  判断を要さず機械で決まる部分だけを検査する。どのユニットを選ぶべきだったか、
//  どのブランチから切ったか、差分と名前が合っているかは判断なので見ない（ADR-0039）。
//
//  何を検査するかはホストが traceconfig.json の git ブロックで宣言する:
//    "git": {}                                  単一ユニット。ブランチは <type>/<topic>
//    "git": { "units": { "app-a": "apps/a" } }  モノレポ。ブランチは <unit>/<topic>、scope も unit
//    "git": { "exempt_branches": ["dependabot/**"] }   検査しないブランチ（bot など。glob は ** / * / ?）
//  git ブロックが無ければ「検査していない」と明示して 0 で終わる（skip であって pass ではない）。
//
//  ブランチ名:
//    B1  <prefix>/<topic> の形（スラッシュはちょうど 1 つ）
//    B2  prefix は宣言された unit か repo（モノレポ）／コミットの type（単一ユニット）
//    B3  topic は小文字 ASCII のケバブケース 2〜5 語
//  コミットメッセージ（1 行目）:
//    M1  <type>(<scope>): <subject> の形で、type は閉じた語彙
//    M2  subject の末尾に句点を付けない
//    M3  モノレポでは scope が必須で、宣言された unit か repo
//    "Merge " / "Revert \"" で始まるものは git が作る文面なので対象外（一覧には出す）
//
//  使い方:
//    node git-lint.mjs branch  [--name <branch>] [--root <host root>] [--config traceconfig.json]
//    node git-lint.mjs message (--file <path> | --range <base>..<head>) [--branch <name>] [--root ...] [--config ...]
//      --name     検査する名前（既定は現在のブランチ。CI の detached HEAD では必須）
//      --file     commit-msg フックが渡すメッセージファイル（# 行は無視する）
//      --range    その範囲の各コミット（マージコミットを除く）
//      --branch   exempt_branches と突き合わせる名前（既定は現在のブランチ）
//
//  終了コード: 0 = 違反なし（未宣言・対象外を含む。行に明示する） / 1 = 違反あり / 2 = 設定・引数の異常
//  baseline は持たない（名前と文面はその場で直すもの）。
//

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const TAG = "[git-lint]";
//  commit.md「The types」表と同じ閉じた語彙（test がこの一致を固定する）
const TYPES = ["feat", "fix", "docs", "refactor", "test", "perf", "style", "build", "ci", "chore"];
//  どの unit にも属さない変更の接頭辞。unit 名としては宣言できない
const REPO_UNIT = "repo";
const UNIT_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOPIC_RE = /^[a-z0-9]+(?:-[a-z0-9]+){1,4}$/;
const HEADER_RE = /^([A-Za-z]+)(?:\(([^()]*)\))?(!)?: (\S.*)$/;
const GENERATED_RE = /^(?:Merge |Revert ")/;

//  ---- glob（依存ゼロの最小実装: ** / * / ? のみ。gate-hook と同じ規約） ----------

function globToRegExp(glob) {
	let re = "";
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i];
		if (c === "*") {
			if (glob[i + 1] === "*") {
				if (glob[i + 2] === "/") {
					re += "(?:.*/)?";
					i += 2;
				} else {
					re += ".*";
					i += 1;
				}
			} else re += "[^/]*";
		} else if (c === "?") re += "[^/]";
		else if ("\\^$.|+()[]{}".includes(c)) re += "\\" + c;
		else re += c;
	}
	return new RegExp("^" + re + "$");
}

//  ---- 設定 ---------------------------------------------------------------------

function loadConfig(configPath) {
	if (!existsSync(configPath)) {
		console.error(`${TAG} 設定が無い: ${configPath}（テンプレート templates/develop/traceconfig.json を host 直下に置く）`);
		return null;
	}
	try {
		return JSON.parse(readFileSync(configPath, "utf8"));
	} catch (e) {
		console.error(`${TAG} 設定が JSON として読めない: ${configPath}（${e.message}）`);
		return null;
	}
}

//  git ブロックを読む。返り値: { declared: false } / { declared: true, units, exempt } / null（設定異常）
//  units は Map<名前, ディレクトリ>。単一ユニットのホストでは null
function readGitBlock(cfg, root) {
	if (cfg.git === undefined) return { declared: false };
	const g = cfg.git;
	if (g === null || typeof g !== "object" || Array.isArray(g)) {
		console.error(`${TAG} traceconfig.json の git はオブジェクトで書く`);
		return null;
	}
	let units = null;
	if (g.units !== undefined) {
		if (g.units === null || typeof g.units !== "object" || Array.isArray(g.units)) {
			console.error(`${TAG} git.units は { "<unit 名>": "<ディレクトリ>" } で書く`);
			return null;
		}
		units = new Map();
		for (const [name, dir] of Object.entries(g.units)) {
			if (name === "_comment") continue;
			if (!UNIT_NAME_RE.test(name)) {
				console.error(`${TAG} git.units: unit 名 ${name} が小文字 ASCII のケバブケースでない`);
				return null;
			}
			if (name === REPO_UNIT) {
				console.error(`${TAG} git.units: ${REPO_UNIT} は「どの unit にも属さない変更」の予約名で、unit としては宣言できない`);
				return null;
			}
			if (typeof dir !== "string" || !dir.trim()) {
				console.error(`${TAG} git.units.${name}: ディレクトリを文字列で書く`);
				return null;
			}
			const abs = resolve(root, dir);
			if (!existsSync(abs) || !statSync(abs).isDirectory()) {
				console.error(`${TAG} git.units.${name}: ディレクトリ ${dir} が無い（宣言が古い）`);
				return null;
			}
			units.set(name, dir);
		}
		if (units.size === 0) {
			console.error(`${TAG} git.units が空（モノレポでないなら units を書かない）`);
			return null;
		}
	}
	let exempt = [];
	if (g.exempt_branches !== undefined) {
		if (!Array.isArray(g.exempt_branches) || g.exempt_branches.some((p) => typeof p !== "string" || !p)) {
			console.error(`${TAG} git.exempt_branches は glob 文字列の配列で書く`);
			return null;
		}
		exempt = g.exempt_branches;
	}
	return { declared: true, units, exempt };
}

const isExempt = (branch, git) => git.exempt.some((p) => globToRegExp(p).test(branch));
const prefixesOf = (git) => (git.units ? [...git.units.keys(), REPO_UNIT] : TYPES);

//  ---- git ----------------------------------------------------------------------

function git(root, args) {
	const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
	return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

//  detached HEAD（CI のチェックアウト）では空文字
const currentBranch = (root) => git(root, ["symbolic-ref", "--short", "-q", "HEAD"]).out;

//  ---- 検査 ---------------------------------------------------------------------

function checkBranch(name, cfg) {
	const shape = cfg.units ? "<unit>/<topic>" : "<type>/<topic>";
	const parts = name.split("/");
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		return [`B1 ${name}: ${shape} の形でない（スラッシュはちょうど 1 つ。既定ブランチや unit 名だけのブランチでは作業しない）`];
	}
	const [prefix, topic] = parts;
	const problems = [];
	const prefixes = prefixesOf(cfg);
	if (!prefixes.includes(prefix)) {
		const kind = cfg.units ? "宣言された unit" : "コミットの type";
		problems.push(`B2 ${name}: 接頭辞 ${prefix} は${kind}でない（使えるのは ${prefixes.join(" / ")}）`);
	}
	if (!TOPIC_RE.test(topic)) problems.push(`B3 ${name}: topic ${topic} が小文字 ASCII のケバブケース 2〜5 語でない`);
	return problems;
}

//  メッセージの 1 行目（空行と commit-msg ファイルの # 行を飛ばす）
function headerOf(text) {
	for (const line of text.split(/\r?\n/)) {
		if (!line.trim() || line.startsWith("#")) continue;
		return line.trimEnd();
	}
	return "";
}

function checkHeader(label, header, cfg) {
	if (!header) return [`M1 ${label}: 件名が無い`];
	const m = HEADER_RE.exec(header);
	if (!m) return [`M1 ${label}: <type>(<scope>): <subject> の形でない — ${header}`];
	const [, type, scope, , subject] = m;
	const problems = [];
	if (!TYPES.includes(type)) problems.push(`M1 ${label}: type ${type} は閉じた語彙に無い（使えるのは ${TYPES.join(" / ")}）`);
	if (/[.。]$/.test(subject)) problems.push(`M2 ${label}: subject の末尾に句点を付けない — ${header}`);
	if (cfg.units) {
		const scopes = prefixesOf(cfg);
		if (!scope) problems.push(`M3 ${label}: scope が無い（モノレポでは ${scopes.join(" / ")} のどれか）`);
		else if (!scopes.includes(scope)) problems.push(`M3 ${label}: scope ${scope} は宣言された unit でない（使えるのは ${scopes.join(" / ")}）`);
	}
	return problems;
}

function report(problems, okLine) {
	if (problems.length === 0) {
		console.log(`${TAG} ${okLine}`);
		return 0;
	}
	for (const p of problems) console.error(`${TAG} ${p}`);
	console.error(`${TAG} 違反 ${problems.length} 件`);
	return 1;
}

//  ---- コマンド -----------------------------------------------------------------

function cmdBranch(root, cfg, opts) {
	const name = opts.name ?? currentBranch(root);
	if (!name) {
		console.error(`${TAG} ブランチ名が取れない（detached HEAD）。--name で渡す`);
		return 2;
	}
	if (isExempt(name, cfg)) {
		console.log(`${TAG} ${name}: exempt_branches に一致するので検査していない`);
		return 0;
	}
	return report(checkBranch(name, cfg), `ブランチ名 OK: ${name}`);
}

function cmdMessage(root, cfg, opts) {
	if ((opts.file === null) === (opts.range === null)) {
		console.error(`${TAG} message には --file <path> か --range <base>..<head> のどちらか一方が要る`);
		return 2;
	}
	const branch = opts.branch ?? currentBranch(root);
	if (branch && isExempt(branch, cfg)) {
		console.log(`${TAG} ${branch}: exempt_branches に一致するのでメッセージを検査していない`);
		return 0;
	}

	const messages = [];
	if (opts.file !== null) {
		if (!existsSync(opts.file)) {
			console.error(`${TAG} メッセージファイルが無い: ${opts.file}`);
			return 2;
		}
		messages.push({ label: opts.file, text: readFileSync(opts.file, "utf8") });
	} else {
		const list = git(root, ["rev-list", "--no-merges", opts.range]);
		if (!list.ok) {
			console.error(`${TAG} 範囲が読めない: ${opts.range}（${list.err}）`);
			return 2;
		}
		for (const sha of list.out.split("\n").filter(Boolean)) {
			messages.push({ label: sha.slice(0, 7), text: git(root, ["log", "-1", "--format=%B", sha]).out });
		}
	}

	const problems = [];
	let checked = 0;
	for (const { label, text } of messages) {
		const header = headerOf(text);
		if (GENERATED_RE.test(header)) {
			console.log(`${TAG} ${label}: git が作る文面なので検査していない — ${header}`);
			continue;
		}
		checked++;
		problems.push(...checkHeader(label, header, cfg));
	}
	return report(problems, `コミットメッセージ OK: ${checked} 件`);
}

function parseArgs(argv) {
	const opts = { cmd: argv[0], root: null, config: null, name: null, file: null, range: null, branch: null };
	const take = { "--root": "root", "--config": "config", "--name": "name", "--file": "file", "--range": "range", "--branch": "branch" };
	for (let i = 1; i < argv.length; i++) {
		const key = take[argv[i]];
		if (!key || argv[i + 1] === undefined) {
			console.error(`${TAG} 不明な引数、または値が無い: ${argv[i]}`);
			return null;
		}
		opts[key] = argv[++i];
	}
	if (opts.cmd !== "branch" && opts.cmd !== "message") {
		console.error(
			"usage: git-lint.mjs branch [--name <branch>] [--root .] [--config traceconfig.json]\n" +
				"       git-lint.mjs message (--file <path> | --range <base>..<head>) [--branch <name>] [--root .] [--config traceconfig.json]",
		);
		return null;
	}
	return opts;
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (!opts) return 2;
	const root = resolve(opts.root ?? process.cwd());
	const raw = loadConfig(opts.config ? resolve(opts.config) : join(root, "traceconfig.json"));
	if (!raw) return 2;
	const cfg = readGitBlock(raw, root);
	if (!cfg) return 2;

	//  未宣言 ＝ 検査していない。pass ではないことを行に書いて 0 で終える
	if (!cfg.declared) {
		console.log(`${TAG} traceconfig.json に git が未宣言: ブランチ名・コミットメッセージの検査は行われていない`);
		return 0;
	}
	return opts.cmd === "branch" ? cmdBranch(root, cfg, opts) : cmdMessage(root, cfg, opts);
}

process.exit(main());
