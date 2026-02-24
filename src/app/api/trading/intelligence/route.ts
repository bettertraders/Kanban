import { NextRequest, NextResponse } from 'next/server';
import {
  ensureTradingTables,
  getLatestScannerSnapshot,
  getQueueCoinScores,
  getRecentStrategyAdjustments,
  getStrategyStates,
  getTradingAccount,
  replaceQueueCoinScores,
  upsertTradingAccount,
} from '@/lib/db/trading';
import { fetchKrakenBalances } from '@/lib/kraken-sync';
import { getHarvestState, getTradesForBoard } from '@/lib/database';
import { getCurrentPrice } from '@/lib/price-service';

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeSymbol = (value: any) => String(value ?? '').trim();

const deriveRsiFromChange = (change24h: number) => {
  const pct = Number.isFinite(change24h) ? change24h : 0;
  return clamp(50 + pct * 2, 0, 100);
};

const scoreFromRsi = (rsiValue: number) => clamp(100 - rsiValue, 0, 100);

async function estimateUsdBalance(balances: Record<string, number>) {
  const usdSymbols = new Set(['USD', 'USDT', 'USDC']);
  let totalUsd = 0;

  for (const [asset, amountRaw] of Object.entries(balances)) {
    const amount = toNumber(amountRaw, 0);
    if (amount <= 0) continue;
    const symbol = asset.toUpperCase();
    if (usdSymbols.has(symbol)) {
      totalUsd += amount;
      continue;
    }

    try {
      const snapshot = await getCurrentPrice(`${symbol}/USD`);
      if (Number.isFinite(snapshot.price) && snapshot.price > 0) {
        totalUsd += amount * snapshot.price;
        continue;
      }
    } catch {
      // Ignore and try USDT fallback.
    }

    try {
      const snapshot = await getCurrentPrice(`${symbol}/USDT`);
      if (Number.isFinite(snapshot.price) && snapshot.price > 0) {
        totalUsd += amount * snapshot.price;
      }
    } catch {
      // Ignore unknown assets.
    }
  }

  return totalUsd;
}

async function buildWatchlistFromActiveTrades(userId: number) {
  const trades = await getTradesForBoard(15);
  let activeTrades = trades.filter(
    (trade: any) => String(trade?.column_name || '').toLowerCase() === 'active' || String(trade?.status || '').toLowerCase() === 'active'
  );
  
  // If no active trades, use queued trades for the watchlist
  if (activeTrades.length === 0) {
    activeTrades = trades.filter(
      (trade: any) => String(trade?.column_name || '').toLowerCase() === 'queued'
    );
  }

  const rsiBySymbol = new Map<string, number>();
  for (const trade of activeTrades) {
    const symbol = normalizeSymbol(trade?.coin_pair || trade?.symbol || trade?.pair);
    if (!symbol || rsiBySymbol.has(symbol)) continue;
    const rsiValue = toNumber(trade?.rsi_value, NaN);
    if (Number.isFinite(rsiValue) && rsiValue > 0) {
      rsiBySymbol.set(symbol, rsiValue);
    }
  }

  const symbols = Array.from(new Set(
    activeTrades
      .map((trade: any) => normalizeSymbol(trade?.coin_pair || trade?.symbol || trade?.pair))
      .filter(Boolean)
  )).slice(0, 10);

  const rows = await Promise.all(symbols.map(async (symbol) => {
    try {
      const snapshot = await getCurrentPrice(symbol);
      const rsiValue = rsiBySymbol.get(symbol) ?? deriveRsiFromChange(snapshot.change24h);
      const score = scoreFromRsi(rsiValue);
      return {
        symbol,
        score,
        rsi: rsiValue,
        price: snapshot.price,
        change24h: snapshot.change24h,
        rank: 0,
      };
    } catch (error) {
      console.warn(`[trading/intelligence] price fetch failed for ${symbol}:`, error);
      return null;
    }
  }));

  const scored = rows.filter(Boolean) as Array<{
    symbol: string;
    score: number;
    rsi: number;
    price: number;
    change24h: number;
    rank: number;
  }>;

  scored.sort((a, b) => b.score - a.score);
  scored.forEach((row, index) => {
    row.rank = index + 1;
  });

  if (scored.length > 0) {
    await replaceQueueCoinScores(userId, scored);
  }

  return scored;
}

export async function GET(request: NextRequest) {
  try {
    const userIdParam = request.nextUrl.searchParams.get('userId');
    const userId = Number(userIdParam || 1);
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    await ensureTradingTables();

    const [initialAccount, strategies, initialScores, adjustments] = await Promise.all([
      getTradingAccount(userId, 'kraken'),
      getStrategyStates(userId),
      getQueueCoinScores(userId, 5),
      getRecentStrategyAdjustments(userId, 3),
    ]);

    let account = initialAccount;
    let scores: any[] = initialScores;

    // Try to get fresh scanner data first
    try {
      const scannerSnapshot = await getLatestScannerSnapshot(userId, 2); // Max 2 hours old
      if (scannerSnapshot?.watchlist?.length > 0) {
        scores = scannerSnapshot.watchlist.slice(0, 5).map((coin: any, index: number) => ({
          symbol: coin.symbol?.replace('/USDT', '') || coin.symbol,
          score: toNumber(coin.score),
          rsi: toNumber(coin.rsi),
          price: toNumber(coin.price),
          change24h: toNumber(coin.change24h || coin.momentum),
          rank: index + 1,
        }));
      }
    } catch (error) {
      console.warn('[trading/intelligence] Failed to load scanner snapshot:', error);
    }

    if (!account) {
      try {
        const balances = await fetchKrakenBalances();
        const usdBalance = await estimateUsdBalance(balances);
        account = await upsertTradingAccount({
          userId,
          exchange: 'kraken',
          baseBalance: usdBalance,
          currentBalance: usdBalance,
        });
      } catch (error) {
        console.warn('[trading/intelligence] Unable to sync Kraken balances:', error);
      }
    }

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

    if (!scores || scores.length === 0) {
      scores = await buildWatchlistFromActiveTrades(userId);
    }

    const watchlist = scores.map((row: any) => ({
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
    const fallbackLong = strategies.length === 0;
    const longPct = fallbackLong ? 100 : (totalWeight > 0 ? Math.round((longWeight / totalWeight) * 100) : 0);
    const shortPct = fallbackLong ? 0 : (totalWeight > 0 ? Math.max(0, 100 - longPct) : 0);

    let label = fallbackLong ? '100% LONG' : 'No active strategies';
    if (longPct === 100) label = '100% LONG';
    else if (shortPct === 100) label = '100% SHORT';
    else if (totalWeight > 0) label = `${longPct}% LONG / ${shortPct}% SHORT`;

    const primaryStrategy =
      strategies.find((s) => (s.strategy_id || '').toLowerCase() === 'momentum-long') ||
      strategies.find((s) => s.enabled !== false) ||
      null;

    const riskParamsRaw = (primaryStrategy?.risk_params || {}) as Record<string, any>;
    const hasRiskParams = riskParamsRaw && Object.keys(riskParamsRaw).length > 0;
    
    // Read dynamic defaults from harvest engine state
    let defaultSl = 0.04;
    let defaultTp = 0.08;
    let defaultTrail = 0.03;
    try {
      const harvestState = await getHarvestState();
      if (harvestState.cycleActive) {
        defaultSl = harvestState.stopLoss ?? defaultSl;
        defaultTp = harvestState.harvestFloor ?? defaultTp;
        defaultTrail = harvestState.trailEnabled
          ? (harvestState.trailWidth ? harvestState.harvestFloor * (1 - harvestState.trailWidth) : 0.03)
          : 0;
      }
    } catch {}
    const slValue = toNumber(riskParamsRaw.sl ?? riskParamsRaw.stopLossPct ?? riskParamsRaw.stop_loss, NaN);
    const tpValue = toNumber(riskParamsRaw.tp ?? riskParamsRaw.takeProfitPct ?? riskParamsRaw.take_profit, NaN);
    const trailValue = toNumber(riskParamsRaw.trail ?? riskParamsRaw.trailPct ?? riskParamsRaw.trailing, NaN);
    const sl = normalizePctValue(Number.isFinite(slValue) ? slValue : (hasRiskParams ? 0 : defaultSl));
    const tp = normalizePctValue(Number.isFinite(tpValue) ? tpValue : (hasRiskParams ? 0 : defaultTp));
    const trail = normalizePctValue(Number.isFinite(trailValue) ? trailValue : (hasRiskParams ? 0 : defaultTrail));

    const riskParams = {
      sl: formatPct(sl),
      tp: formatPct(tp),
      trail: formatPct(trail),
    };

    // Use harvest state + paper_accounts for auto-compounder (not Kraken total balance)
    let harvestCycleNumber = 0;
    let harvestCycleActive = false;
    let harvestCompoundingBase = 100;
    let harvestAvgCycleDays = 2.5;
    try {
      const hs = await getHarvestState();
      harvestCycleNumber = hs.cycleNumber ?? 0;
      harvestCycleActive = hs.cycleActive ?? false;
      harvestAvgCycleDays = 2.5; // TODO: calculate from history
    } catch {}

    // Get compounding base from paper_accounts (trading capital, not total Kraken balance)
    try {
      const { pool } = await import('@/lib/database');
      const paRes = await pool.query(
        `SELECT starting_balance FROM paper_accounts WHERE board_id = 15 ORDER BY id LIMIT 1`
      );
      if (paRes.rows[0]?.starting_balance) {
        harvestCompoundingBase = parseFloat(paRes.rows[0].starting_balance);
      }
    } catch {}

    const autoCompounder = {
      enabled: true,
      compoundingBase: harvestCompoundingBase,
      currentBalance: harvestCompoundingBase, // Will be updated with unrealized P&L when positions exist
      activeCycles: harvestCycleNumber,
      avgCycleDays: harvestAvgCycleDays,
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
