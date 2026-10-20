//  厳格サブセット YAML パーサ（spec-lint / trace-check / contract-run が共有する。依存ゼロの Node）
//  契約（contract.yaml）と共有語彙（_shared/components.yaml）を、どのツールも同じ規則で読むための唯一の実装。
//  ツールごとに読み方が違うと、同じ契約を一方は fixed、他方は draft と読むような分裂が生じる（ADR-0056）。
//  判断の理由は docs/adr/ADR-0002。
//
//  受理するのはマップ / シーケンス / フロー記法 / スカラ / コメントのみ。
//  アンカー・エイリアス（& / *）と複数行スカラ（| / >）は構文エラーにする。
//  共有は _shared/components.yaml を通す・長い散文は UC.md / REQ に置く、という
//  契約の分担を「未対応」ではなく「エラー」として入口で落とすためで、
//  サブセットを狭くしていること自体が検査になっている。
//
//  lenient: true は旧 OpenAPI 契約の読み取り（convert）専用。複数行スカラを
//  1 行に畳んで受理する。検証には使わない。

export const BLOCK_INDICATORS = new Set(["|", ">", "|-", ">-", "|+", ">+", "|2", ">2"]);
const isBlockIndicator = (s) => BLOCK_INDICATORS.has(s) || /^[|>][-+]?\d*$/.test(s);
export const isQuoted = (s) =>
	(s.startsWith('"') && s.endsWith('"') && s.length > 1) ||
	(s.startsWith("'") && s.endsWith("'") && s.length > 1);
//  キーに {orderId} のようなテンプレート片が入りうる（フロー記法は parseNode が先に見る）
const MAP_ENTRY_RE = /^(?:"[^"]*"|'[^']*'|[^:#]+?)\s*:(\s|$)/;

//  行末コメントを落とす（引用符の中の # は残す）
export function stripComment(line) {
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
export const lineOf = (node, key) =>
	(node && node.__keyLines && node.__keyLines[key]) || (node && node.__line) || 0;

export function parseStrictYaml(text, opts = {}) {
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

export const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
