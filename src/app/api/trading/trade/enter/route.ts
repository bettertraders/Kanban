import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { createTrade, getBoard, getTrade, updateTrade } from '@/lib/database';
import { getCurrentPrice } from '@/lib/price-service';
import { createKrakenOrder, verifyOrder } from '@/lib/kraken-sync';

const normalizePair = (pair: string): string => {
  const normalized = String(pair || '').replace(/-/g, '/').toUpperCase();
  if (!normalized) return normalized;
  return normalized.includes('/') ? normalized : `${normalized}/USD`;
};

const normalizeSide = (value: unknown): 'buy' | 'sell' | null => {
  const side = String(value || '').trim().toLowerCase();
  if (!side) return null;
  if (side === 'long') return 'buy';
  if (side === 'short') return 'sell';
  if (side === 'buy' || side === 'sell') return side;
  return null;
};

// POST /api/trading/trade/enter — open a live Kraken trade
// Body: { boardId, symbol, side, amount, strategy?, bot_id? }
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { boardId, symbol, side, amount, strategy, bot_id, trade_id, tradeId } = body;

    if (!boardId || !symbol || !side || !amount) {
      return NextResponse.json({ error: 'boardId, symbol, side, and amount required' }, { status: 400 });
    }

    const normalizedSide = normalizeSide(side);
    if (!normalizedSide) {
      return NextResponse.json({ error: 'Invalid side' }, { status: 400 });
    }
    if (normalizedSide !== 'buy') {
      return NextResponse.json({ error: 'Kraken only supports LONG (buy) trades' }, { status: 400 });
    }

    const board = await getBoard(Number(boardId), user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const targetTradeId = Number(trade_id ?? tradeId);
    const tradeIdProvided = trade_id !== undefined || tradeId !== undefined;
    const targetTrade = Number.isFinite(targetTradeId) ? await getTrade(targetTradeId) : null;
    if (tradeIdProvided && !targetTrade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }
    if (targetTrade && targetTrade.board_id !== Number(boardId)) {
      return NextResponse.json({ error: 'Trade does not belong to this board' }, { status: 400 });
    }

    // Fetch current price
    const pair = normalizePair(symbol);
    const snapshot = await getCurrentPrice(pair);
    const currentPrice = snapshot.price;
    const quantity = Number(amount) / currentPrice;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid amount for market order' }, { status: 400 });
    }

    const order = await createKrakenOrder({
      symbol: pair,
      side: 'buy',
      amount: quantity,
      type: 'market',
    });
    const verification = await verifyOrder(String(order.id), pair);

    if (!verification.eligible || !verification.order) {
      return NextResponse.json({ error: 'Order not filled', order }, { status: 409 });
    }

    const verified = verification.order;
    const entryPrice = Number(verified.average ?? verified.price ?? currentPrice ?? 0) || null;
    const filled = Number(verified.filled ?? 0);
    const positionSize = entryPrice && filled ? entryPrice * filled : null;
    const enteredAt = verified.timestamp ? new Date(verified.timestamp).toISOString() : null;

    const metadata = {
      exchange: 'kraken',
      kraken_order_id: String(order.id),
      kraken_side: 'buy',
      kraken_status: verified.status || null,
      kraken_filled: verified.filled ?? null,
      kraken_remaining: verified.remaining ?? null,
      kraken_symbol: verified.symbol || pair,
      kraken_price: entryPrice,
      kraken_amount: filled || quantity,
      kraken_timestamp: verified.timestamp ?? null,
    };

    const existingMetadata = (() => {
      if (!targetTrade?.metadata) return {};
      if (typeof targetTrade.metadata === 'string') {
        try {
          return JSON.parse(targetTrade.metadata);
        } catch {
          return {};
        }
      }
      return targetTrade.metadata;
    })();

    const trade = targetTrade
      ? await updateTrade(targetTrade.id, {
        coin_pair: pair,
        direction: 'LONG',
        entry_price: entryPrice,
        current_price: entryPrice ?? currentPrice,
        position_size: positionSize,
        confidence_score: body.confidence ?? null,
        bot_id: bot_id ?? null,
        notes: strategy ? `Strategy: ${strategy}` : targetTrade.notes ?? null,
        status: 'active',
        column_name: 'Active',
        entered_at: enteredAt,
        exit_price: null,
        pnl_dollar: null,
        pnl_percent: null,
        exited_at: null,
        metadata: { ...existingMetadata, ...metadata },
      })
      : await createTrade(Number(boardId), user.id, {
        coin_pair: pair,
        direction: 'LONG',
        entry_price: entryPrice,
        current_price: entryPrice ?? currentPrice,
        position_size: positionSize,
        confidence_score: body.confidence ?? null,
        bot_id: bot_id ?? null,
        notes: strategy ? `Strategy: ${strategy}` : null,
        status: 'active',
        column_name: 'Active',
        entered_at: enteredAt,
        metadata,
      });

    return NextResponse.json({ order, trade, entry_price: entryPrice, quantity: filled || quantity, amount: Number(amount) });
  } catch (error) {
    console.error('POST /api/trading/trade/enter error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
