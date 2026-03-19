import type { StockWithData, StrategyMatch } from './types'

/** 策略1：周K缩量下跌 + 股价在十日线以上 + 散户数量为负或暂无数据 */
export function matchStrategy1(stock: StockWithData): StrategyMatch | null {
  const weekly = stock.weekly
  if (weekly.length < 2) return null
  const sorted = [...weekly].sort((a, b) => a.date.localeCompare(b.date))
  const cur = sorted[sorted.length - 1]
  const prev = sorted[sorted.length - 2]
  const isDown = cur.close < cur.open
  const volRatio = prev.volume > 0 ? cur.volume / prev.volume : 0
  const isShrink = volRatio < 1
  const aboveMa10 = stock.ma10 != null && stock.price >= stock.ma10
  const holderOk = stock.holderChange == null || stock.holderChange < 0
  if (!isDown || !isShrink || !aboveMa10 || !holderOk) return null
  const holderNote = stock.holderChange != null && stock.holderChange < 0 ? '散户数量减少' : '散户数量数据暂无'
  return {
    stock,
    strategyId: 1,
    reason: `周K缩量下跌(量比${(volRatio * 100).toFixed(0)}%)，股价在10日线上方，${holderNote}`,
    metrics: {
      '周量比': `${(volRatio * 100).toFixed(1)}%`,
      '股价/10日线': stock.ma10 != null ? (stock.price / stock.ma10).toFixed(3) : '-',
      '散户数量变化': stock.holderChange ?? '-',
    },
  }
}

/** 策略2：周K量能90%-120%，且两根周K都是上涨（红柱） */
export function matchStrategy2(stock: StockWithData): StrategyMatch | null {
  const weekly = stock.weekly
  if (weekly.length < 2) return null
  const sorted = [...weekly].sort((a, b) => a.date.localeCompare(b.date))
  const cur = sorted[sorted.length - 1]
  const prev = sorted[sorted.length - 2]
  const volRatio = prev.volume > 0 ? cur.volume / prev.volume : 0
  const volInRange = volRatio >= 0.9 && volRatio <= 1.2
  const curUp = cur.close > cur.open
  const prevUp = prev.close > prev.open
  if (!volInRange || !curUp || !prevUp) return null
  return {
    stock,
    strategyId: 2,
    reason: `周K量能${(volRatio * 100).toFixed(0)}%（90%~120%），近两周均收涨`,
    metrics: {
      '周量比': `${(volRatio * 100).toFixed(1)}%`,
      '本周': curUp ? '涨' : '跌',
      '上周': prevUp ? '涨' : '跌',
    },
  }
}

/** 策略3：5/10日线上方，缩量下跌（缩量45%以上），散户数量减小 */
export function matchStrategy3(stock: StockWithData): StrategyMatch | null {
  const daily = stock.daily
  if (daily.length < 2) return null
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  const cur = sorted[sorted.length - 1]
  const prev = sorted[sorted.length - 2]
  const aboveMa5 = stock.ma5 != null && stock.price >= stock.ma5
  const aboveMa10 = stock.ma10 != null && stock.price >= stock.ma10
  const holderOk = stock.holderChange == null || stock.holderChange < 0
  if (!aboveMa5 || !aboveMa10 || !holderOk) return null
  const curDown = cur.close < cur.open
  const shrink45 = prev.volume > 0 && cur.volume <= prev.volume * 0.55
  if (!curDown || !shrink45) return null
  const volRatio = prev.volume > 0 ? (cur.volume / prev.volume) * 100 : 0
  const holderNote = stock.holderChange != null && stock.holderChange < 0 ? '散户数量减少' : '散户数量数据暂无'
  return {
    stock,
    strategyId: 3,
    reason: `5/10日线上方，缩量下跌(量比${volRatio.toFixed(0)}%，缩量45%以上)，${holderNote}`,
    metrics: {
      '日量比': `${volRatio.toFixed(1)}%`,
      '股价/5日线': stock.ma5 != null ? (stock.price / stock.ma5).toFixed(3) : '-',
      '股价/10日线': stock.ma10 != null ? (stock.price / stock.ma10).toFixed(3) : '-',
      '散户数量变化': stock.holderChange ?? '-',
    },
  }
}

/** 策略4：放量上涨涨幅2%-5%，近两日红柱，量比85%-120%，散户数量±50以内 */
export function matchStrategy4(stock: StockWithData): StrategyMatch | null {
  const daily = stock.daily
  if (daily.length < 2) return null
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
  const cur = sorted[sorted.length - 1]
  const prev = sorted[sorted.length - 2]
  if (prev.volume <= 0 || prev.close <= 0) return null
  const curRed = cur.close > cur.open
  const prevRed = prev.close > prev.open
  if (!curRed || !prevRed) return null
  const volRatio = cur.volume / prev.volume
  const volInRange = volRatio >= 0.85 && volRatio <= 1.2
  const changePct = (cur.close - prev.close) / prev.close
  const gainInRange = changePct >= 0.02 && changePct <= 0.05
  const holderInRange = stock.holderChange == null || (stock.holderChange >= -50 && stock.holderChange <= 50)
  if (!volInRange || !gainInRange || !holderInRange) return null
  return {
    stock,
    strategyId: 4,
    reason: `近两日红柱、量比${(volRatio * 100).toFixed(0)}%(85%~120%)，涨幅${(changePct * 100).toFixed(2)}%，散户数量±50内`,
    metrics: {
      '日量比': `${(volRatio * 100).toFixed(1)}%`,
      '涨幅': `${(changePct * 100).toFixed(2)}%`,
      '散户数量变化': stock.holderChange ?? '-',
    },
  }
}

/** 策略5：周K量比85%-110%，且两周均收涨；最近一周周涨幅0%-2% */
export function matchStrategy5(stock: StockWithData): StrategyMatch | null {
  const weekly = stock.weekly
  if (weekly.length < 2) return null

  const sorted = [...weekly].sort((a, b) => a.date.localeCompare(b.date))
  const cur = sorted[sorted.length - 1]
  const prev = sorted[sorted.length - 2]

  if (prev.volume <= 0 || cur.volume <= 0) return null
  const volRatio = cur.volume / prev.volume
  const volInRange = volRatio >= 0.85 && volRatio <= 1.1

  const curUp = cur.close > cur.open
  const prevUp = prev.close > prev.open

  if (!prev.close || prev.close <= 0) return null
  const changePct = (cur.close - prev.close) / prev.close
  const gainInRange = changePct >= 0 && changePct <= 0.02

  if (!volInRange || !curUp || !prevUp || !gainInRange) return null

  return {
    stock,
    strategyId: 5,
    reason: `周量比${(volRatio * 100).toFixed(0)}%（85%~110%），两周收涨，近一周周涨幅${(changePct * 100).toFixed(2)}%（0%~2%）`,
    metrics: {
      '周量比': `${(volRatio * 100).toFixed(1)}%`,
      '本周': curUp ? '涨' : '跌',
      '上周': prevUp ? '涨' : '跌',
      '周涨幅': `${(changePct * 100).toFixed(2)}%`,
    },
  }
}

export function runAllStrategies(stock: StockWithData): StrategyMatch[] {
  const out: StrategyMatch[] = []
  const r1 = matchStrategy1(stock)
  if (r1) out.push(r1)
  const r2 = matchStrategy2(stock)
  if (r2) out.push(r2)
  const r3 = matchStrategy3(stock)
  if (r3) out.push(r3)
  const r4 = matchStrategy4(stock)
  if (r4) out.push(r4)
  const r5 = matchStrategy5(stock)
  if (r5) out.push(r5)
  return out
}
