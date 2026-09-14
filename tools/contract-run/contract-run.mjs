#!/usr/bin/env node
//
//  contract-run — 契約 ↔ 実装の実行検査（harness 同梱ツール。依存ゼロの Node）
//
//  spec-lint は契約の「書式」を、trace-check は「参照」を検査する。本ツールはその先、
//  fixed な契約に書かれた examples（正常 1 件以上＋エラーコードごとの異常 1 件以上の実値）を
//  ホスト実装に対して実際に呼び、返答が契約どおりかを機械で判定する。
//  examples はテンプレートで既に必須の実値なので、そのままフィクスチャとして使う。
//
//  実装の呼び方はホストごとに違うため、本ツールは「アダプタ」を通してしか実装に触れない:
//    traceconfig.json の commands.contract_adapter に書かれた 1 行を cwd = host root で 1 回だけ起動し、
//    stdin に 1 例 1 行の JSON（要求）を順に流し、stdout の 1 行 1 JSON（応答）を id で突き合わせる。
//      要求: {"id":1,"uc":"UC-012","operation":"createItem","transport":"http","direction":"outbound",
//             "owned":true,"auth":"bearer","wire":{...}|null,"entry":"..."|null,"request":{...}|null,"case":"ok"}
//      応答: {"id":1,"response":{...}} | {"id":1,"error":"CODE"} | {"id":1,"skip":"<理由>"}
//    アダプタが未宣言なら「検査していない」と明示して 0 で終わる（skip であって pass ではない）。
//
//  判定（1 例ごと）:
//    正常例（response あり / error なし）: 応答が response で、例の response が実際の response の部分集合であること
//      （プリミティブは厳密一致、配列は同じ長さで要素ごとに部分集合、オブジェクトは例のキーが全部あり、実際側の余分なキーは許す）
//    異常例（error あり）: 応答が同じ code の error であること。response が返れば fail、別 code も fail
//    skip 応答: 理由つきで skip に数える（pass にはしない。skip は見える負債）
//    response も error も無い例: 例の不備として fail
//
//  使い方:
//    node contract-run.mjs [--root <host root>] [--config traceconfig.json] [--docs docs]
//                          [--uc UC-012 ...] [--all] [--include-external] [--json] [--timeout 120]
//      --uc                 x-uc で絞る（複数可）
//      --all                draft の契約も実行する（既定は x-status: fixed だけ）
//      --include-external   owned: false の操作も実行する（既定は owned: true だけ）
//      --json               {results:[{uc,operation,case,verdict,detail}], summary:{pass,fail,skip}} を出力
//      --timeout            実行全体の秒数（既定 120）
//
//  終了コード: 0 = fail なし（skip は許す。一覧に出す） / 1 = fail あり / 2 = 設定・アダプタの異常
//  baseline は持たない（実行結果は負債ではなく、その場で直すもの）。
//

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const TAG = "[contract-run]";
const UC_DIR_RE = /^UC-\d+-[a-z0-9-]+$/;

//  ---- 厳格サブセット YAML パーサ ------------------------------------------------
//
//  tools/spec-lint/spec-lint.mjs の同名関数群の写し（spec-lint は何も export せず、読み込むと
//  main() が走るため import できない）。判断の理由は docs/adr/0002。spec-lint 側を直したら
//  ここも同じ内容に揃える。

//  受理するのはマップ / シーケンス / フロー記法 / スカラ / コメントのみ。
//  アンカー・エイリアス（& / *）と複数行スカラ（| / >）は構文エラーにする。
//  共有は _shared/components.yaml を通す・長い散文は UC.md / REQ に置く、という
//  契約の分担を「未対応」ではなく「エラー」として入口で落とすためで、
//  サブセットを狭くしていること自体が検査になっている。
//
//  lenient: true は旧 OpenAPI 契約の読み取り（convert）専用。複数行スカラを
//  1 行に畳んで受理する。検証には使わない。

const BLOCK_INDICATORS = new Set(["|", ">", "|-", ">-", "|+", ">+", "|2", ">2"]);
const isBlockIndicator = (s) => BLOCK_INDICATORS.has(s) || /^[|>][-+]?\d*$/.test(s);
const isQuoted = (s) =>
	(s.startsWith('"') && s.endsWith('"') && s.length > 1) ||
	(s.startsWith("'") && s.endsWith("'") && s.length > 1);
//  キーに {orderId} のようなテンプレート片が入りうる（フロー記法は parseNode が先に見る）
const MAP_ENTRY_RE = /^(?:"[^"]*"|'[^']*'|[^:#]+?)\s*:(\s|$)/;

//  行末コメントを落とす（引用符の中の # は残す）
function stripComment(line) {
	let out = "";
	let quote = null;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (quote) {
			out += c;
			if (c === "\\" && quote === '"') out += line[++i] ?? "";
			else if (c === quote) quote = null;
			continue;
		}
		if (c === '"' || c === "'") {
			quote = c;
			out += c;
			continue;
		}
		if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) break;
		out += c;
	}
	return out;
}

function parseFlow(text, ctx, lineNo) {
	const st = { s: text, i: 0 };
	const skip = () => {
		while (st.i < st.s.length && /\s/.test(st.s[st.i])) st.i++;
	};
	const readQuoted = () => {
		const q = st.s[st.i++];
		let out = "";
		while (st.i < st.s.length && st.s[st.i] !== q) {
			if (st.s[st.i] === "\\" && q === '"') st.i++;
			out += st.s[st.i++];
		}
		st.i++;
		return out;
	};
	const readBare = (stops) => {
		let out = "";
		while (st.i < st.s.length && !stops.includes(st.s[st.i])) out += st.s[st.i++];
		return out.trim();
	};
	const readValue = () => {
		skip();
		const c = st.s[st.i];
		if (c === "{") {
			st.i++;
			const obj = {};
			skip();
			if (st.s[st.i] === "}") {
				st.i++;
				return obj;
			}
			for (;;) {
				skip();
				const key = st.s[st.i] === '"' || st.s[st.i] === "'" ? readQuoted() : readBare([":", ",", "}"]);
				skip();
				if (st.s[st.i] !== ":") {
					ctx.reject(lineNo, `フロー記法のマップに ":" が無い: "${text}"`);
					return obj;
				}
				st.i++;
				obj[key] = readValue();
				skip();
				if (st.s[st.i] === ",") {
					st.i++;
					continue;
				}
				if (st.s[st.i] === "}") {
					st.i++;
					return obj;
				}
				ctx.reject(lineNo, `フロー記法のマップが閉じていない: "${text}"`);
				return obj;
			}
		}
		if (c === "[") {
			st.i++;
			const arr = [];
			skip();
			if (st.s[st.i] === "]") {
				st.i++;
				return arr;
			}
			for (;;) {
				arr.push(readValue());
				skip();
				if (st.s[st.i] === ",") {
					st.i++;
					continue;
				}
				if (st.s[st.i] === "]") {
					st.i++;
					return arr;
				}
				ctx.reject(lineNo, `フロー記法のシーケンスが閉じていない: "${text}"`);
				return arr;
			}
		}
		if (c === '"' || c === "'") return readQuoted();
		return coerce(readBare([",", "}", "]"]), ctx, lineNo);
	};
	const v = readValue();
	skip();
	if (st.i < st.s.length) ctx.reject(lineNo, `フロー記法の後に余分な文字がある: "${st.s.slice(st.i)}"`);
	return v;
}

function coerce(s, ctx, lineNo) {
	if (s === "") return null;
	if (s.startsWith("&") || s.startsWith("*"))
		return ctx.reject(
			lineNo,
			`アンカー / エイリアス "${s.split(/\s/)[0]}" は使えない（共有は _shared/components.yaml の $ref を通す）`,
		);
	if (isQuoted(s)) return s.slice(1, -1);
	if (s === "true") return true;
	if (s === "false") return false;
	if (s === "null" || s === "~") return null;
	if (/^-?\d+$/.test(s)) return Number(s);
	if (/^-?\d*\.\d+$/.test(s)) return Number(s);
	return s;
}

function parseScalar(raw, ctx, lineNo) {
	const s = raw.trim();
	if (s.startsWith("{") || s.startsWith("[")) return parseFlow(s, ctx, lineNo);
	return coerce(s, ctx, lineNo);
}

//  値に行番号を持たせる（メッセージで位置を出すため。列挙には出さない）
function stamp(node, line, keyLines) {
	if (node && typeof node === "object") {
		Object.defineProperty(node, "__line", { value: line, enumerable: false });
		if (keyLines) Object.defineProperty(node, "__keyLines", { value: keyLines, enumerable: false });
	}
	return node;
}
const lineOf = (node, key) =>
	(node && node.__keyLines && node.__keyLines[key]) || (node && node.__line) || 0;

function parseStrictYaml(text, opts = {}) {
	const lenient = !!opts.lenient;
	const problems = [];
	const ctx = {
		lenient,
		reject: (line, msg) => {
			problems.push({ line, msg });
			return null;
		},
	};

	//  1) 行を正規化（コメント除去・空行除去）しつつ、タブを弾く
	const src = text.split(/\r?\n/);
	const rows = [];
	for (let i = 0; i < src.length; i++) {
		if (src[i].includes("\t")) ctx.reject(i + 1, "タブ文字は使えない（インデントは半角スペース）");
		const line = stripComment(src[i]).replace(/\s+$/, "");
		if (line.trim() === "") continue;
		if (line.trim() === "---" || line.trim() === "...") continue;
		rows.push({ no: i + 1, indent: line.match(/^ */)[0].length, text: line.trim() });
	}

	//  2) "- key: value" を "-" と "key: value" の 2 行に割って、以降を一様に扱う
	const flat = [];
	for (const r of rows) {
		if (r.text !== "-" && r.text.startsWith("- ")) {
			const innerOffset = r.text.length - r.text.slice(2).replace(/^ +/, "").length;
			flat.push({ no: r.no, indent: r.indent, text: "-" });
			flat.push({ no: r.no, indent: r.indent + innerOffset, text: r.text.slice(2).trim() });
		} else {
			flat.push(r);
		}
	}

	let pos = 0;
	const skipDeeper = (indent) => {
		while (pos < flat.length && flat[pos].indent > indent) pos++;
	};
	const consumeBlock = (indent) => {
		const parts = [];
		while (pos < flat.length && flat[pos].indent > indent) parts.push(flat[pos++].text);
		return parts.join(" ");
	};

	function parseNode(indent) {
		if (pos >= flat.length || flat[pos].indent < indent) return null;
		const row = flat[pos];
		if (row.text.startsWith("{") || row.text.startsWith("[")) {
			pos++;
			return parseFlow(row.text, ctx, row.no);
		}
		if (row.text === "-") return parseSeq(indent);
		if (!MAP_ENTRY_RE.test(row.text)) {
			pos++;
			return parseScalar(row.text, ctx, row.no);
		}
		return parseMap(indent);
	}

	function parseSeq(indent) {
		const arr = [];
		const startLine = flat[pos].no;
		while (pos < flat.length && flat[pos].indent === indent && flat[pos].text === "-") {
			pos++;
			if (pos < flat.length && flat[pos].indent > indent) arr.push(parseNode(flat[pos].indent));
			else arr.push(null);
		}
		return stamp(arr, startLine);
	}

	function parseMap(indent) {
		const obj = {};
		const keyLines = {};
		const startLine = flat[pos].no;
		while (pos < flat.length && flat[pos].indent >= indent) {
			const row = flat[pos];
			if (row.indent > indent) {
				//  違反行の配下は読み飛ばし、同じ深さに戻って走査を続ける（連鎖エラーを出さない）
				ctx.reject(row.no, `インデントが揃っていない（${row.indent} 桁）`);
				skipDeeper(indent);
				continue;
			}
			if (row.text === "-") break;
			const m = row.text.match(/^("[^"]*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/);
			if (!m) {
				ctx.reject(row.no, `マップの "キー: 値" として読めない: "${row.text}"`);
				pos++;
				continue;
			}
			const key = isQuoted(m[1].trim()) ? m[1].trim().slice(1, -1) : m[1].trim();
			const rest = m[2].trim();
			pos++;
			let value;
			if (rest === "" || rest.startsWith("&") || rest.startsWith("*")) {
				if (rest !== "")
					ctx.reject(
						row.no,
						`アンカー / エイリアス "${rest.split(/\s/)[0]}" は使えない（共有は _shared/components.yaml の $ref を通す）`,
					);
				if (pos < flat.length && flat[pos].indent > indent) value = parseNode(flat[pos].indent);
				else if (pos < flat.length && flat[pos].indent === indent && flat[pos].text === "-")
					value = parseSeq(indent);
				else value = null;
			} else if (isBlockIndicator(rest)) {
				if (lenient) {
					value = consumeBlock(indent);
				} else {
					ctx.reject(row.no, `複数行スカラ "${rest}" は使えない（長い散文は UC.md / REQ に置く）`);
					skipDeeper(indent);
					value = null;
				}
			} else {
				value = parseScalar(rest, ctx, row.no);
			}
			if (key in obj) ctx.reject(row.no, `キー "${key}" が重複している`);
			obj[key] = value;
			keyLines[key] = row.no;
		}
		if (pos < flat.length && flat[pos].indent > indent) {
			ctx.reject(flat[pos].no, `インデントが揃っていない（${flat[pos].indent} 桁）`);
			skipDeeper(indent);
		}
		return stamp(obj, startLine, keyLines);
	}

	const root = flat.length === 0 ? {} : parseNode(flat[0].indent);
	if (pos < flat.length) ctx.reject(flat[pos].no, `トップレベルのインデントが揃っていない`);
	return { root: root || {}, problems };
}

//  ---- 設定 -------------------------------------------------------------------

const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

//  traceconfig は探さない。無ければ 2（アダプタの宣言はここにしか無い）
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

//  ---- 契約の収集 ---------------------------------------------------------------

//  <docs>/goals/**/UC-*/contract.yaml を深さに関係なく集める（GOAL 直下が既定だが配置は trace-check C9 の仕事）
function findContracts(dir) {
	const out = [];
	if (!existsSync(dir)) return out;
	for (const d of readdirSync(dir, { withFileTypes: true })) {
		if (!d.isDirectory()) continue;
		const p = join(dir, d.name);
		if (UC_DIR_RE.test(d.name)) {
			const c = join(p, "contract.yaml");
			if (existsSync(c)) out.push(c);
		}
		out.push(...findContracts(p));
	}
	return out.sort();
}

//  契約 1 件を「実行する例」の列に落とす。書式の妥当性は spec-lint の仕事なので、
//  ここでは実行に要る最小限（operations がマップ、example がマップ）だけを見る
function planContract(file, root, opts) {
	const uc = root["x-uc"] || basename(join(file, ".."));
	const status = root["x-status"];
	if (!opts.all && status !== "fixed") return null;
	if (opts.uc.size && !opts.uc.has(uc)) return null;

	const ops = root["operations"];
	if (!isMap(ops) || Object.keys(ops).length === 0) return { uc, items: [] }; //  境界ゼロは黙って飛ばす

	const items = [];
	for (const [name, op] of Object.entries(ops)) {
		if (!isMap(op)) continue;
		if (op["owned"] !== true && !opts.includeExternal) continue;
		const ex = op["examples"];
		if (!isMap(ex)) continue;
		for (const [caseName, c] of Object.entries(ex)) {
			const item = { uc, operation: name, case: caseName, file, line: lineOf(ex, caseName) };
			if (!isMap(c) || (c["response"] === undefined && c["error"] === undefined)) {
				//  例の不備。アダプタには送らず、その場で fail にする
				item.malformed = "例が不正: response も error も無い";
			} else {
				item.expected = c;
				item.request = {
					uc,
					operation: name,
					transport: op["transport"] ?? null,
					direction: op["direction"] ?? null,
					owned: op["owned"] === true,
					auth: op["auth"] ?? null,
					wire: op["wire"] ?? null,
					entry: op["entry"] ?? null,
					request: c["request"] ?? null,
					case: caseName,
				};
			}
			items.push(item);
		}
	}
	return { uc, items };
}

//  ---- 判定 -------------------------------------------------------------------

const show = (v) => (v === undefined ? "(無し)" : JSON.stringify(v));

//  例（expected）が実際（actual）の部分集合か。最初の不一致を {path, expected, actual} で返す
function subsetMismatch(expected, actual, path = "") {
	if (Array.isArray(expected)) {
		if (!Array.isArray(actual)) return { path: path || "(root)", expected, actual };
		if (expected.length !== actual.length)
			return { path: path || "(root)", expected: `長さ ${expected.length}`, actual: `長さ ${actual.length}`, raw: true };
		for (let i = 0; i < expected.length; i++) {
			const m = subsetMismatch(expected[i], actual[i], `${path}[${i}]`);
			if (m) return m;
		}
		return null;
	}
	if (isMap(expected)) {
		if (!isMap(actual)) return { path: path || "(root)", expected, actual };
		for (const k of Object.keys(expected)) {
			const m = subsetMismatch(expected[k], actual[k], path ? `${path}.${k}` : k);
			if (m) return m;
		}
		return null;
	}
	//  プリミティブは厳密一致（YAML の ok と JSON の "ok" は同じ文字列に落ちている）
	if (expected !== actual) return { path: path || "(root)", expected, actual };
	return null;
}

const mismatchText = (m) =>
	m.raw ? `${m.path}: 期待 ${m.expected} / 実際 ${m.actual}` : `${m.path}: 期待 ${show(m.expected)} / 実際 ${show(m.actual)}`;

//  1 例の判定。応答の「形」が壊れている場合は fail ではなくアダプタ異常（呼び出し側が 2 で落とす）
function judge(item, reply) {
	if (typeof reply.skip === "string") return { verdict: "skip", detail: reply.skip };
	const hasResponse = reply.response !== undefined;
	const hasError = reply.error !== undefined;
	if (!hasResponse && !hasError) return { protocol: `応答に response / error / skip のいずれも無い（id=${reply.id}）` };
	const ex = item.expected;
	if (ex["error"] !== undefined) {
		//  異常例: 同じ code の error だけが pass
		if (hasResponse) return { verdict: "fail", detail: `期待: error ${ex["error"]} / 実際: 正常` };
		if (reply.error !== ex["error"]) return { verdict: "fail", detail: `期待: error ${ex["error"]} / 実際: error ${reply.error}` };
		return { verdict: "pass", detail: `error ${reply.error}` };
	}
	//  正常例: response で、例が実際の部分集合
	if (hasError) return { verdict: "fail", detail: `期待: 正常 / 実際: error ${reply.error}` };
	const m = subsetMismatch(ex["response"], reply.response);
	if (m) return { verdict: "fail", detail: mismatchText(m) };
	return { verdict: "pass", detail: "" };
}

//  ---- アダプタの実行 ------------------------------------------------------------

//  1 プロセスを 1 回だけ起動し、要求を全部流して応答を id で集める。
//  戻り: { replies: Map<id, reply>, stderr: string[], error: string|null }
function runAdapter(cmd, root, requests, timeoutSec) {
	return new Promise((resolvePromise) => {
		const replies = new Map();
		const stderrLines = [];
		let error = null;
		let done = false;
		const known = new Set(requests.map((r) => r.id));
		const child = spawn(cmd, { cwd: root, shell: true, stdio: ["pipe", "pipe", "pipe"] });

		const finish = (code, signal) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			if (!error && code !== 0) error = `アダプタが異常終了した（exit ${code ?? signal}）`;
			if (!error) {
				const missing = requests.filter((r) => !replies.has(r.id));
				if (missing.length)
					error = `応答が無い要求がある（id=${missing
						.slice(0, 5)
						.map((r) => r.id)
						.join(",")}${missing.length > 5 ? ",…" : ""} / ${missing.length} 件）`;
			}
			resolvePromise({ replies, stderr: stderrLines, error });
		};
		const abort = (msg) => {
			if (error) return;
			error = msg;
			child.kill("SIGKILL");
		};
		const timer = setTimeout(() => abort(`タイムアウト（${timeoutSec} 秒）`), timeoutSec * 1000);

		//  応答は行単位。JSON でない行・未知 / 欠落 / 重複の id は即座に異常
		let buf = "";
		const onLine = (line) => {
			if (error || line.trim() === "") return;
			let reply;
			try {
				reply = JSON.parse(line);
			} catch {
				return abort(`stdout に JSON でない行がある: ${line.slice(0, 200)}`);
			}
			if (!isMap(reply) || reply.id === undefined) return abort(`応答に id が無い: ${line.slice(0, 200)}`);
			if (!known.has(reply.id)) return abort(`未知の id の応答: ${reply.id}`);
			if (replies.has(reply.id)) return abort(`id=${reply.id} の応答が重複している`);
			replies.set(reply.id, reply);
		};
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			buf += chunk;
			let nl;
			while ((nl = buf.indexOf("\n")) >= 0) {
				onLine(buf.slice(0, nl));
				buf = buf.slice(nl + 1);
			}
		});
		child.stdout.on("end", () => {
			if (buf.trim()) onLine(buf);
			buf = "";
		});
		child.stderr.setEncoding("utf8");
		let ebuf = "";
		child.stderr.on("data", (chunk) => {
			ebuf += chunk;
			let nl;
			while ((nl = ebuf.indexOf("\n")) >= 0) {
				stderrLines.push(ebuf.slice(0, nl));
				ebuf = ebuf.slice(nl + 1);
			}
		});
		child.stderr.on("end", () => {
			if (ebuf) stderrLines.push(ebuf);
		});

		child.on("error", (e) => {
			error = `アダプタを起動できない: ${e.message}`;
			finish(null, null);
		});
		child.on("close", (code, signal) => finish(code, signal));

		//  要求を順に流し、最後で stdin を閉じる。先に落ちたアダプタへの書き込み（EPIPE）は close 側で拾う
		child.stdin.on("error", () => {});
		for (const r of requests) child.stdin.write(JSON.stringify(r) + "\n");
		child.stdin.end();
	});
}

//  ---- 出力 -------------------------------------------------------------------

function summarize(results) {
	const summary = { pass: 0, fail: 0, skip: 0 };
	for (const r of results) summary[r.verdict]++;
	return summary;
}

function report(results, summary, opts) {
	if (opts.json) {
		const out = results.map(({ uc, operation, case: c, verdict, detail }) => ({ uc, operation, case: c, verdict, detail }));
		console.log(JSON.stringify({ results: out, summary }, null, 2));
		return;
	}
	for (const r of results)
		console.log(`${r.verdict.padEnd(4)}  ${r.uc} ${r.operation}.${r.case}${r.detail ? `  ${r.detail}` : ""}`);
	console.log(`pass ${summary.pass} / fail ${summary.fail} / skip ${summary.skip} (skipped は検査されていない)`);
}

function adapterFailure(msg, stderrLines) {
	console.error(`${TAG} アダプタ異常: ${msg}`);
	const tail = stderrLines.slice(-20);
	if (tail.length) {
		console.error(`${TAG} アダプタの stderr（末尾 ${tail.length} 行）:`);
		for (const l of tail) console.error(`  | ${l}`);
	}
	return 2;
}

//  ---- 引数と main ---------------------------------------------------------------

function parseArgs(argv) {
	const opts = { root: null, config: null, docs: "docs", uc: new Set(), all: false, includeExternal: false, json: false, timeout: 120 };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--root") opts.root = argv[++i];
		else if (a === "--config") opts.config = argv[++i];
		else if (a === "--docs") opts.docs = argv[++i];
		else if (a === "--uc") {
			for (const u of String(argv[++i] ?? "").split(",")) if (u.trim()) opts.uc.add(u.trim());
		} else if (a === "--all") opts.all = true;
		else if (a === "--include-external") opts.includeExternal = true;
		else if (a === "--json") opts.json = true;
		else if (a === "--timeout") opts.timeout = Number(argv[++i]);
		else {
			console.error(`${TAG} 不明な引数 ${a}`);
			return null;
		}
	}
	if (!Number.isFinite(opts.timeout) || opts.timeout <= 0) {
		console.error(`${TAG} --timeout は正の秒数`);
		return null;
	}
	return opts;
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (!opts) return 2;
	const root = resolve(opts.root ?? process.cwd());
	const cfg = loadConfig(opts.config ? resolve(opts.config) : join(root, "traceconfig.json"));
	if (!cfg) return 2;
	const docsDir = resolve(root, opts.docs);

	//  アダプタ未宣言 ＝ 検査していない。pass ではないことを行に書いて 0 で終える
	const cmd = cfg.commands && typeof cfg.commands.contract_adapter === "string" ? cfg.commands.contract_adapter.trim() : "";
	if (!cmd) {
		const note = `${TAG} commands.contract_adapter 未宣言: 契約の実行検査は行われていない`;
		if (opts.json) {
			console.error(note);
			console.log(JSON.stringify({ results: [], summary: { pass: 0, fail: 0, skip: 0 }, note }, null, 2));
		} else console.log(note);
		return 0;
	}

	//  契約を集めて実行計画に落とす。読めない契約は fail（実装の不一致）ではなく設定異常
	const items = [];
	for (const file of findContracts(join(docsDir, "goals"))) {
		const { root: node, problems } = parseStrictYaml(readFileSync(file, "utf8"));
		if (problems.length) {
			console.error(`${TAG} 契約が読めない: ${file}:${problems[0].line} ${problems[0].msg}（spec-lint validate で直す）`);
			return 2;
		}
		const plan = planContract(file, node, opts);
		if (plan) items.push(...plan.items);
	}

	const requests = [];
	let nextId = 1;
	for (const it of items) {
		if (it.malformed) continue;
		it.id = nextId++;
		requests.push({ id: it.id, ...it.request });
	}

	let replies = new Map();
	if (requests.length) {
		const run = await runAdapter(cmd, root, requests, opts.timeout);
		if (run.error) return adapterFailure(run.error, run.stderr);
		replies = run.replies;
	}

	const results = [];
	for (const it of items) {
		const base = { uc: it.uc, operation: it.operation, case: it.case };
		if (it.malformed) {
			results.push({ ...base, verdict: "fail", detail: it.malformed });
			continue;
		}
		const j = judge(it, replies.get(it.id));
		if (j.protocol) return adapterFailure(j.protocol, []);
		results.push({ ...base, verdict: j.verdict, detail: j.detail });
	}

	const summary = summarize(results);
	report(results, summary, opts);
	return summary.fail > 0 ? 1 : 0;
}

process.exit(await main());
