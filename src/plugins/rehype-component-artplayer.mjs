import { h } from "hastscript";
import { getArtPlayerEmbedData } from "./markdown/core/artplayer.mjs";

/** Renders a native video player without a client-side player dependency. */
export function ArtPlayerComponent(properties, children) {
	if (Array.isArray(children) && children.length !== 0) return null;

	const embed = getArtPlayerEmbedData(properties);
	if (!embed) return null;
	const { src, title, preload } = embed;

	// happycola：去掉视频下方的标题 + 网址说明栏（标题和文章标题重复，中文文件名的网址转码后很长很难看）。
	// 标题仍作为 aria-label 留给读屏软件。
	return h("figure", { class: "m3-artplayer not-prose", dataArtplayer: true }, [
		h("video", {
			class: "m3-artplayer__video",
			src,
			controls: true,
			preload,
			playsInline: true,
			ariaLabel: title,
		}),
	]);
}
