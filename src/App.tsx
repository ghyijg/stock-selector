import { useState, useCallback, useEffect, useMemo } from 'react'
import { getStockList, fetchStockData, getStockSector } from './api'
import { runAllStrategies, matchStrategy4 } from './strategies'
import type { StrategyMatch, StrategyId } from './types'
import { computeReturn } from './utils/return'
import './App.css'

const STRATEGY_NAMES: Record<StrategyId, string> = {
  1: '策略一：周K缩量下跌 + 十日线上方 + 散户数量减少',
  2: '策略二：周K量能90%-120%，近两根周K均收涨',
  3: '策略三：5/10日线上方，缩量下跌(缩量45%以上)，散户数量减小',
  4: '策略四：放量上涨涨幅2%-5%，近两日红柱，量比85%-120%，散户数量±50以内',
}

/** 已退市股票代码（如招商地产 000024），从结果中排除 */
const DELISTED_CODES = new Set([
  '000024', // 招商地产（已并入招商蛇口）
  '600087', // 退市长油
  '601268', // 二重
])

/** 动态背景光点：位置(%)、动画延迟(s)、时长(s)、样式 0=青 1=紫 2=氰 */
const BG_PARTICLES = [
  { left: 10, top: 20, delay: 0, duration: 14, mod: 0 },
  { left: 88, top: 15, delay: 2, duration: 20, mod: 1 },
  { left: 25, top: 60, delay: 4, duration: 16, mod: 2 },
  { left: 70, top: 55, delay: 1, duration: 22, mod: 0 },
  { left: 50, top: 35, delay: 3, duration: 18, mod: 1 },
  { left: 15, top: 80, delay: 5, duration: 15, mod: 2 },
  { left: 92, top: 70, delay: 2.5, duration: 19, mod: 0 },
  { left: 35, top: 40, delay: 1.5, duration: 21, mod: 1 },
  { left: 65, top: 85, delay: 4.5, duration: 17, mod: 2 },
  { left: 5, top: 45, delay: 3.5, duration: 23, mod: 0 },
  { left: 95, top: 30, delay: 0.5, duration: 13, mod: 1 },
  { left: 45, top: 75, delay: 6, duration: 25, mod: 2 },
]

export default function App() {
  const [loading, setLoading] = useState(false)
  const [scanAll, setScanAll] = useState(true)
  const [poolSize, setPoolSize] = useState(500)
  const [results, setResults] = useState<StrategyMatch[]>([])
  const [filterStrategy, setFilterStrategy] = useState<StrategyId | 'all'>('all')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [diagnosticLoading, setDiagnosticLoading] = useState(false)
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null)
  const [sectorMap, setSectorMap] = useState<Record<string, string>>({})
  const [returnStartDate, setReturnStartDate] = useState('')
  const [returnEndDate, setReturnEndDate] = useState('')

  const filtered = filterStrategy === 'all'
    ? results
    : results.filter((r) => r.strategyId === filterStrategy)

  /** 排除已退市 + 查不到板块的股票后的展示列表 */
  const displayFiltered = useMemo(() => {
    return filtered.filter((m) => {
      if (DELISTED_CODES.has(m.stock.code)) return false
      const sector = sectorMap[m.stock.code]
      return !!sector && sector.trim() !== ''
    })
  }, [filtered, sectorMap])

  const uniqueStocks = useMemo(() => {
    const m = new Map<string, (typeof results)[0]['stock']>()
    filtered.forEach((r) => {
      if (!m.has(r.stock.code)) m.set(r.stock.code, r.stock)
    })
    return Array.from(m.values())
  }, [filtered])

  /** 仅含“有板块且未退市”的股票，用于重点板块与收益率 */
  const displayUniqueStocks = useMemo(() => {
    const m = new Map<string, (typeof results)[0]['stock']>()
    displayFiltered.forEach((r) => {
      if (!m.has(r.stock.code)) m.set(r.stock.code, r.stock)
    })
    return Array.from(m.values())
  }, [displayFiltered])

  const uniqueCodeKey = useMemo(
    () => [...new Set(filtered.map((r) => r.stock.code))].sort().join(','),
    [filtered]
  )

  useEffect(() => {
    if (uniqueStocks.length === 0) {
      setSectorMap({})
      return
    }
    let cancelled = false
    const next: Record<string, string> = {}
    const run = async () => {
      for (const s of uniqueStocks) {
        if (cancelled) return
        const sector = await getStockSector(s.secid)
        if (sector) next[s.code] = sector
      }
      if (!cancelled) setSectorMap((prev) => ({ ...prev, ...next }))
    }
    run()
    return () => { cancelled = true }
  }, [uniqueCodeKey])

  useEffect(() => {
    if (displayUniqueStocks.length === 0 || (returnStartDate && returnEndDate)) return
    const s = displayUniqueStocks[0]
    const d = [...(s.daily || [])].sort((a, b) => a.date.localeCompare(b.date))
    if (d.length < 2) return
    if (!returnEndDate) setReturnEndDate(d[d.length - 1].date)
    if (!returnStartDate) setReturnStartDate(d[Math.max(0, d.length - 21)].date)
  }, [uniqueCodeKey, displayUniqueStocks])

  const keySectors = useMemo(() => {
    const count: Record<string, number> = {}
    displayUniqueStocks.forEach((s) => {
      const name = sectorMap[s.code] || ''
      if (name) count[name] = (count[name] || 0) + 1
    })
    return Object.entries(count)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, n]) => ({ name, count: n }))
  }, [displayUniqueStocks, sectorMap])

  const returnChartData = useMemo(() => {
    const start = returnStartDate || (displayUniqueStocks[0]?.daily?.length ? (() => {
      const d = [...displayUniqueStocks[0].daily].sort((a, b) => a.date.localeCompare(b.date))
      return d[Math.max(0, d.length - 21)]?.date ?? d[0]?.date
    })() : '')
    const end = returnEndDate || (displayUniqueStocks[0]?.daily?.length ? (() => {
      const d = [...displayUniqueStocks[0].daily].sort((a, b) => a.date.localeCompare(b.date))
      return d[d.length - 1]?.date ?? ''
    })() : '')
    if (!start || !end) return []
    return displayUniqueStocks
      .map((s) => {
        const ret = computeReturn(s.daily, start, end)
        return { name: `${s.code} ${s.name}`, code: s.code, return: ret == null ? null : ret * 100 }
      })
      .filter((r) => r.return != null) as { name: string; code: string; return: number }[]
  }, [displayUniqueStocks, returnStartDate, returnEndDate])

  const runDiagnostic = useCallback(async () => {
    setDiagnosticLoading(true)
    setDiagnosticResult(null)
    const lines: string[] = []
    try {
      lines.push('【1】拉取 A 股列表…')
      const list = await getStockList()
      lines.push(`  列表数量: ${list.length} 只`)
      if (list.length === 0) {
        lines.push('  ❌ 未获取到列表，请用 npm run dev 启动以使用代理')
        setDiagnosticResult(lines.join('\n'))
        return
      }
      lines.push('【2】拉取单只股票 000001 平安银行（日线优先新浪，不足再试东方财富）…')
      const data = await fetchStockData('000001', '平安银行', '0.000001')
      if (!data) {
        lines.push('  ❌ 日K拉取失败（新浪与东方财富均不足 10 根）')
        setDiagnosticResult(lines.join('\n'))
        return
      }
      const daily = data.daily
      const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
      const cur = sorted[sorted.length - 1]
      const prev = sorted[sorted.length - 2]
      const volRatio = prev.volume > 0 ? cur.volume / prev.volume : 0
      const changePct = prev.close > 0 ? (cur.close - prev.close) / prev.close : 0
      lines.push(`  日K 根数: ${daily.length}`)
      lines.push(`  最新一根: 日期=${cur.date} 开=${cur.open} 收=${cur.close} 量=${cur.volume}`)
      lines.push(`  前一根本: 日期=${prev.date} 收=${prev.close} 量=${prev.volume}`)
      lines.push(`  量比: ${(volRatio * 100).toFixed(1)}%  涨幅(相对昨收): ${(changePct * 100).toFixed(2)}%`)
      const s4 = matchStrategy4(data)
      lines.push(`  策略四是否命中: ${s4 ? '是 ✓' : '否'}`)
      if (s4) lines.push(`  → ${s4.reason}`)
      lines.push('')
      lines.push('若列表/日K正常仍无筛选结果，请全A股扫描后看策略四是否有命中。')
      setDiagnosticResult(lines.join('\n'))
    } catch (e) {
      lines.push('')
      lines.push('错误: ' + (e instanceof Error ? e.message : String(e)))
      setDiagnosticResult(lines.join('\n'))
    } finally {
      setDiagnosticLoading(false)
    }
  }, [])

  const runScan = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResults([])
    setProgress({ current: 0, total: 0 })
    try {
      const list = await getStockList()
      if (!list || list.length === 0) {
        setError('未获取到股票列表，请用 npm run dev 启动本地代理后重试，或点击「数据诊断」查看接口是否正常')
        return
      }
      const total = scanAll ? list.length : Math.min(poolSize, list.length)
      const slice = list.slice(0, total)
      setProgress({ current: 0, total: slice.length })
      const matches: StrategyMatch[] = []
      for (let i = 0; i < slice.length; i++) {
        const item = slice[i]
        const data = await fetchStockData(item.code, item.name, item.secid)
        if (data) {
          const m = runAllStrategies(data)
          matches.push(...m)
        }
        if ((i + 1) % 20 === 0) {
          setResults([...matches])
          setProgress({ current: i + 1, total: slice.length })
        }
      }
      setResults(matches)
      setProgress({ current: slice.length, total: slice.length })
      if (matches.length === 0 && slice.length > 0) {
        setError('扫描完成但本次无命中。建议：① 点击「数据诊断」确认列表与日K是否正常 ② 策略条件较严，可多试几次全A股扫描')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败，请检查网络或使用 dev 代理')
    } finally {
      setLoading(false)
    }
  }, [scanAll, poolSize])

  return (
    <>
      <div className="bg-dynamic" aria-hidden>
        <div className="scan-line" />
        {BG_PARTICLES.map((p, i) => (
          <span
            key={i}
            className={`bg-particle ${p.mod === 1 ? 'bg-particle--purple' : p.mod === 2 ? 'bg-particle--cyan' : ''}`}
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}
      </div>
      <div className="app">
      <header className="header">
        <h1 className="site-title">通宇全A大数据自动化选股网站</h1>
        <p className="sub">全市场扫描 · 多策略筛选 · 重点板块与收益率统计 · 数据来源东方财富/新浪</p>
      </header>

      <section className="controls card">
        <div className="controls-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={scanAll}
              onChange={(e) => setScanAll(e.target.checked)}
            />
            全A股扫描
          </label>
          {!scanAll && (
            <label>
              扫描数量（只）
              <input
                type="number"
                min={100}
                max={10000}
                value={poolSize}
                onChange={(e) => setPoolSize(Number(e.target.value) || 500)}
              />
            </label>
          )}
          <button className="btn-run" onClick={runScan} disabled={loading}>
            {loading ? `扫描中 ${progress.current}/${progress.total}…` : '开始筛选'}
          </button>
        </div>
      </section>

      {error && <div className="error">{error}</div>}

      <section className="diagnostic card">
        <button type="button" className="btn-diagnostic" onClick={runDiagnostic} disabled={diagnosticLoading}>
          {diagnosticLoading ? '诊断中…' : '数据诊断（测一只股票）'}
        </button>
        {diagnosticResult && (
          <pre className="diagnostic-result">{diagnosticResult}</pre>
        )}
      </section>

      <section className="filter-tabs card">
        <span className="filter-label">策略筛选：</span>
        <button
          className={filterStrategy === 'all' ? 'active' : ''}
          onClick={() => setFilterStrategy('all')}
        >
          全部
        </button>
        {( [1, 2, 3, 4] as StrategyId[] ).map((id) => (
          <button
            key={id}
            className={filterStrategy === id ? 'active' : ''}
            onClick={() => setFilterStrategy(id)}
          >
            策略{id}
          </button>
        ))}
      </section>

      {displayFiltered.length > 0 && keySectors.length > 0 && (
        <section className="key-sectors card">
          <h3 className="section-title">重点板块（按命中股数）</h3>
          <div className="sector-tags">
            {keySectors.map((s) => (
              <span key={s.name} className="sector-tag sector-tag--key">
                {s.name} <em>{s.count}</em>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="results card">
        <div className="strategy-desc">
          <span className="result-summary">共 {displayFiltered.length} 条命中（已排除退市及无板块）</span>
          <span className="result-desc">
            {filterStrategy === 'all'
              ? '· 当前显示所有策略'
              : `· ${STRATEGY_NAMES[filterStrategy as StrategyId]}`}
          </span>
          <span className="data-source">（散户数量=东方财富股东户数，与问财一致）</span>
        </div>
        {displayFiltered.length === 0 && !loading && (
          <p className="empty">暂无命中，请点击「开始筛选」或增大扫描池</p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>策略</th>
                <th>代码</th>
                <th>名称</th>
                <th>板块</th>
                <th>现价</th>
                <th>5日线</th>
                <th>10日线</th>
                <th>散户数量变化</th>
                <th>匹配说明</th>
                <th>链接</th>
              </tr>
            </thead>
            <tbody>
              {displayFiltered.map((m, i) => (
                <tr key={`${m.stock.code}-${m.strategyId}-${i}`}>
                  <td>策略{m.strategyId}</td>
                  <td>{m.stock.code}</td>
                  <td>{m.stock.name}</td>
                  <td>{sectorMap[m.stock.code] ?? '-'}</td>
                  <td>{m.stock.price.toFixed(2)}</td>
                  <td>{m.stock.ma5 != null ? m.stock.ma5.toFixed(2) : '-'}</td>
                  <td>{m.stock.ma10 != null ? m.stock.ma10.toFixed(2) : '-'}</td>
                  <td>
                    {m.stock.holderChange != null
                      ? `${m.stock.holderChange > 0 ? '+' : ''}${m.stock.holderChange}`
                      : '-'}
                  </td>
                  <td className="reason">{m.reason}</td>
                  <td>
                    <a
                      href={`https://quote.eastmoney.com/${m.stock.market === 'sh' ? 'sh' : 'sz'}${m.stock.code}.html`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      行情
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {displayFiltered.length > 0 && (
        <section className="return-section card">
          <h3 className="section-title">选出该股之后收益率统计</h3>
          <div className="return-controls">
            <label>
              开始日期
              <input
                type="date"
                value={returnStartDate}
                onChange={(e) => setReturnStartDate(e.target.value)}
              />
            </label>
            <label>
              结束日期
              <input
                type="date"
                value={returnEndDate}
                onChange={(e) => setReturnEndDate(e.target.value)}
              />
            </label>
          </div>
          {returnChartData.length > 0 ? (
            <div className="return-chart-wrap">
              <div className="return-bars">
                {returnChartData.map((entry) => {
                  const maxAbs = Math.max(...returnChartData.map((e) => Math.abs(e.return)), 1)
                  const barPct = (Math.abs(entry.return) / maxAbs) * 50
                  const isPos = entry.return >= 0
                  return (
                    <div key={entry.code} className="return-bar-row" title={`${entry.name}: ${entry.return.toFixed(2)}%`}>
                      <span className="return-bar-label">{entry.name}</span>
                      <div className="return-bar-track">
                        <div className="return-bar-zero" />
                        <div
                          className={`return-bar-fill ${isPos ? 'positive' : 'negative'}`}
                          style={{
                            width: `${barPct}%`,
                            marginLeft: isPos ? '50%' : `${50 - barPct}%`,
                          }}
                        />
                      </div>
                      <span className={`return-bar-value ${isPos ? 'positive' : 'negative'}`}>
                        {isPos ? '+' : ''}{entry.return.toFixed(2)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="empty">请选择时间区间，或确保选中的股票在该区间内有日K数据</p>
          )}
        </section>
      )}
      </div>
    </>
  )
}
