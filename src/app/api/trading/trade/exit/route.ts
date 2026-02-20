import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTrade, updateTrade } from '@/lib/database';
import { createKrakenOrder, verifyOrder } from '@/lib/kraken-sync';

const normalizePair = (pair: string): string => pair.replace(/-/g, '/').toUpperCase();

const toNumberOrNull = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const computePnl = (entryPrice: number, exitPrice: number, positionSize: number) => {
  const pnlPercent = entryPrice !== 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
  const pnlDollar = (pnlPercent / 100) * positionSize;
  return { pnlDollar, pnlPercent };
};

// POST /api/trading/trade/exit — close a live Kraken trade
// Body: { trade_id }
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { trade_id } = body;

    if (!trade_id) {
      return NextResponse.json({ error: 'trade_id required' }, { status: 400 });
    }

    const trade = await getTrade(Number(trade_id));
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    const board = await getBoard(trade.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    if (String(trade.direction || '').toLowerCase() === 'short') {
      return NextResponse.json({ error: 'Kraken only supports LONG (buy/sell) trades' }, { status: 400 });
    }

    const pair = normalizePair(trade.coin_pair);
    const metadata = trade?.metadata || {};
    const entryPrice = toNumberOrNull(trade.entry_price);
    const positionSizeRaw = toNumberOrNull(trade.position_size);
    const filledRaw = toNumberOrNull(metadata?.order_filled ?? metadata?.kraken_amount ?? metadata?.amount);

    let quantity = filledRaw;
    if (!quantity && entryPrice && positionSizeRaw) {
      quantity = positionSizeRaw / entryPrice;
    }

    if (!quantity || quantity <= 0) {
      return NextResponse.json({ error: 'Unable to determine order quantity for exit' }, { status: 400 });
    }

    const order = await createKrakenOrder({
      symbol: pair,
      side: 'sell',
      amount: quantity,
      type: 'market',
    });
    const verification = await verifyOrder(String(order.id), pair);

    if (!verification.eligible || !verification.order) {
      return NextResponse.json({ error: 'Order not filled', order }, { status: 409 });
    }

    const verified = verification.order;
    const exitPrice = Number(verified.average ?? verified.price ?? 0) || null;
    const exitFilled = Number(verified.filled ?? quantity);
    const positionSize = positionSizeRaw ?? (entryPrice && exitFilled ? entryPrice * exitFilled : null);

    if (!exitPrice || !entryPrice || !positionSize) {
      return NextResponse.json({ error: 'Unable to compute exit pricing' }, { status: 400 });
    }

    const pnl = computePnl(entryPrice, exitPrice, positionSize);
    const existingOrderId = metadata?.kraken_order_id || metadata?.order_id || metadata?.orderId || null;

    const updated = await updateTrade(Number(trade_id), {
      exit_price: exitPrice,
      current_price: exitPrice,
      pnl_dollar: pnl.pnlDollar,
      pnl_percent: pnl.pnlPercent,
      status: 'closed',
      column_name: 'Closed',
      exited_at: verified.timestamp ? new Date(verified.timestamp).toISOString() : new Date().toISOString(),
      metadata: {
        ...metadata,
        exchange: 'kraken',
        kraken_entry_order_id: metadata?.kraken_entry_order_id || existingOrderId,
        kraken_exit_order_id: String(order.id),
        kraken_side: 'sell',
        kraken_status: verified.status || null,
        kraken_exit_filled: verified.filled ?? null,
        kraken_exit_remaining: verified.remaining ?? null,
        kraken_exit_price: exitPrice,
        kraken_exit_timestamp: verified.timestamp ?? null,
        kraken_symbol: verified.symbol || pair,
        ...(existingOrderId ? {} : { kraken_order_id: String(order.id) }),
      },
    });

    return NextResponse.json({
      trade: updated,
      order,
      exit_price: exitPrice,
      pnl_dollar: pnl.pnlDollar,
      pnl_percent: pnl.pnlPercent,
    });
  } catch (error) {
    console.error('POST /api/trading/trade/exit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
