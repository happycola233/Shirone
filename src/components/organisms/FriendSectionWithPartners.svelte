<script lang="ts">
/**
 * happycola：友链列表 +「B 站小伙伴」。
 * 小伙伴只在数据里写 UID；访客打开页面时由浏览器把所有 UID 一次发给接口（mid=1,2,3），
 * 拿到昵称、头像、签名后并入 FriendSection 的列表（和旧站 friend-partner-fetch.js 的做法一致）。
 * 接口不可用时保留占位：名称显示 UID，头像走接口的跳转地址，页面照常可用。
 */
import FriendSection from "@components/organisms/FriendSection.svelte";
import { onMount } from "svelte";
import type { FriendItem } from "../../data/friends";

interface BiliPartners {
	/** 用户信息接口，按 `?mid=1,2,3&type=json`（可一次查多个）/ `?type=avatar_redirect&mid=` 调用 */
	api: string;
	/** 小伙伴条目使用的筛选标签 */
	tag: string;
	uids: number[];
}

interface PartnerProfile {
	name: string;
	face: string;
	sign: string;
}

let {
	friends = [] as FriendItem[],
	partners,
	title,
	subtitle,
	pageSize,
}: {
	friends?: FriendItem[];
	partners?: BiliPartners;
	title?: string;
	subtitle?: string;
	/** 每页条数，原样交给 FriendSection（上游 2026-11 加的分页） */
	pageSize?: number;
} = $props();

const CACHE_KEY = "happycola:bili-partners";
const CACHE_TTL = 60 * 60 * 1000;
const ID_OFFSET = 100000;

function placeholder(mid: number, index: number): FriendItem {
	return {
		id: ID_OFFSET + index,
		title: `UID ${mid}`,
		imgurl: partners ? `${partners.api}?type=avatar_redirect&mid=${mid}` : "",
		desc: "",
		siteurl: `https://space.bilibili.com/${mid}`,
		tags: partners ? [partners.tag] : [],
	};
}

function withProfile(item: FriendItem, profile?: PartnerProfile): FriendItem {
	if (!profile) return item;
	return {
		...item,
		title: profile.name || item.title,
		// 头像缩到 96px，减少流量
		imgurl: profile.face
			? `${profile.face.replace(/^http:/, "https:")}@96w_96h.webp`
			: item.imgurl,
		desc: profile.sign.trim(),
	};
}

const uids = $derived(partners?.uids ?? []);
let profiles = $state<Record<number, PartnerProfile>>({});

const merged = $derived([
	...friends,
	...uids.map((mid, index) =>
		withProfile(placeholder(mid, index), profiles[mid]),
	),
]);

function readCache(): Record<number, PartnerProfile> | null {
	try {
		const raw = sessionStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const cached = JSON.parse(raw) as {
			at: number;
			profiles: Record<number, PartnerProfile>;
		};
		return Date.now() - cached.at < CACHE_TTL ? cached.profiles : null;
	} catch {
		return null;
	}
}

function writeCache(value: Record<number, PartnerProfile>) {
	try {
		sessionStorage.setItem(
			CACHE_KEY,
			JSON.stringify({ at: Date.now(), profiles: value }),
		);
	} catch {
		/* 存储不可用时不缓存 */
	}
}

/** 一次请求拿到所有 UID 的资料；失败时返回空对象，页面保留占位 */
async function fetchProfiles(
	mids: number[],
): Promise<Record<number, PartnerProfile>> {
	const result: Record<number, PartnerProfile> = {};
	if (!partners || mids.length === 0) return result;
	try {
		const response = await fetch(
			`${partners.api}?mid=${mids.join(",")}&type=json`,
		);
		if (!response.ok) return result;
		const body = await response.json();
		if (body?.code !== 0 || !body.data) return result;
		for (const mid of mids) {
			// 查多个时 data 按 UID 分组；只查一个时 data 直接就是那个人的资料
			const info =
				body.data[mid] ??
				(String(body.data.mid) === String(mid) ? body.data : null);
			if (!info) continue;
			result[mid] = {
				name: String(info.name ?? ""),
				face: String(info.face ?? ""),
				sign: String(info.sign ?? ""),
			};
		}
	} catch {
		/* 接口不可用时保留占位 */
	}
	return result;
}

onMount(() => {
	if (!partners || uids.length === 0) return;
	const cached = readCache();
	// 缓存里要有全部 UID 才用（新加的小伙伴不用等缓存过期）
	if (cached && uids.every((mid) => cached[mid])) {
		profiles = cached;
		return;
	}
	let cancelled = false;
	fetchProfiles(uids).then((next) => {
		if (cancelled) return;
		profiles = next;
		// 全部成功才缓存，避免把一次失败缓存一小时
		if (uids.every((mid) => next[mid])) writeCache(next);
	});
	return () => {
		cancelled = true;
	};
});
</script>

<FriendSection friends={merged} {title} {subtitle} {pageSize} />
