#!/usr/bin/env node
//
//  convert — 旧 OpenAPI 3.x 契約を harness 契約へ機械変換する（harness convert。docs/adr/ADR-0001）
//
//  形を保つ変換だけを行い、判断が要る箇所（向き・エラーコードの語彙合わせ・summary の日本語・UC の割当）は
//  出力末尾の "# convert:" 注記と stderr に残して author / 人間へ返す。出力は厳格サブセット YAML で、
//  そのまま lint spec に掛かる。写像:
//    paths.<path>.<method>（operationId）   → operations.<operationId>（transport: http / wire: method, path, success）
//    parameters（path / query）+ requestBody → request（1 つの object に畳む）
//    responses.2xx                           → response
//    responses.4xx / 5xx                     → errors[]（code は x-error-code > スキーマの code の const / enum > ステータス既定）
//    example(s)                              → examples（正常 ok / 異常はコード名）
//    components.schemas                      → 契約ローカルの schemas:（$ref "#/components/schemas/X" → "#/schemas/X"）
//    security / x-status                     → auth / x-status（未指定は none / draft と注記）
//
//  使い方:
//    harness convert <openapi.yaml> [--uc UC-012] [--direction outbound|inbound] [--out contract.yaml] [--date YYYY-MM-DD]
//
//  終了コード: 0=OK / 2=使い方エラー
//

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { isMap, parseStrictYaml } from "../_shared/strict-yaml.mjs";
import { CONTRACT_STATUS, DIRECTIONS, OP_NAME_RE } from "../_shared/contract-vocab.mjs";
import { parseArgs } from "../_shared/spec-cli.mjs";

const STATUS_CODE_FALLBACK = { 400: "INVALID_INPUT", 401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT", 422: "INVALID_INPUT", 429: "RATE_LIMITED" };
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

const firstLine = (s) => (typeof s === "string" ? s.split(/\r?\n/)[0].trim() : "");

//  "#/components/<section>/X" の $ref を components から引く（無ければそのまま）
function resolveRef(node, comps, section) {
	let cur = node;
	for (let i = 0; i < 8 && isMap(cur) && typeof cur["$ref"] === "string"; i++) {
		const m = cur["$ref"].match(/^#\/components\/([\w-]+)\/([^/]+)$/);
		if (!m || m[1] !== section || !isMap(comps[section]) || !(m[2] in comps[section])) return cur;
		cur = comps[section][m[2]];
	}
	return cur;
}

//  ローカル $ref を契約側の書き方へ（深いコピー）
function rewriteRefs(node) {
	if (Array.isArray(node)) return node.map(rewriteRefs);
	if (!isMap(node)) return node;
	const out = {};
	for (const [k, v] of Object.entries(node)) {
		if (k === "$ref" && typeof v === "string")
			out[k] = v
				.replace(/^#\/components\/schemas\//, "#/schemas/")
				.replace(/^(?:\.\.\/)+_shared\/components\.yaml#\/components\/schemas\//, "../../../_shared/components.yaml#/schemas/");
		else out[k] = rewriteRefs(v);
	}
	return out;
}

const jsonSchemaOf = (content) => {
	if (!isMap(content)) return null;
	const media = content["application/json"] || Object.values(content).find(isMap);
	return isMap(media) && isMap(media.schema) ? media.schema : null;
};
const exampleOf = (content) => {
	if (!isMap(content)) return undefined;
	const media = content["application/json"] || Object.values(content).find(isMap);
	if (!isMap(media)) return undefined;
	if (media.example !== undefined) return media.example;
	if (isMap(media.examples)) {
		const first = Object.values(media.examples).find(isMap);
		if (first && first.value !== undefined) return first.value;
	}
	return undefined;
};

//  get /users/{id} → getUsersById
function camelName(method, path) {
	const parts = path.split("/").filter(Boolean).map((seg) => {
		const prm = seg.match(/^\{(.+)\}$/);
		const word = prm ? "By" + prm[1] : seg;
		return word.replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : "")).replace(/^./, (c) => c.toUpperCase());
	});
	return method + parts.join("");
}

function errorCodesOf(resp, status, comps, notes, name) {
	if (resp && resp["x-error-code"]) return [String(resp["x-error-code"])];
	if (resp && Array.isArray(resp["x-error-codes"])) return resp["x-error-codes"].map(String);
	const schema = resp ? resolveRef(jsonSchemaOf(resp.content), comps, "schemas") : null;
	const props = isMap(schema) && isMap(schema.properties) ? schema.properties : {};
	const nested = isMap(props.error) ? resolveRef(props.error, comps, "schemas") : null;
	const codeProp = props.code || (isMap(nested) && isMap(nested.properties) ? nested.properties.code : null);
	if (isMap(codeProp)) {
		if (codeProp.const !== undefined) return [String(codeProp.const)];
		if (Array.isArray(codeProp.enum) && codeProp.enum.length) return codeProp.enum.map(String);
	}
	const fallback = STATUS_CODE_FALLBACK[status] || (status >= 500 ? "INTERNAL_ERROR" : `HTTP_${status}`);
	notes.push(`${name}: ${status} のエラーコードが旧契約から読めないため ${fallback} を仮置き（_shared errorCodes と照合する）`);
	return [fallback];
}

function buildRequest(op, params, comps) {
	const body = op.requestBody ? resolveRef(op.requestBody, comps, "requestBodies") : null;
	const bodySchema = isMap(body) ? jsonSchemaOf(body.content) : null;
	const props = {};
	const required = [];
	for (const raw of params) {
		const prm = resolveRef(raw, comps, "parameters");
		if (!isMap(prm) || !prm.name || !["path", "query"].includes(prm.in)) continue;
		props[prm.name] = rewriteRefs(isMap(prm.schema) ? prm.schema : { type: "string" });
		if (prm.required === true || prm.in === "path") required.push(prm.name);
	}
	if (!bodySchema && required.length === 0 && Object.keys(props).length === 0) return null;
	if (bodySchema && Object.keys(props).length === 0) return rewriteRefs(bodySchema);
	//  パラメータと本体を 1 つの object に畳む（$ref の本体はここでだけ展開する）
	const inline = bodySchema ? resolveRef(bodySchema, comps, "schemas") : null;
	const merged = { type: "object", required: [...required], properties: { ...props } };
	if (isMap(inline)) {
		if (Array.isArray(inline.required)) merged.required.push(...inline.required.filter((r) => !merged.required.includes(r)));
		if (isMap(inline.properties)) for (const [k, v] of Object.entries(inline.properties)) merged.properties[k] = rewriteRefs(v);
	}
	if (merged.required.length === 0) delete merged.required;
	return merged;
}

function buildExamples(op, responses, success, errs, comps) {
	const ex = {};
	const body = op.requestBody ? resolveRef(op.requestBody, comps, "requestBodies") : null;
	const reqEx = isMap(body) ? exampleOf(body.content) : undefined;
	const okResp = success ? resolveRef(responses[success.key], comps, "responses") : null;
	const okEx = isMap(okResp) ? exampleOf(okResp.content) : undefined;
	if (reqEx !== undefined || okEx !== undefined) {
		ex.ok = {};
		if (reqEx !== undefined) ex.ok.request = reqEx;
		if (okEx !== undefined) ex.ok.response = okEx;
	}
	for (const e of errs) {
		const r = resolveRef(responses[String(e.wire.status)], comps, "responses");
		if (!isMap(r) || exampleOf(r.content) === undefined) continue;
		const key = e.code.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase());
		if (!(key in ex)) ex[key] = { error: e.code }; //  旧契約の異常 example は応答側なので request は持てない
	}
	return ex;
}

function buildOperation(name, op, method, path, params, globalSecurity, comps, opts, notes) {
	const o = { transport: "http", direction: opts.direction, owned: true };
	//  security: [] ＝ none / 未指定 ＝ 文書全体の security / どちらも無ければ none と注記
	const sec = Array.isArray(op.security) ? op.security : globalSecurity;
	if (!Array.isArray(sec)) {
		o.auth = "none";
		notes.push(`${name}: security が無いため auth: none を仮置き（不要なら確定、要るなら _shared authSchemes 名へ）`);
	} else if (sec.length === 0) o.auth = "none";
	else {
		const first = sec.find(isMap);
		o.auth = first && Object.keys(first).length ? Object.keys(first)[0] : "none";
	}
	o.summary = firstLine(op.summary) || firstLine(op.description) || `<${name} が何をするか 1 行>`;
	if (o.summary.startsWith("<")) notes.push(`${name}: summary が無い（1 行で書く）`);
	const responses = isMap(op.responses) ? op.responses : {};
	const statuses = Object.keys(responses).map((key) => ({ key, code: Number(key) })).filter((s) => Number.isInteger(s.code));
	const success = statuses.find((s) => s.code >= 200 && s.code < 300);
	o.wire = { method: method.toUpperCase(), path, success: success ? success.code : 200 };
	if (!success) notes.push(`${name}: 2xx レスポンスが無い（wire.success は 200 を仮置き）`);
	const request = buildRequest(op, params, comps);
	if (request) o.request = request;
	if (success) {
		const r = resolveRef(responses[success.key], comps, "responses");
		const schema = isMap(r) ? jsonSchemaOf(r.content) : null;
		if (schema) o.response = rewriteRefs(schema);
	}
	//  4xx / 5xx → errors。1 件も無ければ errors: []（失敗経路を持たない宣言。旧契約に無かった失敗例を発明しない）
	const errs = [];
	for (const s of statuses) {
		if (s.code < 400) continue;
		const r = resolveRef(responses[s.key], comps, "responses");
		const when = (isMap(r) && firstLine(r.description)) || `<発生条件を 1 行>`;
		if (when.startsWith("<")) notes.push(`${name}: ${s.code} の発生条件（when）が読めない`);
		for (const code of errorCodesOf(r, s.code, comps, notes, name)) errs.push({ code, when, wire: { status: s.code } });
	}
	o.errors = errs;
	const examples = buildExamples(op, responses, success, errs, comps);
	if (Object.keys(examples).length) o.examples = examples;
	return o;
}

function buildContract(oa, opts, notes) {
	const comps = isMap(oa.components) ? oa.components : {};
	const contract = {};
	contract["x-uc"] = opts.uc || "UC-000";
	if (!opts.uc) notes.push("x-uc: --uc UC-nnn が無いため UC-000 を仮置き（配置先の UC ディレクトリの ID に置き換える）");
	contract["x-status"] = CONTRACT_STATUS.includes(oa["x-status"]) ? oa["x-status"] : "draft";
	if (!CONTRACT_STATUS.includes(oa["x-status"])) notes.push("x-status: 旧契約に無いため draft（承認状態を保つなら移行台本の指示で fixed にする）");
	contract["x-spec"] = "./UC.md";
	contract["x-updated"] = opts.date || new Date().toISOString().slice(0, 10);
	const ops = {};
	const globalSecurity = Array.isArray(oa.security) ? oa.security : null;
	for (const [path, item] of Object.entries(isMap(oa.paths) ? oa.paths : {})) {
		if (!isMap(item)) continue;
		const pathParams = Array.isArray(item.parameters) ? item.parameters : [];
		for (const method of HTTP_METHODS) {
			const op = item[method];
			if (!isMap(op)) continue;
			const name = typeof op.operationId === "string" && OP_NAME_RE.test(op.operationId) ? op.operationId : camelName(method, path);
			if (name !== op.operationId) notes.push(`${method.toUpperCase()} ${path}: operationId "${op.operationId ?? ""}" が使えないため ${name} を生成`);
			if (name in ops) notes.push(`${name}: 操作名が重複している（改名する）`);
			ops[name] = buildOperation(name, op, method, path, [...pathParams, ...(Array.isArray(op.parameters) ? op.parameters : [])], globalSecurity, comps, opts, notes);
		}
	}
	contract.operations = ops;
	if (isMap(comps.schemas) && Object.keys(comps.schemas).length) contract.schemas = rewriteRefs(comps.schemas);
	return contract;
}

//  厳格サブセットで書き出す（ブロック記法 + 空の {} / [] + スカラ列の [a, b]。ブロックスカラ・アンカーは出さない）
function emitYaml(value, indent = 0) {
	const pad = "  ".repeat(indent);
	const lines = [];
	if (Array.isArray(value)) {
		for (const item of value) {
			if (isMap(item) && Object.keys(item).length) {
				const inner = emitYaml(item, indent + 1).split("\n");
				lines.push(`${pad}- ${inner[0].trimStart()}`, ...inner.slice(1));
			} else if (Array.isArray(item) && item.length) lines.push(`${pad}-`, ...emitYaml(item, indent + 1).split("\n"));
			else lines.push(`${pad}- ${yamlScalar(item)}`);
		}
		return lines.join("\n");
	}
	for (const [k, v] of Object.entries(value)) {
		const key = yamlKey(k);
		if (isMap(v)) lines.push(Object.keys(v).length ? `${pad}${key}:\n${emitYaml(v, indent + 1)}` : `${pad}${key}: {}`);
		else if (Array.isArray(v)) {
			if (v.length === 0) lines.push(`${pad}${key}: []`);
			else if (v.every((x) => !isMap(x) && !Array.isArray(x))) lines.push(`${pad}${key}: [${v.map(yamlScalar).join(", ")}]`);
			else lines.push(`${pad}${key}:\n${emitYaml(v, indent + 1)}`);
		} else lines.push(`${pad}${key}: ${yamlScalar(v)}`);
	}
	return lines.join("\n");
}
//  引用が要らないのは、先頭が英数・非 ASCII で、YAML の指示子・区切りを含まず、数値 / 真偽 / null に読めない文字列だけ
function yamlScalar(v) {
	if (v === null || v === undefined) return "null";
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	const s = String(v);
	const plain =
		/^[A-Za-z0-9_./\u00A0-\uFFFF][^#:\[\]{},"'`&*!|>%@]*$/.test(s) && !/^(true|false|null|~|-?\d+(\.\d+)?)$/.test(s) && !/^\s|\s$/.test(s);
	return plain ? s : JSON.stringify(s);
}
const yamlKey = (k) => (/^[A-Za-z0-9_$\u00A0-\uFFFF][\w$.\u00A0-\uFFFF-]*$/.test(k) ? k : JSON.stringify(k));

function cmdConvert(opts) {
	const input = opts._[0];
	if (!input || !existsSync(input)) {
		console.error("convert: 入力ファイル（OpenAPI 3.x の YAML）が要る");
		return 2;
	}
	if (!DIRECTIONS.includes(opts.direction)) {
		console.error(`convert: --direction は ${DIRECTIONS.join(" | ")}`);
		return 2;
	}
	//  lenient: 旧契約の複数行スカラは 1 行に畳んで読む（検証では使わない）
	const { root, problems } = parseStrictYaml(readFileSync(input, "utf8"), { lenient: true });
	for (const p of problems) console.error(`  warn  ${input}:${p.line}: ${p.msg}`);
	if (!isMap(root) || (!("openapi" in root) && !("paths" in root))) {
		console.error(`convert: ${input} は OpenAPI 文書ではない（openapi: / paths: が無い）`);
		return 2;
	}
	const notes = [];
	const contract = buildContract(root, opts, notes);
	const text = [
		`# Converted from ${basename(input)} by harness convert — 形を保つ変換。判断が要る箇所は末尾の "# convert:" 注記`,
		`# 向きは --direction（既定 outbound ＝ このアプリが呼ぶ。サーバ側の自前 API なら inbound）`,
		emitYaml(contract),
		...(notes.length ? ["", ...notes.map((n) => `# convert: ${n}`)] : []),
		"",
	].join("\n");
	if (opts.out) {
		writeFileSync(opts.out, text);
		console.error(`convert: ${opts.out} に書き出した（operations ${Object.keys(contract.operations).length} 件 / 注記 ${notes.length} 件）`);
	} else process.stdout.write(text);
	for (const n of notes) console.error(`  note  ${n}`);
	return 0;
}

process.exit(cmdConvert(parseArgs("convert", process.argv.slice(2))));
