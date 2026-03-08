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

const LIST_PAGE_SIZE = 5000

/** 获取A股列表（沪深），分页拉取直至取完全部 */
export async function fetchStockList(): Promise<Array<{ code: string; name: string; secid: string }>> {
  const list: Array<{ code: string; name: string; secid: string }> = []
  try {
    let pn = 1
    let hasMore = true
    while (hasMore) {
      const url = BASE.list + '/api/qt/clist/get?' + new URLSearchParams({
        fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
        fields: 'f12,f14,f13',
        pn: String(pn),
        pz: String(LIST_PAGE_SIZE),
      })
      const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: REFERER } })
      const data = await res.json()
      const raw = data?.data?.diff
      const items = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : [])
      for (const it of items) {
        const code = String((it as { f12?: string }).f12 ?? '')
        if (!code) continue
        list.push({
          code,
          name: String((it as { f14?: string; f12?: string }).f14 ?? (it as { f12?: string }).f12 ?? ''),
          secid: `${(it as { f13?: number }).f13 ?? 0}.${code}`,
        })
      }
      hasMore = items.length >= LIST_PAGE_SIZE
      pn += 1
    }
  } catch {
    // 接口异常时返回已拉取的列表
  }
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
