/**
 * 新浪财经日K线备用数据源（东方财富失败时使用）
 * 日K: scale=240, 返回 day, open, close, high, low, volume
 * 与东方财富一致，统一走 /api 代理便于公网部署
 */

const BASE = '/api/sina'

export interface SinaKItem {
  day: string
  open: number
  close: number
  high: number
  low: number
  volume: number
}

/** 新浪日K → 东方财富 RawKLine 格式 */
export function toRawKLine(s: SinaKItem): { f51: string; f52: number; f53: number; f54: number; f55: number; f56: number } {
  return {
    f51: s.day,
    f52: Number(s.open),
    f53: Number(s.close),
    f54: Number(s.high),
    f55: Number(s.low),
    f56: Number(s.volume),
  }
}

/** 获取日K线，symbol 如 sh600519、sz000001 */
export async function fetchDailyKLineSina(symbol: string): Promise<SinaKItem[]> {
  const url = `${BASE}/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${encodeURIComponent(symbol)}&scale=240&ma=no&datalen=1023`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' } })
  let text = (await res.text()).trim()
  if (!text || text.startsWith('<')) return []
  // 兼容 JSONP 包装：xxx([...])
  if (text.startsWith('(') === false && text.includes('([')) {
    const start = text.indexOf('([')
    const end = text.lastIndexOf('])') + 1
    if (start !== -1 && end > start) text = text.slice(start + 1, end)
  }
  try {
    const arr = JSON.parse(text) as Array<{ day: string; open: string; close: string; high: string; low: string; volume: string }>
    if (!Array.isArray(arr)) return []
    return arr.map((r) => ({
      day: r.day,
      open: Number(r.open),
      close: Number(r.close),
      high: Number(r.high),
      low: Number(r.low),
      volume: Number(r.volume),
    }))
  } catch {
    return []
  }
}
