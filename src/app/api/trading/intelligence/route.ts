import { NextRequest, NextResponse } from 'next/server';
import {
  ensureTradingTables,
  getQueueCoinScores,
  getRecentStrategyAdjustments,
  getStrategyStates,
  getTradingAccount,
} from '@/lib/db/trading';

export const dynamic = 'force-dynamic';

const normalizePctValue = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return value > 1 ? value / 100 : value;
};

const formatPct = (value: number) => `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;

const toNumber = (value: any, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export async function GET(request: NextRequest) {
  try {
    const userIdParam = request.nextUrl.searchParams.get('userId');
    const userId = Number(userIdParam || 1);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    await ensureTradingTables();

    const [account, strategies, scores, adjustments] = await Promise.all([
      getTradingAccount(userId, 'kraken'),
      getStrategyStates(userId),
      getQueueCoinScores(userId, 5),
      getRecentStrategyAdjustments(userId, 3),
    ]);

    const accountState = account ?? {
      base_balance: 100,
      current_balance: 100,
      active_cycles: 0,
      avg_cycle_days: 2.5,
      realized_pnl: 0,
      unrealized_pnl: 0,
      circuit_breaker: false,
      circuit_breaker_until: null,
    };

    const circuitBreakerActive = Boolean(accountState.circuit_breaker) ||
      (accountState.circuit_breaker_until
        ? new Date(accountState.circuit_breaker_until).getTime() > Date.now()
        : false);

    const watchlist = scores.map((row) => ({
      symbol: String(row.symbol ?? ''),
      score: toNumber(row.score),
      rsi: toNumber(row.rsi),
      price: toNumber(row.price),
      change24h: toNumber(row.change24h),
    }));

    const enabledStrategies = strategies.filter((s) => s.enabled !== false);
    const longWeight = enabledStrategies
      .filter((s) => (s.direction || '').toLowerCase() === 'long')
      .reduce((sum, s) => sum + toNumber(s.weight, 1), 0);
    const shortWeight = enabledStrategies
      .filter((s) => (s.direction || '').toLowerCase() === 'short')
      .reduce((sum, s) => sum + toNumber(s.weight, 1), 0);
    const totalWeight = longWeight + shortWeight;
    const longPct = totalWeight > 0 ? Math.round((longWeight / totalWeight) * 100) : 0;
    const shortPct = totalWeight > 0 ? Math.max(0, 100 - longPct) : 0;

    let label = 'No active strategies';
    if (longPct === 100) label = '100% LONG';
    else if (shortPct === 100) label = '100% SHORT';
    else if (totalWeight > 0) label = `${longPct}% LONG / ${shortPct}% SHORT`;

    const primaryStrategy =
      strategies.find((s) => (s.strategy_id || '').toLowerCase() === 'momentum-long') ||
      strategies.find((s) => s.enabled !== false) ||
      null;

    const riskParamsRaw = (primaryStrategy?.risk_params || {}) as Record<string, any>;
    const sl = normalizePctValue(toNumber(riskParamsRaw.sl ?? riskParamsRaw.stopLossPct ?? riskParamsRaw.stop_loss ?? 0));
    const tp = normalizePctValue(toNumber(riskParamsRaw.tp ?? riskParamsRaw.takeProfitPct ?? riskParamsRaw.take_profit ?? 0));
    const trail = normalizePctValue(toNumber(riskParamsRaw.trail ?? riskParamsRaw.trailPct ?? riskParamsRaw.trailing ?? 0));

    const riskParams = {
      sl: formatPct(sl),
      tp: formatPct(tp),
      trail: formatPct(trail),
    };

    const autoCompounder = {
      enabled: Boolean(account),
      compoundingBase: toNumber(accountState.base_balance, 100),
      currentBalance: toNumber(accountState.current_balance, 100),
      activeCycles: toNumber(accountState.active_cycles, 0),
      avgCycleDays: toNumber(accountState.avg_cycle_days, 2.5),
      dailyPnl: 0,
      circuitBreaker: circuitBreakerActive,
    };

    const recentAdjustments = adjustments.map((row) => {
      const tsValue = row.created_at || row.timestamp || new Date();
      const ts = new Date(tsValue as any);
      return {
        timestamp: ts.toISOString(),
        agent: row.agent || 'system',
        type: row.type || 'adjustment',
        strategy: row.strategy || 'Strategy',
        summary: row.summary || (row.reason ? row.reason.split('.')[0] : 'Strategy adjustment'),
      };
    });

    return NextResponse.json({
      watchlist,
      riskParams,
      directionBias: { long: longPct, short: shortPct, label },
      autoCompounder,
      recentAdjustments,
    });
  } catch (error) {
    console.error('GET /api/trading/intelligence error:', error);
    return NextResponse.json({ error: 'Failed to load trading intelligence' }, { status: 500 });
  }
}
