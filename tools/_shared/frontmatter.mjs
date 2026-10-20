//  frontmatter の読み方（spec-lint / trace-check / gate-hook が共有する唯一の実装）。
//  ツールごとに読み方が違うと、同じ文書を一方は active、他方は draft と読む分裂が生じる（ADR-0056）。
//  曖昧な書き方は problems として返し、spec-lint が違反にする:
//    区切り行は `---` ちょうど（`--- ` や `---x` は区切りもどき）、キーの行は先頭が空白でない、キーは重複しない。

export function parseFrontmatter(text) {
	const lines = text.split(/\r?\n/);
	const problems = [];
	if (lines[0] !== "---") {
		if (/^---/.test(lines[0] ?? "")) problems.push({ line: 1, msg: `frontmatter の開始行は "---" ちょうどにする（実際: "${lines[0]}"）` });
		return { data: {}, body: text, hasFm: false, raw: [], problems };
	}
	const data = {};
	const raw = [];
	let i = 1;
	let closed = false;
	for (; i < lines.length; i++) {
		const line = lines[i];
		if (line === "---") {
			i++;
			closed = true;
			break;
		}
		if (/^\s*---/.test(line)) problems.push({ line: i + 1, msg: `区切りもどきの行がある（区切りは "---" ちょうど。実際: "${line}"）` });
		raw.push(line);
		if (!line.trim() || /^\s*#/.test(line)) continue;
		if (/^\s/.test(line)) {
			problems.push({ line: i + 1, msg: `frontmatter に先頭が空白の行がある（キーは行頭から書く）: "${line.trim()}"` });
			continue;
		}
		const m = line.match(/^([^:#]+):\s*(.*)$/);
		if (!m) {
			problems.push({ line: i + 1, msg: `frontmatter に "キー: 値" でない行がある: "${line}"` });
			continue;
		}
		const key = m[1].trim();
		if (key in data) problems.push({ line: i + 1, msg: `frontmatter のキー "${key}" が重複している` });
		data[key] = m[2].replace(/\s+#.*$/, "").trim(); //  行末の "# コメント" を除去
	}
	if (!closed) problems.push({ line: 1, msg: `frontmatter の終わりの "---" が無い` });
	return { data, body: lines.slice(i).join("\n"), hasFm: true, raw, problems };
}
