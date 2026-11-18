//  入口の書式の読み方（http のパスと deeplink の名前）。exec-check が入口の一覧と契約を、spec-lint が契約を、同じ読み方で読む。
//  書式の説明の正本は tools/exec-check/README.md の「パスの書式」。ここは、その実装の 1 か所（ADR-0070）。
//  2 つのツールが別の読み方をすると、契約の検査（lint spec）を通った操作が、入口の突き合わせ（lint entries）で初めて
//  合わないと分かる。受ける形と、対象にする契約の範囲を、ここで決める。

const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";

//  違反の文の末尾に添える、正本の場所
export const ENTRY_FORMAT_REF = "書式は tools/exec-check/README.md の「パスの書式」";

//  http 以外の入口の種類（契約の transport と同じ語）
export const NAMED_KINDS = ["deeplink", "push", "stream", "sdk", "local-store", "device", "internal"];
//  契約に entry を持つ種類
const ENTRY_KINDS = ["deeplink", "push", "stream"];

//  書式の検査と入口の突き合わせの対象にする契約か（撤回済みの UC の契約は対象にしない）
export const inEntryScope = (ucStatus) => ucStatus !== "withdrawn";

const COLON_PARAM = /^:[A-Za-z_]\w*$/;
const BRACE_PARAM = /^\{[A-Za-z_][\w-]*\}$/;
const PATTERN_CHARS = /[:*?#{}[\]()<>$|\\]/g;

//  区分 1 つを読む。戻り: { seg } か { problem }
function readSegment(seg) {
	if (seg === "*" || seg === "**") return { seg: "*" };
	if (COLON_PARAM.test(seg) || BRACE_PARAM.test(seg)) return { seg: "{}" };
	if (/^:[A-Za-z_][\w-]*$/.test(seg))
		return { problem: `区分「${seg}」: 「:name」の名前に - は使えない（枠組みによって、名前がどこで終わるかの読み方が違う。- を含む名前は {name} で書く）` };
	if (seg.startsWith(":"))
		return { problem: `区分「${seg}」: 「:name」は、区分の全体を、英字か _ で始まる英数字と _ の名前で書く（:id? や :id{…} のような修飾と、:name の後ろに続く文字は書けない）` };
	if (/^\{[^{}]*\}$/.test(seg))
		return { problem: `区分「${seg}」: 「{name}」の名前は、英字か _ で始まる英数字・_・- で書く（{*splat} や {path:path} は書けない。複数の区分を受けるなら * と書く）` };
	if (/[{}]/.test(seg))
		return { problem: `区分「${seg}」: 区分の一部だけがパラメーターになっている。区分の全体をパラメーターにして書き直す（例: /files/{name}.json → /files/{name}、/items/{id}:cancel → /items/{id}/cancel、/@{user} → /users/{user}）` };
	const bad = [...new Set(seg.match(PATTERN_CHARS) ?? [])];
	if (bad.length)
		return { problem: `区分「${seg}」: 固定の文字列の区分に、書式に使えない文字（${bad.join(" ")}）がある（: * ? # { } [ ] ( ) < > $ | \\ は、枠組みによってパラメーターや正規表現として読まれる。何でも受ける部分は、区分の全体を * と書く）` };
	return { seg };
}

function readSegments(text) {
	const segs = [];
	for (const raw of text.split("/").filter(Boolean)) {
		const r = readSegment(raw);
		if (r.problem) return r;
		segs.push(r.seg);
	}
	return { segs };
}

const QUERY = "クエリ（? 以降）と # は書けない（入口を見分けるのは、パスまでである。クエリのパラメーターは、契約の request に書く）";

//  http のパスを読む。戻り: { key } か { problem }。末尾の / は無視する
export function readHttpPath(path) {
	if (typeof path !== "string") return { problem: `文字列でない（実際: ${JSON.stringify(path)}）` };
	if (!path.startsWith("/")) return { problem: `/ で始まらない（実際: ${JSON.stringify(path)}。接頭辞を含めた完全なパスを書く）` };
	if (/[?#]/.test(path)) return { problem: QUERY };
	const r = readSegments(path);
	return r.problem ? r : { key: "/" + r.segs.join("/") };
}

//  deeplink の名前を読む。スキーム（と、続く //）を外した残りを、http のパスと同じ読み方で読む。戻り: { key } か { problem }
export function readDeeplinkName(name) {
	if (typeof name !== "string" || !name.trim()) return { problem: `空か、文字列でない（実際: ${JSON.stringify(name)}）` };
	const m = /^([A-Za-z][A-Za-z0-9+.-]*):(\/\/)?(.*)$/.exec(name.trim());
	if (!m) return { problem: "スキーム（myapp: や https: など）で始まらない" };
	if (/[?#]/.test(m[3])) return { problem: QUERY };
	const r = readSegments(m[3]);
	return r.problem ? r : { key: `${m[1]}:${m[2] ?? ""}${r.segs.join("/")}` };
}

//  一覧の 1 件（kind と、method・path か name）を、突き合わせに使う形にする。戻り: { key, label } か { label, problem }
export function entryOf(kind, { method, path, name }) {
	if (kind === "http") {
		const label = `${String(method).toUpperCase()} ${path}`;
		const r = readHttpPath(path);
		return r.problem ? { label, problem: r.problem } : { key: `http ${String(method).toUpperCase()} ${r.key}`, label };
	}
	const label = `${kind} ${name}`;
	if (kind !== "deeplink") return { key: `${kind} ${name}`, label };
	const r = readDeeplinkName(name);
	return r.problem ? { label, problem: r.problem } : { key: `deeplink ${r.key}`, label };
}

//  契約の操作 1 つから、入口を読む。
//  戻り: null（inbound でない、入口を持つ transport でない）
//        { key, label }（突き合わせに使う形）
//        { label, field, problem, reportedBySpecLint }（読めない。field は wire.path か entry など、契約のどの項目か。
//          reportedBySpecLint は、spec-lint が別の文で既に報告している欠落（重ねて報告しない）
export function inboundEntryOf(name, op) {
	if (!isMap(op) || op.direction !== "inbound") return null;
	if (op.transport === "http") {
		const wire = op.wire;
		if (!isMap(wire)) return { label: "http（wire が無い）", field: "wire", problem: "wire（method / path / success）が無い", reportedBySpecLint: true };
		const method = wire.method === undefined || wire.method === null ? "" : String(wire.method).trim();
		if (!method) return { label: `http ${JSON.stringify(wire.path ?? null)}`, field: "wire.method", problem: "wire.method が無い", reportedBySpecLint: true };
		if (wire.path === undefined || wire.path === null) return { label: `${method.toUpperCase()}（path が無い）`, field: "wire.path", problem: "wire.path が無い", reportedBySpecLint: true };
		const e = entryOf("http", { method, path: typeof wire.path === "string" ? wire.path.trim() : wire.path });
		return e.problem ? { ...e, field: "wire.path" } : e;
	}
	if (!NAMED_KINDS.includes(op.transport)) return null;
	if (!ENTRY_KINDS.includes(op.transport)) return entryOf(op.transport, { name });
	if (!isText(op.entry)) return { label: `${op.transport}（entry が無い）`, field: "entry", problem: "entry が無い", reportedBySpecLint: true };
	const e = entryOf(op.transport, { name: String(op.entry).trim() });
	return e.problem ? { ...e, field: "entry" } : e;
}
