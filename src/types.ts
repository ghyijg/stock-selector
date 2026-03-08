/** 单根K线 */
export interface KLineItem {
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
  amount?: number
}

/** 股票基础信息 */
export interface StockInfo {
  code: string
  name: string
  market: string
  secid: string
}

/** 带日线/周线与散户数量数据的股票 */
export interface StockWithData extends StockInfo {
  daily: KLineItem[]
  weekly: KLineItem[]
  /** 散户数量变化（负=散户减少，数据来源：东方财富股东户数变化，与同花顺问财「散户数量」对应） */
  holderChange: number | null
  holderChangeRatio: number | null
  /** 当前价（最新收盘） */
  price: number
  ma5: number | null
  ma10: number | null
}

/** 策略类型 */
export type StrategyId = 1 | 2 | 3 | 4

/** 单只股票的策略匹配结果 */
export interface StrategyMatch {
  stock: StockWithData
  strategyId: StrategyId
  /** 策略描述/匹配原因摘要 */
  reason: string
  /** 关键数值（用于展示） */
  metrics: Record<string, number | string>
}
