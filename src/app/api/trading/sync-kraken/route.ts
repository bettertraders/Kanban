import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTradesForBoard, updateTrade, deleteTrade, getBoardTradingStats, createTrade } from '@/lib/database';
import { fetchKrakenTrades } from '@/lib/kraken-sync';

export const dynamic = 'force-dynamic';

type TradeRow = Record<string, any>;

const normalizePair = (pair: string) => pair.replace(/-/g, '/').toUpperCase();

const normalizeSide = (value: any) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim().toLowerCase();
  if (!str) return null;
  if (str === 'short') return 'sell';
  if (str === 'long') return 'buy';
  if (str === 'buy' || str === 'sell') return str;
  return null;
};

const getKrakenPnl = (trade: any) => {
  // Try Kraken's native profitLoss first (most accurate)
  const krakenPl = Number(trade?.info?.profitLoss ?? trade?.info?.pl ?? trade?.info?.pnl);
  if (Number.isFinite(krakenPl)) return krakenPl;
  
  // Fallback: calculate from trade data
  // For sells: need to know entry price from buy trade (not available in single trade)
  // Return null if Kraken doesn't provide PnL
  return null;
};

const getKrakenTimestamp = (trade: any) => {
  const ts = Number(trade?.timestamp ?? NaN);
  if (Number.isFinite(ts)) return ts;
  const datetime = trade?.datetime ? new Date(trade.datetime).getTime() : NaN;
  return Number.isFinite(datetime) ? datetime : null;
};

const getBoardTimestamp = (trade: TradeRow) => {
  const created = trade?.created_at ? new Date(trade.created_at).getTime() : NaN;
  if (Number.isFinite(created)) return created;
  const updated = trade?.updated_at ? new Date(trade.updated_at).getTime() : NaN;
  return Number.isFinite(updated) ? updated : null;
};

async function runSync(request: NextRequest, body: any) {
  const secret = process.env.TRADING_SYNC_SECRET;
  const secretOk = secret && request.headers.get('x-trading-sync-secret') === secret;

  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user && !secretOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const boardId = Number(
    request.nextUrl.searchParams.get('boardId') ||
    body?.boardId ||
    body?.board_id
  );

  if (!Number.isFinite(boardId)) {
    return NextResponse.json({ error: 'boardId required' }, { status: 400 });
  }

  const mode = String(request.nextUrl.searchParams.get('mode') || body?.mode || 'sync').toLowerCase();

  if (user) {
    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  }

  const boardTrades = await getTradesForBoard(boardId);

  if (mode === 'reset') {
    // Step 1: Delete all existing trades
    let deleted = 0;
    for (const trade of boardTrades) {
      await deleteTrade(Number(trade.id));
      deleted++;
    }

    // Step 2: Fetch all Kraken trades
    const krakenTrades = await fetchKrakenTrades();
    
    // Step 3: Group trades by symbol, separate buys and sells
    const buysBySymbol: Record<string, Array<{ price: number; amount: number; cost: number; ts: number; trade: any }>> = {};
    const sellTrades: Array<{ symbol: string; price: number; amount: number; cost: number; ts: number; trade: any }> = [];
    
    for (const kt of krakenTrades) {
      const symbol = kt?.symbol ? normalizePair(String(kt.symbol)) : 'UNKNOWN';
      const side = normalizeSide(kt?.side);
      const price = Number(kt?.price ?? 0);
      const amount = Number(kt?.amount ?? 0);
      const cost = Number(kt?.cost ?? 0);
      const ts = getKrakenTimestamp(kt) ?? 0;
      
      if (side === 'buy') {
        if (!buysBySymbol[symbol]) buysBySymbol[symbol] = [];
        buysBySymbol[symbol].push({ price, amount, cost, ts, trade: kt });
      } else if (side === 'sell') {
        sellTrades.push({ symbol, price, amount, cost, ts, trade: kt });
      }
    }
    
    // Sort buys by timestamp (FIFO matching)
    for (const sym of Object.keys(buysBySymbol)) {
      buysBySymbol[sym].sort((a, b) => a.ts - b.ts);
    }
    
    // Step 4: Match sells with buys (FIFO) and calculate PnL
    const buyIndexes: Record<string, number> = {};
    let created = 0;
    const userId = user?.id || Number(body?.userId) || 1;
    
    // Create cards for SELL trades only (Trade History)
    for (const sell of sellTrades) {
      const buys = buysBySymbol[sell.symbol] || [];
      const idx = buyIndexes[sell.symbol] || 0;
      const matchedBuy = buys[idx];
      if (matchedBuy) buyIndexes[sell.symbol] = idx + 1;
      
      const entryPrice = matchedBuy ? matchedBuy.price : null;
      const exitPrice = sell.price;
      const pnlDollar = entryPrice ? (exitPrice - entryPrice) * sell.amount : null;
      const pnlPercent = entryPrice && entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : null;
      const buyTs = matchedBuy ? matchedBuy.ts : null;
      const sellTs = sell.ts;
      const holdTimeMs = buyTs && sellTs ? sellTs - buyTs : null;
      const holdTimeHours = holdTimeMs ? holdTimeMs / (1000 * 60 * 60) : null;
      
      await createTrade(boardId, userId, {
        coin_pair: sell.symbol,
        direction: 'LONG',
        entry_price: entryPrice,
        exit_price: exitPrice,
        current_price: exitPrice,
        position_size: sell.cost,
        status: 'closed',
        column_name: 'Closed',
        entered_at: buyTs ? new Date(buyTs).toISOString() : null,
        exited_at: sellTs ? new Date(sellTs).toISOString() : null,
        pnl_dollar: pnlDollar !== null ? Number(pnlDollar.toFixed(4)) : null,
        pnl_percent: pnlPercent !== null ? Number(pnlPercent.toFixed(2)) : null,
        metadata: {
          exchange: 'kraken',
          kraken_trade_id: sell.trade?.id ? String(sell.trade.id) : null,
          kraken_order_id: sell.trade?.order ? String(sell.trade.order) : null,
          kraken_side: 'sell',
          kraken_status: 'closed',
          kraken_timestamp: sell.ts,
          kraken_price: exitPrice,
          kraken_cost: sell.cost,
          kraken_amount: sell.amount,
          kraken_entry_price: entryPrice,
          kraken_profit_loss: pnlDollar !== null ? Number(pnlDollar.toFixed(4)) : null,
          hold_time_hours: holdTimeHours ? Number(holdTimeHours.toFixed(1)) : null,
          sell_date: sellTs ? new Date(sellTs).toISOString() : null,
          buy_date: buyTs ? new Date(buyTs).toISOString() : null,
          created_by_sync: true,
        },
      });
      created++;
    }
    
    // Step 5: Create cards for unmatched BUYS (Active positions)
    for (const [symbol, buys] of Object.entries(buysBySymbol)) {
      const startIdx = buyIndexes[symbol] || 0;
      for (let i = startIdx; i < buys.length; i++) {
        const buy = buys[i];
        await createTrade(boardId, userId, {
          coin_pair: symbol,
          direction: 'LONG',
          entry_price: buy.price,
          current_price: buy.price,
          position_size: buy.cost,
          status: 'active',
          column_name: 'Active',
          entered_at: buy.ts ? new Date(buy.ts).toISOString() : null,
          pnl_dollar: null,
          pnl_percent: null,
          metadata: {
            exchange: 'kraken',
            kraken_trade_id: buy.trade?.id ? String(buy.trade.id) : null,
            kraken_order_id: buy.trade?.order ? String(buy.trade.order) : null,
            kraken_side: 'buy',
            kraken_status: 'open',
            kraken_timestamp: buy.ts,
            kraken_price: buy.price,
            kraken_cost: buy.cost,
            kraken_amount: buy.amount,
            created_by_sync: true,
          },
        });
        created++;
      }
    }

    return NextResponse.json({
      ok: true,
      mode: 'reset',
      deleted,
      created,
      krakenTrades: krakenTrades.length,
      sellTrades: sellTrades.length,
      activeBuys: created - sellTrades.length,
    });
  }

  const krakenTrades = await fetchKrakenTrades();
  const krakenIndex = krakenTrades.map((trade) => {
    const symbol = trade?.symbol ? normalizePair(String(trade.symbol)) : 'UNKNOWN';
    const side = normalizeSide(trade?.side);
    const timestamp = getKrakenTimestamp(trade);
    return { trade, symbol, side, timestamp };
  });

  const matchedTradeIds = new Set<number>();
  const matchedKrakenIndexes = new Set<number>();
  const phantomTrades: TradeRow[] = [];
  const matchedPairs: Array<{ boardTrade: TradeRow; krakenTrade: any }> = [];

  const findKrakenMatch = (trade: TradeRow) => {
    const boardSymbol = trade?.coin_pair ? normalizePair(String(trade.coin_pair)) : 'UNKNOWN';
    const boardSide = normalizeSide(trade?.metadata?.kraken_side || trade?.metadata?.side || trade?.metadata?.order_side || trade?.direction);
    const boardTimestamp = getBoardTimestamp(trade);
    if (!Number.isFinite(boardTimestamp)) return null;

    let bestIndex: number | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (let i = 0; i < krakenIndex.length; i++) {
      if (matchedKrakenIndexes.has(i)) continue;
      const candidate = krakenIndex[i];
      if (candidate.symbol !== boardSymbol) continue;
      if (boardSide && candidate.side && candidate.side !== boardSide) continue;
      if (!Number.isFinite(candidate.timestamp)) continue;
      const delta = Math.abs(Number(candidate.timestamp) - Number(boardTimestamp));
      if (delta > 3600000) continue;
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = i;
      }
    }

    return bestIndex != null ? { index: bestIndex, candidate: krakenIndex[bestIndex] } : null;
  };

  for (const trade of boardTrades) {
    const match = findKrakenMatch(trade);
    if (!match) {
      phantomTrades.push(trade);
      continue;
    }

    matchedKrakenIndexes.add(match.index);
    matchedTradeIds.add(Number(trade.id));
    matchedPairs.push({ boardTrade: trade, krakenTrade: match.candidate.trade });
  }

  let deleted = 0;
  for (const trade of phantomTrades) {
    await deleteTrade(Number(trade.id));
    deleted++;
  }

  let updated = 0;
  for (const { boardTrade, krakenTrade } of matchedPairs) {
    const price = Number(krakenTrade?.price ?? 0);
    const amount = Number(krakenTrade?.amount ?? 0);
    const positionSize = price && amount ? price * amount : null;
    const side = normalizeSide(krakenTrade?.side);
    // Kraken only supports LONG positions
    const direction = 'LONG';
    const pnlDollarRaw = getKrakenPnl(krakenTrade);
    const pnlDollar = Number.isFinite(pnlDollarRaw) ? Number(pnlDollarRaw) : null;
    const cost = Number(krakenTrade?.cost ?? (price && amount ? price * amount : NaN));
    const pnlPercent = pnlDollar !== null && Number.isFinite(cost) && cost > 0 ? (pnlDollar / cost) * 100 : null;
    const status = 'closed';
    const columnName = 'Closed';
    const existingMetadata = boardTrade.metadata || {};

    await updateTrade(Number(boardTrade.id), {
      coin_pair: krakenTrade?.symbol ? normalizePair(String(krakenTrade.symbol)) : boardTrade.coin_pair,
      direction,
      entry_price: price || null,
      current_price: price || null,
      position_size: positionSize,
      status,
      column_name: columnName,
      pnl_dollar: Number.isFinite(pnlDollar) ? pnlDollar : null,
      pnl_percent: pnlPercent,
      metadata: {
        ...existingMetadata,
        exchange: 'kraken',
        kraken_trade_id: krakenTrade?.id ? String(krakenTrade.id) : null,
        kraken_order_id: krakenTrade?.order ? String(krakenTrade.order) : null,
        kraken_side: side,
        kraken_status: String(krakenTrade?.status || 'closed').toLowerCase(),
        kraken_timestamp: getKrakenTimestamp(krakenTrade),
        kraken_price: Number.isFinite(price) ? price : null,
        kraken_cost: Number.isFinite(cost) ? cost : null,
        kraken_amount: Number.isFinite(amount) ? amount : null,
        kraken_profit_loss: Number.isFinite(pnlDollar) ? pnlDollar : null,
        verified_at: new Date().toISOString(),
      },
    });
    updated++;
  }

  let created = 0;
  for (let i = 0; i < krakenIndex.length; i++) {
    if (matchedKrakenIndexes.has(i)) continue;
    const krakenTrade = krakenIndex[i].trade;
    const price = Number(krakenTrade?.price ?? 0);
    const amount = Number(krakenTrade?.amount ?? 0);
    const positionSize = price && amount ? price * amount : null;
    const side = normalizeSide(krakenTrade?.side);
    // Kraken only supports LONG positions
    const direction = 'LONG';
    const pnlDollarRaw = getKrakenPnl(krakenTrade);
    const pnlDollar = Number.isFinite(pnlDollarRaw) ? Number(pnlDollarRaw) : null;
    const cost = Number(krakenTrade?.cost ?? (price && amount ? price * amount : NaN));
    const pnlPercent = pnlDollar !== null && Number.isFinite(cost) && cost > 0 ? (pnlDollar / cost) * 100 : null;
    const status = 'closed';
    const columnName = 'Closed';

    await createTrade(boardId, user?.id || Number(body?.userId) || 1, {
      coin_pair: krakenTrade?.symbol ? normalizePair(String(krakenTrade.symbol)) : 'UNKNOWN',
      direction,
      entry_price: price || null,
      current_price: price || null,
      position_size: positionSize,
      status,
      column_name: columnName,
      pnl_dollar: Number.isFinite(pnlDollar) ? pnlDollar : null,
      pnl_percent: pnlPercent,
      metadata: {
        exchange: 'kraken',
        kraken_trade_id: krakenTrade?.id ? String(krakenTrade.id) : null,
        kraken_order_id: krakenTrade?.order ? String(krakenTrade.order) : null,
        kraken_side: side,
        kraken_status: 'closed',
        kraken_timestamp: getKrakenTimestamp(krakenTrade),
        kraken_price: Number.isFinite(price) ? price : null,
        kraken_cost: Number.isFinite(cost) ? cost : null,
        kraken_amount: Number.isFinite(amount) ? amount : null,
        kraken_profit_loss: Number.isFinite(pnlDollar) ? pnlDollar : null,
        created_by_sync: true,
      },
    });
    created++;
  }

  const stats = await getBoardTradingStats(boardId);

  return NextResponse.json({
    ok: true,
    boardId,
    krakenTrades: krakenTrades.length,
    boardTrades: boardTrades.length,
    matched: matchedTradeIds.size,
    phantom: phantomTrades.length,
    deleted,
    updated,
    created,
    stats,
  });
}

export async function GET(request: NextRequest) {
  return runSync(request, null);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return runSync(request, body);
}
