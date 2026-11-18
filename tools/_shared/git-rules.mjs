//  ブランチ名とコミットメッセージの決まりのうち、lint git branch と lint git message が共有するもの（単独では実行しない）
//
//  develop の commit.md（ブランチを切る / 書式リファレンス）が定める形のうち、
//  判断を要さず機械で決まる部分だけを検査する。どのユニットを選ぶべきだったか、
//  どのブランチから切ったか、差分と名前が合っているかは判断なので見ない（ADR-0039）。
//
//  何を検査するかはホストが harness.config.json の git ブロックで宣言する:
//    "git": {}                                  単一ユニット。ブランチは <type>/<topic>
//    "git": { "units": { "app-a": "apps/a" } }  モノレポ。ブランチは <unit>/<topic>、scope も unit
//    "git": { "exempt_branches": ["dependabot/**"] }   検査しないブランチ（bot など。glob は ** / * / ?）
//  git ブロックが無ければ「検査していない」と明示して 0 で終わる（skip であって pass ではない）。
//
//  ここが持つのは、設定の git ブロックの読み方、閉じた語彙（コミットの type、接頭辞）、検査しないブランチの判定、
//  2 つのコマンドに共通の引数と始め方、違反の報告。

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { CONFIG_FILE, renamedConfigHint } from "./config.mjs";

//  commit.md「type 一覧」表と同じ閉じた語彙（test がこの一致を固定する）
export const TYPES = ["feat", "fix", "docs", "refactor", "test", "perf", "style", "build", "ci", "chore"];
//  どの unit にも属さない変更の接頭辞。unit 名としては宣言できない
const REPO_UNIT = "repo";
const UNIT_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TOPIC_RE = /^[a-z0-9]+(?:-[a-z0-9]+){1,4}$/;
export const HEADER_RE = /^([A-Za-z]+)(?:\(([^()]*)\))?(!)?: (\S.*)$/;
export const GENERATED_RE = /^(?:Merge |Revert ")/;

//  ---- glob（依存ゼロの最小実装: ** / * / ? のみ。guard と同じ規約） ----------

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

function loadConfig(TAG, configPath) {
	if (!existsSync(configPath)) {
		console.error(`${TAG} 設定が無い: ${configPath}（テンプレート templates/develop/harness.config.json を host 直下に置く）${renamedConfigHint(configPath)}`);
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
function readGitBlock(TAG, cfg, root) {
	if (cfg.git === undefined) return { declared: false };
	const g = cfg.git;
	if (g === null || typeof g !== "object" || Array.isArray(g)) {
		console.error(`${TAG} harness.config.json の git はオブジェクトで書く`);
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

export const isExempt = (branch, git) => git.exempt.some((p) => globToRegExp(p).test(branch));
export const prefixesOf = (git) => (git.units ? [...git.units.keys(), REPO_UNIT] : TYPES);

//  ---- git ----------------------------------------------------------------------

export function git(root, args) {
	const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
	return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

//  detached HEAD（CI のチェックアウト）では空文字
export const currentBranch = (root) => git(root, ["symbolic-ref", "--short", "-q", "HEAD"]).out;

//  ---- 報告と始め方 -------------------------------------------------------------

export function report(TAG, problems, okLine) {
	if (problems.length === 0) {
		console.log(`${TAG} ${okLine}`);
		return 0;
	}
	for (const p of problems) console.error(`${TAG} ${p}`);
	console.error(`${TAG} 違反 ${problems.length} 件`);
	return 1;
}

//  2 つのコマンドに共通の引数（どちらのコマンドも、同じオプションの組を受け取る）。誤りは表示して null
function parseArgs(TAG, argv) {
	const opts = { root: null, config: null, name: null, file: null, range: null, branch: null };
	const take = { "--root": "root", "--config": "config", "--name": "name", "--file": "file", "--range": "range", "--branch": "branch" };
	for (let i = 0; i < argv.length; i++) {
		const key = take[argv[i]];
		if (!key || argv[i + 1] === undefined) {
			console.error(`${TAG} 不明な引数、または値が無い: ${argv[i]}`);
			return null;
		}
		opts[key] = argv[++i];
	}
	return opts;
}

//  コマンドの始め方: 引数と設定を読み、git が宣言されていれば check(root, git ブロック, opts) の結果を返す。
//  command は "lint git branch" か "lint git message"（出力の頭に付ける）
export function runGitLint(command, check) {
	const TAG = `[${command}]`;
	const opts = parseArgs(TAG, process.argv.slice(2));
	if (!opts) return 2;
	const root = resolve(opts.root ?? process.cwd());
	const raw = loadConfig(TAG, opts.config ? resolve(opts.config) : join(root, CONFIG_FILE));
	if (!raw) return 2;
	const cfg = readGitBlock(TAG, raw, root);
	if (!cfg) return 2;

	//  未宣言 ＝ 検査していない。pass ではないことを行に書いて 0 で終える
	if (!cfg.declared) {
		console.log(`${TAG} harness.config.json に git が未宣言: ブランチ名・コミットメッセージの検査は行われていない`);
		return 0;
	}
	return check(root, cfg, opts);
}
