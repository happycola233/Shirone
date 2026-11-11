/**
 * happycola：配合 scripts/search/build-pagefind.mjs 的「中文按单字索引」。
 *
 * 索引里相邻的汉字、中文标点之间都插了空格，所以：
 * - 查询也要按同样规则插空格；整条查询只有汉字、中文标点和空格时，再加引号走 Pagefind 的短语搜索，
 *   相当于「原文里连续出现这几个字」；混有英文等其他字符时不加引号，按「都出现」匹配。
 * - 结果的标题和摘要里会带着这些空格（包括 <mark> 高亮的字之间），显示前去掉。
 *   原文里汉字、中文标点之间本来不会有空格，去掉不会丢信息。
 */

// 须和 build-pagefind.mjs 的 CJK 保持一致：汉字 + 全角符号、破折号、省略号、弯引号、间隔号
const CJK = "[\\p{Script=Han}\\u3000-\\u303F\\uFF00-\\uFFEF\\u2014\\u2026\\u2018-\\u201D\\u00B7]";
const BETWEEN_CJK = new RegExp(`(?<=${CJK})(?=${CJK})`, "gu");
const ONLY_CJK_AND_SPACES = new RegExp(`^(?:${CJK}|\\s)+$`, "u");
const SPACE_BETWEEN_CJK = new RegExp(`(${CJK})((?:\\s|</?mark>)+)(?=${CJK})`, "gu");

/** 把搜索框里的输入转成适配单字索引的 Pagefind 查询。 */
export function toPagefindQuery(keyword: string): string {
	const trimmed = keyword.trim();
	if (!trimmed) return trimmed;
	// 用户自己加了英文引号的，保持短语搜索
	const quoted = /^".+"$/.test(trimmed);
	const inner = quoted ? trimmed.slice(1, -1) : trimmed;
	const spaced = inner.replace(BETWEEN_CJK, " ");
	return quoted || ONLY_CJK_AND_SPACES.test(inner) ? `"${spaced}"` : spaced;
}

/**
 * 整理结果标题：去掉单字索引产生的空格，再去掉 Pagefind 在不以标点结尾的标题后补上的「. 」
 * （它把标题当成一段文字，自动补句号分隔；原版主题也有这个现象）。
 */
export function tidyResultTitle(title: string): string {
	return tidyCjkSpacing(title).replace(/(?<!\.)\.\s*$/, "").trim();
}

/** 去掉标题、摘要里汉字和中文标点之间（可隔着 <mark> 标签）因单字索引产生的空格。 */
export function tidyCjkSpacing(text: string): string {
	return text.replace(
		SPACE_BETWEEN_CJK,
		(_, cjk: string, between: string) => cjk + between.replace(/\s+/g, ""),
	);
}
