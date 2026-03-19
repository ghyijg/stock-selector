/**
 * 东方财富公开接口（A股列表、K线等）
 * 本地开发用 Vite 代理，部署到公网用 Vercel/平台反向代理，统一走 /api 避免跨域
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const REFERER = 'https://quote.eastmoney.com/'
const BASE = {
  list: '/api/em',
  kline: '/api/emhis',
  dc: '/api/emdc',
}

function secidFromCode(code: string): string {
  const c = code.replace(/\D/g, '')
  if (/^6/.test(c)) return `1.${c}`
  if (/^0|^3/.test(c)) return `0.${c}`
  return `0.${c}`
}

// 东方财富该接口在部分网络/代理环境下会对 `pz` 做上限限制，导致“即使请求 5000，也只返回约100条”
// 因此这里按 100 分页，并用 total/去重/无新增停止来避免死循环与提前结束。
const LIST_PAGE_SIZE = 100

/** 获取A股列表（沪深），分页拉取直至取完全部 */
export async function fetchStockList(): Promise<Array<{ code: string; name: string; secid: string }>> {
  const list: Array<{ code: string; name: string; secid: string }> = []
  const seen = new Set<string>()

  const CACHE_KEY = 'stockListCache_v1'
  const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24h

  function readCache(): Array<{ code: string; name: string; secid: string }> | null {
    try {
      if (typeof window === 'undefined') return null
      const raw = window.localStorage.getItem(CACHE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { ts?: number; list?: Array<{ code: string; name: string; secid: string }> }
      const ts = typeof parsed.ts === 'number' ? parsed.ts : 0
      if (!parsed.list || !Array.isArray(parsed.list)) return null
      if (ts > 0 && Date.now() - ts > CACHE_MAX_AGE_MS) return null
      return parsed.list
    } catch {
      return null
    }
  }

  function writeCache(next: Array<{ code: string; name: string; secid: string }>) {
    try {
      if (typeof window === 'undefined') return
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), list: next }))
    } catch {
      // ignore
    }
  }

  async function fetchJsonWithRetry(url: string, retryCount = 3): Promise<any> {
    let lastErr: unknown = null
    for (let i = 0; i < retryCount; i++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: REFERER } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
      } catch (e) {
        lastErr = e
        // 指数退避，避免触发更强的限流
        if (i < retryCount - 1) {
          const ms = 400 * (i + 1)
          await new Promise((r) => setTimeout(r, ms))
        }
      }
    }
    throw lastErr
  }

  // 分市场抓取，避免 fs 合并请求在部分环境下被接口截断（常见现象：只返回约 800/1100 只）
  async function fetchByFs(fs: string) {
    let pn = 1
    const maxPages = 200
    let hasMore = true
    while (hasMore && pn <= maxPages) {
      const url = BASE.list + '/api/qt/clist/get?' + new URLSearchParams({
        fs,
        fields: 'f12,f14,f13',
        pn: String(pn),
        pz: String(LIST_PAGE_SIZE),
      })
      let data: any
      try {
        data = await fetchJsonWithRetry(url, 3)
      } catch {
        // 单个分段抓取失败就停止该分段，继续尝试其他分段
        break
      }
      const raw = data?.data?.diff
      const items = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : [])
      const beforeSize = list.length
      for (const it of items) {
        const code = String((it as { f12?: string }).f12 ?? '')
        if (!code) continue
        const secid = `${(it as { f13?: number }).f13 ?? 0}.${code}`
        const key = `${code}|${secid}`
        if (seen.has(key)) continue
        seen.add(key)
        list.push({
          code,
          name: String((it as { f14?: string; f12?: string }).f14 ?? (it as { f12?: string }).f12 ?? ''),
          secid,
        })
      }

      // 本页没有新增数据：说明翻页无效或已经到尾页
      if (list.length === beforeSize) break
      hasMore = items.length >= LIST_PAGE_SIZE
      pn += 1

      // 轻微节流，降低触发上游断连/限流概率
      await new Promise((r) => setTimeout(r, 120))
    }
  }

  try {
    const segments = [
      'm:0+t:6',   // 深主板
      'm:0+t:80',  // 创业板
      'm:0+t:81',  // 北交所
      'm:1+t:2',   // 沪主板
      'm:1+t:23',  // 科创板
    ]
    for (const fs of segments) {
      await fetchByFs(fs)
      // 达到你期望的规模就提前停止，减少无意义请求
      if (list.length >= 5000) break
    }
  } catch {
    // 接口异常时返回已拉取的列表
  }

  // 远端拉取失败但本地缓存可用：直接回退缓存，保证页面可继续筛选。
  if (list.length === 0) {
    const cached = readCache()
    if (cached && cached.length > 0) return cached
  }

  // 只有在成功拉到一些结果时才写缓存，避免缓存空数据。
  if (list.length > 0) writeCache(list)

  return list
}

interface RawKLine {
  f51: string
  f52: number
  f53: number
  f54: number
  f55: number
  f56: number
  f57?: number
}

/** 获取实时最新价（东方财富快照），失败返回 null */
export async function fetchRealtimePrice(secid: string): Promise<number | null> {
  try {
    const url = `${BASE.list}/api/qt/stock/get?secid=${encodeURIComponent(secid)}&fields=f43`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: REFERER } })
    if (!res.ok) return null
    const data = await res.json()
    const raw = Number(data?.data?.f43)
    if (!Number.isFinite(raw) || raw <= 0) return null
    // 东财快照 f43 通常放大 100 倍，统一还原为价格
    const price = raw / 100
    if (!Number.isFinite(price) || price <= 0) return null
    return price
  } catch {
    return null
  }
}

/** 获取K线：klt 101=日 102=周 */
export async function fetchKLine(secid: string, klt: 101 | 102 = 101): Promise<RawKLine[]> {
  const url = BASE.kline + '/api/qt/stock/kline/get?' + new URLSearchParams({
    secid,
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56,f57',
    klt: String(klt),
    fqt: '1',
    beg: '0',
    end: '20500000',
  })
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: REFERER } })
  const data = await res.json()
  const rawKlines = data?.data?.klines
  const arr = Array.isArray(rawKlines) ? rawKlines : (rawKlines && typeof rawKlines === 'object' ? Object.values(rawKlines) : [])
  const out: RawKLine[] = []
  for (const item of arr) {
    if (typeof item === 'string') {
      const p = item.split(',')
      if (p.length >= 6) {
        out.push({
          f51: p[0],
          f52: Number(p[1]),
          f53: Number(p[2]),
          f54: Number(p[3]),
          f55: Number(p[4]),
          f56: Number(p[5]),
          f57: Number(p[6]) || 0,
        })
      }
    } else if (item && typeof item === 'object' && 'f51' in (item as object)) {
      const o = item as Record<string, unknown>
      out.push({
        f51: String(o.f51 ?? ''),
        f52: Number(o.f52) || 0,
        f53: Number(o.f53) || 0,
        f54: Number(o.f54) || 0,
        f55: Number(o.f55) || 0,
        f56: Number(o.f56) || 0,
        f57: Number(o.f57) || 0,
      })
    }
  }
  return out
}

/** 获取个股所属行业/板块（f127=行业） */
export async function fetchStockSector(secid: string): Promise<string | null> {
  try {
    const url = `${BASE.list}/api/qt/stock/get?secid=${encodeURIComponent(secid)}&fields=f127,f128`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: REFERER } })
    const data = await res.json()
    const d = data?.data
    if (!d) return null
    const industry = d.f127 != null ? String(d.f127).trim() : null
    const sector = d.f128 != null ? String(d.f128).trim() : null
    if (industry) return industry
    if (sector) return sector
    return null
  } catch {
    return null
  }
}

/** 散户数量变化（数据来源：东方财富股东户数变化，与同花顺问财「散户数量」对应，负=散户减少） */
export async function fetchHolderChange(code: string): Promise<{ change: number; ratio: number } | null> {
  try {
    const url = `${BASE.dc}/api/data/v1/get?sortColumns=REPORT_DATE&sortTypes=-1&pageSize=2&pageNumber=1&reportName=RPT_DIM_HOLDER_NUM&columns=SECURITY_CODE,HOLDER_NUM,PRE_HOLDER_NUM,HOLDER_CHANGE,HOLDER_CHANGE_RATIO&filter=(SECURITY_CODE="${code}")`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://data.eastmoney.com/' } })
    const data = await res.json()
    const list = data?.data?.records ?? []
    if (list.length === 0) return null
    const r = list[0]
    const change = Number(r.HOLDER_CHANGE) || 0
    const ratio = Number(r.HOLDER_CHANGE_RATIO) || 0
    return { change, ratio }
  } catch {
    return null
  }
}

export { secidFromCode }
