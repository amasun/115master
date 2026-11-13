/**
 * 从已算好的时间点中均匀挑选 num 个（首尾保留），时间点本身不变以复用缓存
 */
export function pickTimes(times: number[], num?: number): number[] {
  if (!num || num >= times.length)
    return times
  if (num <= 1)
    return times.slice(0, 1)
  const picked = new Set(Array.from({ length: num }, (_, i) =>
    Math.round(i * (times.length - 1) / (num - 1))))
  return times.filter((_, i) => picked.has(i))
}
