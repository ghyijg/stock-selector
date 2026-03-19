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

export interface SinaStockItem {
  code: string
  name: string
  secid: string
}

function secidFromCodeLocal(code: string): string {
  const c = code.replace(/\D/g, '')
  if (/^(6|9|5)/.test(c)) return `1.${c}`
  return `0.${c}`
}

function parseLooseJsonArray(text: string): Array<Record<string, unknown>> {
  const t = text.trim()
  if (!t) return []
  try {
    const arr = JSON.parse(t)
    return Array.isArray(arr) ? (arr as Array<Record<string, unknown>>) : []
  } catch {
    // 新浪部分接口返回“近似JSON”（可能有单引号/未加引号键）
    const fixed = t
      .replace(/([{,])\s*([a-zA-Z_][\w]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
    try {
      const arr = JSON.parse(fixed)
      return Array.isArray(arr) ? (arr as Array<Record<string, unknown>>) : []
    } catch {
      return []
    }
  }
}

async function fetchTextWithRetry(url: string, retryCount = 3): Promise<string> {
  let lastErr: unknown = null
  for (let i = 0; i < retryCount; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e) {
      lastErr = e
      if (i < retryCount - 1) await new Promise((r) => setTimeout(r, 350 * (i + 1)))
    }
  }
  throw lastErr
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

/** 新浪全A列表（hs_a），用于东方财富列表异常时补齐股票池 */
export async function fetchStockListSina(): Promise<SinaStockItem[]> {
  const out: SinaStockItem[] = []
  const seen = new Set<string>()
  const pageSize = 80
  const maxPages = 120
  const concurrency = 6

  const parsePage = (arr: Array<Record<string, unknown>>) => {
    for (const row of arr) {
      const rawCode = String((row.code ?? row.symbol ?? '')).replace(/\D/g, '')
      if (!/^\d{6}$/.test(rawCode)) continue
      const code = rawCode
      const name = String(row.name ?? row.symbol ?? code).trim() || code
      const secid = secidFromCodeLocal(code)
      const key = `${code}|${secid}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ code, name, secid })
    }
  }

  const fetchPage = async (page: number): Promise<{ page: number; ok: boolean; arr: Array<Record<string, unknown>> }> => {
    const listUrl = `${BASE}/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=${page}&num=${pageSize}&sort=symbol&asc=1&node=hs_a&symbol=&_s_r_a=page`
    try {
      const text = await fetchTextWithRetry(listUrl, 4)
      const arr = parseLooseJsonArray(text)
      return { page, ok: arr.length > 0, arr }
    } catch {
      return { page, ok: false, arr: [] }
    }
  }

  try {
    // 第一阶段：并发拉全页，快速拿到主体数据
    for (let start = 1; start <= maxPages; start += concurrency) {
      const pages: number[] = []
      for (let p = start; p < start + concurrency && p <= maxPages; p++) pages.push(p)
      const batch = await Promise.all(pages.map((p) => fetchPage(p)))
      for (const item of batch) {
        if (item.ok) parsePage(item.arr)
      }
      await new Promise((r) => setTimeout(r, 100))
    }

    // 第二阶段：对明显缺失的后半区再补抓一轮，减少 2k~4k 阶段断层
    if (out.length < 5000) {
      for (let page = 40; page <= maxPages; page++) {
        const res = await fetchPage(page)
        if (res.ok) parsePage(res.arr)
        if (out.length >= 5000) break
      }
    }
  } catch {
    return out
  }

  return out
}
