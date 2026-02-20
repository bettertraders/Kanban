import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { deleteTrade, getBoard, getTradesForBoard, updateTrade } from '@/lib/database';
import { fetchKrakenOpenOrders, fetchKrakenOrder, fetchKrakenTrades } from '@/lib/kraken-sync';
import { getCurrentPrice } from '@/lib/price-service';

export const dynamic = 'force-dynamic';

type TradeRow = Record<string, any>;

type KrakenMatch = {
  orderId?: string | null;
  tradeId?: string | null;
};

const normalizePair = (pair: string): string => pair.replace(/-/g, '/').toUpperCase();

const toStringOrNull = (value: any) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
};

function extractKrakenOrderId(trade: TradeRow): KrakenMatch {
  const metadata = trade?.metadata || {};
  return {
    orderId: toStringOrNull(
      metadata?.kraken_order_id ||
        metadata?.kraken_entry_order_id ||
        metadata?.kraken_exit_order_id ||
        metadata?.order_id ||
        metadata?.orderId
    ),
    tradeId: toStringOrNull(metadata?.kraken_trade_id || metadata?.trade_id || metadata?.tradeId),
  };
}

function isKrakenTrade(trade: TradeRow): boolean {
  const metadata = trade?.metadata || {};
  if (metadata?.exchange && String(metadata.exchange).toLowerCase() === 'kraken') return true;
  if (metadata?.source && String(metadata.source).toLowerCase() === 'kraken') return true;
  const ids = extractKrakenOrderId(trade);
  return Boolean(ids.orderId || ids.tradeId);
}

function computePnl(trade: TradeRow, currentPrice: number) {
  const entryPrice = Number(trade?.entry_price ?? 0);
  const positionSize = Number(trade?.position_size ?? 0);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(positionSize) || positionSize <= 0) {
    return { pnlDollar: null, pnlPercent: null };
  }

  const quantity = positionSize / entryPrice;
  const direction = String(trade?.direction || 'long').toLowerCase();
  const delta = direction === 'short' ? (entryPrice - currentPrice) : (currentPrice - entryPrice);
  const pnlDollar = delta * quantity;
  const pnlPercent = entryPrice ? (delta / entryPrice) * 100 : null;
  return { pnlDollar, pnlPercent };
}

function buildKrakenPositions(trades: any[]) {
  const positions = new Map<string, { amount: number }>();
  for (const trade of trades) {
    const symbol = trade?.symbol ? normalizePair(String(trade.symbol)) : null;
    if (!symbol) continue;
    const side = String(trade?.side || '').toLowerCase();
    const amount = Number(trade?.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const existing = positions.get(symbol) || { amount: 0 };
    if (side === 'buy') {
      existing.amount += amount;
    } else if (side === 'sell') {
      existing.amount -= amount;
    }
    positions.set(symbol, existing);
  }
  return positions;
}

async function runReconcile(request: NextRequest, body: any) {
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

  if (user) {
    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  }

  const boardTrades = await getTradesForBoard(boardId);
  const activeTrades = boardTrades.filter((trade) => trade.status === 'active' || trade.column_name === 'Active');
  const krakenTrades = activeTrades.filter(isKrakenTrade);

  const openOrders = await fetchKrakenOpenOrders();
  const openOrderById = new Map<string, any>();
  for (const order of openOrders) {
    if (order?.id) openOrderById.set(String(order.id), order);
  }

  const removeOrphans = Boolean(
    body?.remove ||
    body?.cleanup ||
    String(request.nextUrl.searchParams.get('remove') || '').toLowerCase() === '1' ||
    String(request.nextUrl.searchParams.get('mode') || '').toLowerCase() === 'remove'
  );

  const krakenTradeHistory = await fetchKrakenTrades();
  const krakenPositions = buildKrakenPositions(krakenTradeHistory);
  const krakenTradeById = new Map<string, any>();
  const krakenTradeByOrderId = new Map<string, any>();
  for (const trade of krakenTradeHistory) {
    if (trade?.id) krakenTradeById.set(String(trade.id), trade);
    if (trade?.order) krakenTradeByOrderId.set(String(trade.order), trade);
  }

  let updated = 0;
  let phantom = 0;
  let open = 0;
  let removed = 0;
  let orphaned = 0;

  for (const trade of krakenTrades) {
    const { orderId, tradeId } = extractKrakenOrderId(trade);
    if (!orderId && !tradeId) continue;

    const openOrder = orderId ? openOrderById.get(orderId) : undefined;
    if (openOrder) {
      open++;
      const currentPrice = trade?.coin_pair ? (await getCurrentPrice(trade.coin_pair)).price : null;
      const pnl = currentPrice != null ? computePnl(trade, Number(currentPrice)) : { pnlDollar: null, pnlPercent: null };
      const existingMetadata = trade.metadata || {};
      await updateTrade(Number(trade.id), {
        current_price: currentPrice ?? trade.current_price ?? null,
        pnl_dollar: pnl.pnlDollar,
        pnl_percent: pnl.pnlPercent,
        metadata: {
          ...existingMetadata,
          exchange: 'kraken',
          order_id: orderId,
          order_status: openOrder.status || 'open',
          order_filled: openOrder.filled ?? null,
          order_remaining: openOrder.remaining ?? null,
        },
      });
      updated++;
      continue;
    }

    const matchedTrade =
      (tradeId && krakenTradeById.get(tradeId)) ||
      (orderId && krakenTradeByOrderId.get(orderId)) ||
      null;

    if (matchedTrade) {
      const currentPrice = trade?.coin_pair ? (await getCurrentPrice(trade.coin_pair)).price : null;
      const pnl = currentPrice != null ? computePnl(trade, Number(currentPrice)) : { pnlDollar: null, pnlPercent: null };
      const existingMetadata = trade.metadata || {};
      await updateTrade(Number(trade.id), {
        current_price: currentPrice ?? trade.current_price ?? null,
        pnl_dollar: pnl.pnlDollar,
        pnl_percent: pnl.pnlPercent,
        metadata: {
          ...existingMetadata,
          exchange: 'kraken',
          kraken_trade_id: matchedTrade?.id ? String(matchedTrade.id) : existingMetadata?.kraken_trade_id,
          kraken_order_id: matchedTrade?.order ? String(matchedTrade.order) : existingMetadata?.kraken_order_id,
          kraken_side: matchedTrade?.side ? String(matchedTrade.side).toLowerCase() : existingMetadata?.kraken_side,
          kraken_status: matchedTrade?.status ? String(matchedTrade.status).toLowerCase() : existingMetadata?.kraken_status,
          kraken_timestamp: matchedTrade?.timestamp ?? existingMetadata?.kraken_timestamp,
        },
      });
      updated++;
      continue;
    }

    let order: any = null;
    if (orderId) {
      try {
        order = await fetchKrakenOrder(orderId, trade?.coin_pair);
      } catch (error) {
        order = null;
      }
    }

    if (!order || (String(order.status || '').toLowerCase() === 'canceled' && Number(order.filled || 0) <= 0)) {
      if (removeOrphans) {
        await deleteTrade(Number(trade.id));
        removed++;
        continue;
      }
      const existingMetadata = trade.metadata || {};
      await updateTrade(Number(trade.id), {
        status: 'phantom',
        column_name: 'Phantom',
        metadata: { ...existingMetadata, phantom: true, phantom_at: new Date().toISOString() },
      });
      phantom++;
      updated++;
      continue;
    }

    const currentPrice = trade?.coin_pair ? (await getCurrentPrice(trade.coin_pair)).price : null;
    const pnl = currentPrice != null ? computePnl(trade, Number(currentPrice)) : { pnlDollar: null, pnlPercent: null };
    const existingMetadata = trade.metadata || {};
    await updateTrade(Number(trade.id), {
      current_price: currentPrice ?? trade.current_price ?? null,
      pnl_dollar: pnl.pnlDollar,
      pnl_percent: pnl.pnlPercent,
      metadata: {
        ...existingMetadata,
        exchange: 'kraken',
        order_id: orderId,
        order_status: order.status || null,
        order_filled: order.filled ?? null,
        order_remaining: order.remaining ?? null,
      },
    });
    updated++;
  }

  for (const trade of krakenTrades) {
    const { orderId } = extractKrakenOrderId(trade);
    if (orderId && openOrderById.has(String(orderId))) {
      continue;
    }
    const symbol = trade?.coin_pair ? normalizePair(String(trade.coin_pair)) : null;
    if (!symbol) continue;
    const position = krakenPositions.get(symbol);
    if (!position || position.amount <= 0) {
      orphaned++;
      if (removeOrphans) {
        await deleteTrade(Number(trade.id));
        removed++;
      } else {
        const existingMetadata = trade.metadata || {};
        await updateTrade(Number(trade.id), {
          status: 'phantom',
          column_name: 'Phantom',
          metadata: { ...existingMetadata, phantom: true, phantom_at: new Date().toISOString(), phantom_reason: 'no_position' },
        });
        updated++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    boardId,
    activeTrades: activeTrades.length,
    krakenTrades: krakenTrades.length,
    openOrders: openOrders.length,
    updated,
    phantom,
    open,
    orphaned,
    removed,
    removeOrphans,
  });
}

export async function GET(request: NextRequest) {
  return runReconcile(request, null);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return runReconcile(request, body);
}
