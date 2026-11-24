/**
 * happycola：按访客当地时间挑选横幅（清晨 / 白天 / 黄昏 / 夜晚），交界前后渐变。
 * 纯计算，不碰 DOM；由 BannerStage 的运行时调用。配置见 `banner.timeOfDay`。
 */

const MINUTES_PER_DAY = 1440;

export interface TimeOfDayBlend {
	/** 底层图片的下标（对应 banner.src 数组） */
	from: number;
	/** 叠在上面的图片下标；不在渐变期时与 from 相同 */
	to: number;
	/** 上层图片的不透明度，0–1 */
	mix: number;
}

/**
 * @param startHours 每张图的开始时间（点），下标与图片数组一一对应，不要求有序
 * @param blendMinutes 交界前后各渐变多少分钟
 * @param minutesOfDay 当前是一天中的第几分钟（可带小数）
 */
export function resolveTimeOfDayBlend(
	startHours: readonly number[],
	blendMinutes: number,
	minutesOfDay: number,
): TimeOfDayBlend {
	const periods = startHours
		.map((hour, index) => ({
			start:
				((Math.round(hour * 60) % MINUTES_PER_DAY) + MINUTES_PER_DAY) %
				MINUTES_PER_DAY,
			index,
		}))
		.sort((a, b) => a.start - b.start);
	if (periods.length === 0) return { from: 0, to: 0, mix: 0 };

	const now =
		((minutesOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
	// 当前时段：最后一个已经开始的；都还没开始说明在午夜之后、第一个时段之前，属于最后一个时段
	let current = periods.length - 1;
	for (let i = 0; i < periods.length; i += 1) {
		if (periods[i].start <= now) current = i;
	}
	const stay = {
		from: periods[current].index,
		to: periods[current].index,
		mix: 0,
	};
	const half = Math.max(blendMinutes, 0);
	if (periods.length === 1 || half === 0) return stay;

	const next = (current + 1) % periods.length;
	const previous = (current - 1 + periods.length) % periods.length;
	const untilNext =
		(periods[next].start - now + MINUTES_PER_DAY) % MINUTES_PER_DAY;
	const sinceStart =
		(now - periods[current].start + MINUTES_PER_DAY) % MINUTES_PER_DAY;

	// 交界前 half 分钟到交界后 half 分钟，上层图从 0 线性过渡到 1；交界那一刻正好一半
	if (untilNext < half) {
		return {
			from: periods[current].index,
			to: periods[next].index,
			mix: (half - untilNext) / (2 * half),
		};
	}
	if (sinceStart < half) {
		return {
			from: periods[previous].index,
			to: periods[current].index,
			mix: (half + sinceStart) / (2 * half),
		};
	}
	return stay;
}
