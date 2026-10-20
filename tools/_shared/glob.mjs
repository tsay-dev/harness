//  依存ゼロの最小 glob（`**` / `*` / `?` と、先頭の `!` による除外）。trace-check / gate-hook / stop-gate が共有する。
//  パスはリポジトリ直下からの相対パス（区切りは `/`）で比べる。

export function globToRegExp(glob) {
	let re = "";
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i];
		if (c === "*") {
			if (glob[i + 1] === "*") {
				//  "**/" は 0 階層以上、行末の "**" は残り全部
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

export const isGlob = (p) => /[*?]/.test(p);

export function matchesAny(relPath, globs) {
	return globs.some((g) => globToRegExp(g).test(relPath));
}

//  パスか glob の配列（`!` で始まるものは除外）にファイルが入るか。固定パスはそのファイル自身か、その配下を指す
export function inScope(relPath, patterns) {
	let hit = false;
	for (const p of patterns) {
		const neg = p.startsWith("!");
		const pat = (neg ? p.slice(1) : p).replace(/\/+$/, "");
		const ok = isGlob(pat) ? globToRegExp(pat).test(relPath) : relPath === pat || relPath.startsWith(pat + "/");
		if (ok) hit = !neg;
	}
	return hit;
}
