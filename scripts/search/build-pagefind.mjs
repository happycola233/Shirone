/**
 * happycola：生成 Pagefind 搜索索引（替代 `npx pagefind --site dist`）。
 *
 * 为什么不直接用 Pagefind 默认的中文分词：
 * 建索引时 Pagefind 用自带词典切词（如「杜比」「链接」），搜索时浏览器用 Intl.Segmenter 切词
 * （「杜比」→「杜」「比」、「链接」→「链」「接」），两套词典切法不同，正文里很多中文词搜不到。
 *
 * 做法：把 dist 里的 HTML 复制到临时目录，在相邻两个汉字之间插入空格，再交给 Pagefind 建索引，
 * 索引里的中文就按单字存。搜索框那边（src/utils/cjk-search.ts）把查询也拆成单字并按短语查，
 * 等于「按原文连续字符匹配」，不依赖任何一边的词典，所有浏览器表现一致。
 * 只影响索引，网站页面本身不变；搜索结果里多出来的空格由搜索框显示前去掉。
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import * as pagefind from "pagefind";
import { parse as parseYaml } from "yaml";

const SITE = "dist";
const OUTPUT = join(SITE, "pagefind");
// 汉字和中文标点（全角符号、破折号、省略号、弯引号）；两者相邻时、或中间只隔着 HTML 标签（如 <strong>）时插空格。
// 规则须和 src/utils/cjk-search.ts 的 CJK 保持一致。
const CJK = "[\\p{Script=Han}\\u3000-\\u303F\\uFF00-\\uFFEF\\u2014\\u2026\\u2018-\\u201D\\u00B7]";
const BETWEEN_HAN = new RegExp(`(?<=${CJK})(?=(?:<[^>]+>)*${CJK})`, "gu");

// 和 CLI 一样读取仓库根目录的 pagefind.yml（如 exclude_selectors），转成 Node API 的选项名
const CONFIG_KEYS = { root_selector: "rootSelector", exclude_selectors: "excludeSelectors", force_language: "forceLanguage", keep_index_url: "keepIndexUrl", verbose: "verbose" };
const indexOptions = {};
if (existsSync("pagefind.yml")) {
	const config = parseYaml(readFileSync("pagefind.yml", "utf8")) ?? {};
	for (const [key, value] of Object.entries(config)) {
		if (!(key in CONFIG_KEYS)) throw new Error(`pagefind.yml: unsupported key "${key}" (add it to CONFIG_KEYS)`);
		indexOptions[CONFIG_KEYS[key]] = value;
	}
}

const workDir = mkdtempSync(join(tmpdir(), "happycola-pagefind-"));
try {
	let files = 0;
	const walk = (dir) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const source = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (source !== OUTPUT && entry.name !== "_astro") walk(source);
			} else if (entry.name.endsWith(".html")) {
				const target = join(workDir, relative(SITE, source));
				mkdirSync(dirname(target), { recursive: true });
				writeFileSync(target, readFileSync(source, "utf8").replace(BETWEEN_HAN, " "));
				files++;
			}
		}
	};
	walk(SITE);

	rmSync(OUTPUT, { recursive: true, force: true });
	const { index, errors: createErrors } = await pagefind.createIndex(indexOptions);
	if (!index) throw new Error(`Pagefind createIndex failed: ${createErrors?.join("; ")}`);
	const added = await index.addDirectory({ path: workDir });
	if (added.errors?.length) throw new Error(`Pagefind addDirectory failed: ${added.errors.join("; ")}`);
	const written = await index.writeFiles({ outputPath: OUTPUT });
	if (written.errors?.length) throw new Error(`Pagefind writeFiles failed: ${written.errors.join("; ")}`);

	const entry = JSON.parse(readFileSync(join(OUTPUT, "pagefind-entry.json"), "utf8"));
	const pages = Object.values(entry.languages).reduce((sum, lang) => sum + lang.page_count, 0);
	console.log(`[pagefind] ${files} HTML files scanned, ${pages} pages indexed (Chinese indexed per character)`);
} finally {
	await pagefind.close();
	rmSync(workDir, { recursive: true, force: true });
}
