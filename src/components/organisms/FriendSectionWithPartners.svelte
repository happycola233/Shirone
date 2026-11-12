<script lang="ts">
/**
 * happycola：友链列表 +「B 站小伙伴」。
 * 小伙伴只在数据里写 UID；访客打开页面时由浏览器按 UID 请求接口，拿到昵称、头像、签名后
 * 并入 FriendSection 的列表（和旧站 friend-partner-fetch.js 的做法一致）。
 * 接口不可用时保留占位：名称显示 UID，头像走接口的跳转地址，页面照常可用。
 */
import FriendSection from "@components/organisms/FriendSection.svelte";
import { onMount } from "svelte";
import type { FriendItem } from "../../data/friends";

interface BiliPartners {
	/** 用户信息接口，按 `?type=json&mid=` / `?type=avatar_redirect&mid=` 调用 */
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
		imgurl: profile.face ? `${profile.face.replace(/^http:/, "https:")}@96w_96h.webp` : item.imgurl,
		desc: profile.sign.trim(),
	};
}

const uids = $derived(partners?.uids ?? []);
let profiles = $state<Record<number, PartnerProfile>>({});

const merged = $derived([
	...friends,
	...uids.map((mid, index) => withProfile(placeholder(mid, index), profiles[mid])),
]);

function readCache(): Record<number, PartnerProfile> | null {
	try {
		const raw = sessionStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const cached = JSON.parse(raw) as { at: number; profiles: Record<number, PartnerProfile> };
		return Date.now() - cached.at < CACHE_TTL ? cached.profiles : null;
	} catch {
		return null;
	}
}

function writeCache(value: Record<number, PartnerProfile>) {
	try {
		sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), profiles: value }));
	} catch {
		/* 存储不可用时不缓存 */
	}
}

async function fetchProfile(mid: number): Promise<PartnerProfile | null> {
	if (!partners) return null;
	try {
		const response = await fetch(`${partners.api}?type=json&mid=${mid}`);
		if (!response.ok) return null;
		const body = await response.json();
		if (body?.code !== 0 || !body.data) return null;
		return {
			name: String(body.data.name ?? ""),
			face: String(body.data.face ?? ""),
			sign: String(body.data.sign ?? ""),
		};
	} catch {
		return null;
	}
}

onMount(() => {
	if (!partners || uids.length === 0) return;
	const cached = readCache();
	if (cached) {
		profiles = cached;
		return;
	}
	let cancelled = false;
	Promise.all(uids.map(async (mid) => [mid, await fetchProfile(mid)] as const)).then((results) => {
		if (cancelled) return;
		const next: Record<number, PartnerProfile> = {};
		for (const [mid, profile] of results) if (profile) next[mid] = profile;
		profiles = next;
		// 全部成功才缓存，避免把一次失败缓存一小时
		if (Object.keys(next).length === uids.length) writeCache(next);
	});
	return () => {
		cancelled = true;
	};
});
</script>

<FriendSection friends={merged} {title} {subtitle} {pageSize} />
