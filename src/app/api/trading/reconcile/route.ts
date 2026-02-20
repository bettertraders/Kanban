import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTradesForBoard, updateTrade } from '@/lib/database';
import { fetchKrakenOpenOrders, fetchKrakenOrder } from '@/lib/kraken-sync';
import { getCurrentPrice } from '@/lib/price-service';

export const dynamic = 'force-dynamic';

type TradeRow = Record<string, any>;

type KrakenMatch = {
  orderId?: string | null;
};

const toStringOrNull = (value: any) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
};

function extractKrakenOrderId(trade: TradeRow): KrakenMatch {
  const metadata = trade?.metadata || {};
  return {
    orderId: toStringOrNull(metadata?.kraken_order_id || metadata?.order_id || metadata?.orderId),
  };
}

function isKrakenTrade(trade: TradeRow): boolean {
  const metadata = trade?.metadata || {};
  if (metadata?.exchange && String(metadata.exchange).toLowerCase() === 'kraken') return true;
  if (metadata?.source && String(metadata.source).toLowerCase() === 'kraken') return true;
  const ids = extractKrakenOrderId(trade);
  return Boolean(ids.orderId);
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

  let updated = 0;
  let phantom = 0;
  let open = 0;

  for (const trade of krakenTrades) {
    const { orderId } = extractKrakenOrderId(trade);
    if (!orderId) continue;

    const openOrder = openOrderById.get(orderId);
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

    let order: any = null;
    try {
      order = await fetchKrakenOrder(orderId, trade?.coin_pair);
    } catch (error) {
      order = null;
    }

    if (!order || (String(order.status || '').toLowerCase() === 'canceled' && Number(order.filled || 0) <= 0)) {
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

  return NextResponse.json({
    ok: true,
    boardId,
    activeTrades: activeTrades.length,
    krakenTrades: krakenTrades.length,
    openOrders: openOrders.length,
    updated,
    phantom,
    open,
  });
}

export async function GET(request: NextRequest) {
  return runReconcile(request, null);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return runReconcile(request, body);
}
