import type { KLineItem, StockWithData } from '../types'
import { fetchStockList, fetchKLine, fetchHolderChange, fetchStockSector, secidFromCode } from './eastmoney'
import { fetchDailyKLineSina, toRawKLine } from './sina'

function parseKlines(raw: Array<{ f51: string; f52: number; f53: number; f54: number; f55: number; f56: number }>): KLineItem[] {
  return raw.map((r) => ({
    date: r.f51,
    open: r.f52,
    close: r.f53,
    high: r.f54,
    low: r.f55,
    volume: r.f56,
  }))
}

function secidToSinaSymbol(secid: string): string {
  const prefix = secid.startsWith('1.') ? 'sh' : 'sz'
  const code = secid.replace(/^\d\./, '')
  return prefix + code
}

/** 用日线按周聚合出周K（东方财富周线失败时用） */
function buildWeeklyFromDaily(daily: KLineItem[]): KLineItem[] {
  const weekMap = new Map<string, KLineItem[]>()
  for (const k of daily) {
    const d = new Date(k.date + 'T12:00:00')
    const dayOfWeek = d.getDay()
    const daysToMonday = (dayOfWeek + 6) % 7
    d.setDate(d.getDate() - daysToMonday)
    const key = d.toISOString().slice(0, 10)
    if (!weekMap.has(key)) weekMap.set(key, [])
    weekMap.get(key)!.push(k)
  }
  const weeks = Array.from(weekMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, bars]) => {
      const first = bars[0]
      const last = bars[bars.length - 1]
      return {
        date: last.date,
        open: first.open,
        close: last.close,
        high: Math.max(...bars.map((b) => b.high)),
        low: Math.min(...bars.map((b) => b.low)),
        volume: bars.reduce((s, b) => s + b.volume, 0),
      }
    })
  return weeks
}

/** 拉取单只股票日线、周线、散户数量变化；日线优先新浪，周线/散户数据失败不拖垮 */
export async function fetchStockData(
  code: string,
  name: string,
  secid: string
): Promise<StockWithData | null> {
  try {
    const symbol = secidToSinaSymbol(secid)
    let dailyRaw: Array<{ f51: string; f52: number; f53: number; f54: number; f55: number; f56: number }> = []
    const sinaDaily = await fetchDailyKLineSina(symbol)
    if (sinaDaily.length >= 10) {
      dailyRaw = sinaDaily.map(toRawKLine)
    }
    if (dailyRaw.length < 10) {
      const emDaily = await fetchKLine(secid, 101)
      if (emDaily.length >= 10) dailyRaw = emDaily
    }
    const daily = parseKlines(dailyRaw)
    daily.sort((a, b) => a.date.localeCompare(b.date))
    if (daily.length < 10) return null

    let weekly: KLineItem[] = []
    try {
      const weeklyRaw = await fetchKLine(secid, 102)
      weekly = parseKlines(weeklyRaw)
      weekly.sort((a, b) => a.date.localeCompare(b.date))
    } catch { /* 东方财富周线失败时用日线聚合 */ }
    if (weekly.length < 2) weekly = buildWeeklyFromDaily(daily)
    let holderChange: number | null = null
    let holderChangeRatio: number | null = null
    try {
      const holder = await fetchHolderChange(code)
      holderChange = holder?.change ?? null
      holderChangeRatio = holder?.ratio ?? null
    } catch { /* 散户数量数据失败仅影响策略1、3 */ }

    const latest = daily[daily.length - 1]
    const price = latest.close
    const ma5 = daily.length >= 5
      ? daily.slice(-5).reduce((s, k) => s + k.close, 0) / 5
      : null
    const ma10 = daily.length >= 10
      ? daily.slice(-10).reduce((s, k) => s + k.close, 0) / 10
      : null
    return {
      code,
      name,
      market: secid.startsWith('1') ? 'sh' : 'sz',
      secid,
      daily,
      weekly,
      holderChange,
      holderChangeRatio,
      price,
      ma5,
      ma10,
    }
  } catch {
    return null
  }
}

/** 获取股票列表（用于选股池） */
export async function getStockList(): Promise<Array<{ code: string; name: string; secid: string }>> {
  return fetchStockList()
}

/** 获取个股所属行业/板块 */
export async function getStockSector(secid: string): Promise<string | null> {
  return fetchStockSector(secid)
}

export { secidFromCode }
