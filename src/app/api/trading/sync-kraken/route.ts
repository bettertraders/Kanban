import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTradesForBoard, updateTrade, deleteTrade, getBoardTradingStats, createTrade } from '@/lib/database';
import { fetchKrakenOpenOrders, fetchKrakenTrades } from '@/lib/kraken-sync';

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

const isKrakenTrade = (trade: TradeRow) => {
  const metadata = trade?.metadata || {};
  if (metadata?.exchange && String(metadata.exchange).toLowerCase() === 'kraken') return true;
  if (metadata?.source && String(metadata.source).toLowerCase() === 'kraken') return true;
  if (
    metadata?.kraken_trade_id ||
    metadata?.kraken_order_id ||
    metadata?.kraken_entry_order_id ||
    metadata?.kraken_exit_order_id ||
    metadata?.order_id ||
    metadata?.orderId
  ) {
    return true;
  }
  if (metadata?.created_by_sync) return true;
  if (trade?.status === 'active' || trade?.status === 'closed') return true;
  if (trade?.column_name === 'Active' || trade?.column_name === 'Closed') return true;
  return false;
};

const toStringOrNull = (value: any) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
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
  const entered = trade?.entered_at ? new Date(trade.entered_at).getTime() : NaN;
  if (Number.isFinite(entered)) return entered;
  const exited = trade?.exited_at ? new Date(trade.exited_at).getTime() : NaN;
  if (Number.isFinite(exited)) return exited;
  const created = trade?.created_at ? new Date(trade.created_at).getTime() : NaN;
  if (Number.isFinite(created)) return created;
  const updated = trade?.updated_at ? new Date(trade.updated_at).getTime() : NaN;
  return Number.isFinite(updated) ? updated : null;
};

const getBoardKrakenIds = (trade: TradeRow) => {
  const metadata = trade?.metadata || {};
  return {
    tradeId: toStringOrNull(metadata?.kraken_trade_id || metadata?.trade_id || metadata?.tradeId),
    orderId: toStringOrNull(metadata?.kraken_order_id || metadata?.order_id || metadata?.orderId),
    entryOrderId: toStringOrNull(metadata?.kraken_entry_order_id),
    exitOrderId: toStringOrNull(metadata?.kraken_exit_order_id),
  };
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
    
    // Step 5: Create ONE card per symbol for unmatched BUYS (Active positions)
    // Aggregate multiple buys of the same coin into a single position card
    for (const [symbol, buys] of Object.entries(buysBySymbol)) {
      const startIdx = buyIndexes[symbol] || 0;
      const remainingBuys = buys.slice(startIdx);
      if (remainingBuys.length === 0) continue;

      // Aggregate: total amount, total cost, weighted avg entry price, earliest timestamp
      const totalAmount = remainingBuys.reduce((sum, b) => sum + b.amount, 0);
      const totalCost = remainingBuys.reduce((sum, b) => sum + b.cost, 0);
      const avgEntryPrice = totalCost > 0 && totalAmount > 0 ? totalCost / totalAmount : remainingBuys[0].price;
      const earliestTs = Math.min(...remainingBuys.map(b => b.ts));
      const tradeIds = remainingBuys.map(b => b.trade?.id ? String(b.trade.id) : null).filter(Boolean);
      const orderIds = remainingBuys.map(b => b.trade?.order ? String(b.trade.order) : null).filter(Boolean);

      await createTrade(boardId, userId, {
        coin_pair: symbol,
        direction: 'LONG',
        entry_price: Number(avgEntryPrice.toFixed(6)),
        current_price: Number(avgEntryPrice.toFixed(6)),
        position_size: Number(totalCost.toFixed(4)),
        status: 'active',
        column_name: 'Active',
        entered_at: earliestTs ? new Date(earliestTs).toISOString() : null,
        pnl_dollar: null,
        pnl_percent: null,
        metadata: {
          exchange: 'kraken',
          kraken_trade_ids: tradeIds,
          kraken_order_ids: orderIds,
          kraken_side: 'buy',
          kraken_status: 'open',
          kraken_timestamp: earliestTs,
          kraken_avg_entry_price: Number(avgEntryPrice.toFixed(6)),
          kraken_total_cost: Number(totalCost.toFixed(4)),
          kraken_total_amount: Number(totalAmount.toFixed(8)),
          kraken_num_fills: remainingBuys.length,
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
      sellTrades: sellTrades.length,
      activeBuys: created - sellTrades.length,
    });
  }

  const krakenTrades = await fetchKrakenTrades();
  const openOrders = await fetchKrakenOpenOrders().catch(() => []);
  const openOrderById = new Map<string, any>();
  for (const order of openOrders) {
    if (order?.id) openOrderById.set(String(order.id), order);
  }

  const krakenIndex = krakenTrades.map((trade) => {
    const symbol = trade?.symbol ? normalizePair(String(trade.symbol)) : 'UNKNOWN';
    const side = normalizeSide(trade?.side);
    const timestamp = getKrakenTimestamp(trade);
    return { trade, symbol, side, timestamp };
  });
  const krakenTradeById = new Map<string, number>();
  const krakenTradeByOrderId = new Map<string, number>();
  for (let i = 0; i < krakenIndex.length; i++) {
    const krakenTrade = krakenIndex[i].trade;
    if (krakenTrade?.id) krakenTradeById.set(String(krakenTrade.id), i);
    if (krakenTrade?.order) krakenTradeByOrderId.set(String(krakenTrade.order), i);
  }

  const matchedTradeIds = new Set<number>();
  const matchedKrakenIndexes = new Set<number>();
  const matchedOpenOrderIds = new Set<string>();
  const phantomTrades: TradeRow[] = [];
  const matchedPairs: Array<{ boardTrade: TradeRow; krakenTrade: any }> = [];

  const findKrakenMatch = (trade: TradeRow) => {
    const ids = getBoardKrakenIds(trade);
    const directTradeId =
      (ids.tradeId && krakenTradeById.get(ids.tradeId)) ??
      (ids.exitOrderId && krakenTradeByOrderId.get(ids.exitOrderId)) ??
      (ids.orderId && krakenTradeByOrderId.get(ids.orderId)) ??
      (ids.entryOrderId && krakenTradeByOrderId.get(ids.entryOrderId));

    if (typeof directTradeId === 'number') {
      if (!matchedKrakenIndexes.has(directTradeId)) {
        return { index: directTradeId, candidate: krakenIndex[directTradeId] };
      }
    }

    if (ids.orderId && openOrderById.has(ids.orderId)) {
      return { openOrderId: ids.orderId };
    }
    if (ids.entryOrderId && openOrderById.has(ids.entryOrderId)) {
      return { openOrderId: ids.entryOrderId };
    }

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

  const boardTradesForSync = boardTrades.filter(isKrakenTrade);

  for (const trade of boardTradesForSync) {
    const match = findKrakenMatch(trade);
    if (!match) {
      phantomTrades.push(trade);
      continue;
    }

    if ('openOrderId' in match && match.openOrderId) {
      matchedTradeIds.add(Number(trade.id));
      matchedOpenOrderIds.add(String(match.openOrderId));
      continue;
    }

    matchedKrakenIndexes.add(match.index!);
    matchedTradeIds.add(Number(trade.id));
    matchedPairs.push({ boardTrade: trade, krakenTrade: match.candidate!.trade });
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
    const side = normalizeSide(krakenTrade?.side);
    // Kraken only supports LONG positions
    const direction = 'LONG';
    const pnlDollarRaw = getKrakenPnl(krakenTrade);
    const pnlDollar = Number.isFinite(pnlDollarRaw) ? Number(pnlDollarRaw) : null;
    const cost = Number(krakenTrade?.cost ?? (price && amount ? price * amount : NaN));
    const pnlPercent = pnlDollar !== null && Number.isFinite(cost) && cost > 0 ? (pnlDollar / cost) * 100 : null;
    const isSell = side === 'sell';
    const status = isSell ? 'closed' : 'active';
    const columnName = isSell ? 'Closed' : 'Active';
    const existingMetadata = boardTrade.metadata || {};
    const timestamp = getKrakenTimestamp(krakenTrade);

    const updates: Record<string, unknown> = {
      coin_pair: krakenTrade?.symbol ? normalizePair(String(krakenTrade.symbol)) : boardTrade.coin_pair,
      direction,
      current_price: price || null,
      status,
      column_name: columnName,
      metadata: {
        ...existingMetadata,
        exchange: 'kraken',
        kraken_trade_id: krakenTrade?.id ? String(krakenTrade.id) : null,
        kraken_order_id: krakenTrade?.order ? String(krakenTrade.order) : null,
        kraken_side: side,
        kraken_status: String(krakenTrade?.status || (isSell ? 'closed' : 'open')).toLowerCase(),
        kraken_timestamp: timestamp,
        kraken_price: Number.isFinite(price) ? price : null,
        kraken_cost: Number.isFinite(cost) ? cost : null,
        kraken_amount: Number.isFinite(amount) ? amount : null,
        kraken_profit_loss: Number.isFinite(pnlDollar) ? pnlDollar : null,
        verified_at: new Date().toISOString(),
      },
    };

    if (!boardTrade.position_size && Number.isFinite(cost)) updates.position_size = cost;
    if (side === 'buy') {
      if (!boardTrade.entry_price) updates.entry_price = Number.isFinite(price) ? price : null;
      if (!boardTrade.entered_at && timestamp) updates.entered_at = new Date(timestamp).toISOString();
    }
    if (side === 'sell') {
      updates.exit_price = Number.isFinite(price) ? price : null;
      if (pnlDollar !== null) updates.pnl_dollar = pnlDollar;
      if (pnlPercent !== null) updates.pnl_percent = pnlPercent;
      if (!boardTrade.exited_at && timestamp) updates.exited_at = new Date(timestamp).toISOString();
    }

    await updateTrade(Number(boardTrade.id), updates);
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
    const isSell = side === 'sell';
    const status = isSell ? 'closed' : 'active';
    const columnName = isSell ? 'Closed' : 'Active';
    const timestamp = getKrakenTimestamp(krakenTrade);

    await createTrade(boardId, user?.id || Number(body?.userId) || 1, {
      coin_pair: krakenTrade?.symbol ? normalizePair(String(krakenTrade.symbol)) : 'UNKNOWN',
      direction,
      entry_price: !isSell && price ? price : null,
      current_price: price || null,
      position_size: positionSize,
      exit_price: isSell && price ? price : null,
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
        kraken_timestamp: timestamp,
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
    openOrdersMatched: matchedOpenOrderIds.size,
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
