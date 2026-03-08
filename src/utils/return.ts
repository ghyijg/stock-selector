import type { KLineItem } from '../types'

/** 在已排序的日线中，取 <= 目标日期的最近一根的收盘价 */
function closeAtOrBefore(daily: KLineItem[], dateStr: string): number | null {
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  let last: number | null = null
  for (const k of sorted) {
    if (k.date > dateStr) break
    last = k.close
  }
  return last
}

/** 计算区间收益率（需保证 daily 已按日期排序） */
export function computeReturn(
  daily: KLineItem[],
  startDate: string,
  endDate: string
): number | null {
  const pStart = closeAtOrBefore(daily, startDate)
  const pEnd = closeAtOrBefore(daily, endDate)
  if (pStart == null || pEnd == null || pStart <= 0) return null
  return (pEnd - pStart) / pStart
}
