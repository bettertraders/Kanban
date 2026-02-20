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
    let deleted = 0;
    for (const trade of boardTrades) {
      await deleteTrade(Number(trade.id));
      deleted++;
    }

    const krakenTrades = await fetchKrakenTrades();
    let created = 0;
    for (const krakenTrade of krakenTrades) {
      const price = Number(krakenTrade?.price ?? 0);
      const amount = Number(krakenTrade?.amount ?? 0);
      const positionSize = price && amount ? price * amount : null;
      const side = normalizeSide(krakenTrade?.side);
      // Kraken 'sell' = closing a LONG position, 'buy' = closing a SHORT (or opening LONG)
      // For trade history, we show the original position direction
      const direction = side === 'sell' ? 'LONG' : 'SHORT';
      const pnlDollarRaw = getKrakenPnl(krakenTrade);
      const pnlDollar = Number.isFinite(pnlDollarRaw) ? Number(pnlDollarRaw) : null;
      const cost = Number(krakenTrade?.cost ?? (price && amount ? price * amount : NaN));
      const pnlPercent = pnlDollar !== null && Number.isFinite(cost) && cost > 0 ? (pnlDollar / cost) * 100 : null;
      const status = 'closed'; // All Kraken trades in history are closed
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

    return NextResponse.json({
      ok: true,
      mode: 'reset',
      deleted,
      created,
      krakenTrades: krakenTrades.length,
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
    // Kraken 'sell' = closing a LONG position
    const direction = side === 'sell' ? 'LONG' : 'SHORT';
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
    // Kraken 'sell' = closing a LONG position
    const direction = side === 'sell' ? 'LONG' : 'SHORT';
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
