//  入口のパスの書式（exec-check の入口の一覧と、契約の wire.path が共有する読み方。ADR-0070）
//
//  書式は harness が決める。特定の枠組みの書き方には寄せない。/ で区切った区分ごとに、次の 3 つだけを読む:
//    パラメーター 1 つ   区分の全体が :name か {name}（名前は、英字か _ で始まる英数字・_・-）。2 つは同じものとみなし、名前は比べない
//    何でも受ける部分    * （** も同じ）。パラメーター 1 つとは別のもの。相手も同じ位置に * と書いてあるときだけ合う
//    固定の文字列       PATTERN_CHARS を 1 つも含まない区分
//  それ以外の形（[...slug]、{*splat}、:rest{.+}、{path:path}、:id?、${id}、{name}.json、{id}:cancel、? や # の付いたパスなど）は、
//  区分をいくつ受けるのか、省略できるのかを決められないので読まない。パラメーター 1 つとみなすと、契約より広い入口が
//  契約の {id} に合ったことになる。末尾の / は無視する。
//  一覧を読む側（exec-check）と契約を書く側（spec-lint）が別の読み方をすると、fixed にした後で初めて合わないと分かるので、
//  読み方をここ 1 か所に置く。

const PARAM_SEG = /^(?::[A-Za-z_][\w-]*|\{[A-Za-z_][\w-]*\})$/;
const PATTERN_CHARS = /[:*?#{}[\]()<>$|\\]/;

//  パスを、突き合わせに使う形にならす。書式に無い形を含めば null
export function normEntryPath(path) {
	const segs = [];
	for (const seg of path.split("/").filter(Boolean)) {
		if (seg === "*" || seg === "**") segs.push("*");
		else if (PARAM_SEG.test(seg)) segs.push("{}");
		else if (PATTERN_CHARS.test(seg)) return null;
		else segs.push(seg);
	}
	return "/" + segs.join("/");
}

//  deeplink の名前をならす。/ で区切った区分の全体が :name か {name} のときだけ、パラメーターとみなす
//  （myapp:profile の「:profile」のように、区分の一部が同じ形に見えるものは、文字どおりに比べる）
export const normEntryName = (name) =>
	name
		.split("/")
		.map((seg) => (PARAM_SEG.test(seg) ? "{}" : seg))
		.join("/");

//  違反の文に添える、書式の説明（1 つの文を、一覧の側と契約の側で使う）
export const ENTRY_PATH_FORM =
	"パラメーターは、/ で区切った区分の全体を :name か {name} と書く（名前は、英字か _ で始まる英数字・_・-）。何でも受ける部分は * と書く。" +
	"それ以外の形（[...slug]、{*splat}、:rest{.+}、:id?、{name}.json、{id}:cancel など）と、? や # を含むパスは読まない";
