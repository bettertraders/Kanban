import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTradesForBoard, updateTrade, deleteTrade, getBoardTradingStats, createTrade } from '@/lib/database';
import { fetchKrakenTrades } from '@/lib/kraken-sync';

export const dynamic = 'force-dynamic';

type TradeRow = Record<string, any>;

type KrakenMatch = {
  tradeId?: string | null;
  orderId?: string | null;
};

const toStringOrNull = (value: any) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
};

const normalizePair = (pair: string) => pair.replace(/-/g, '/').toUpperCase();

function extractKrakenIds(trade: TradeRow): KrakenMatch {
  const metadata = trade?.metadata || {};
  return {
    tradeId: toStringOrNull(metadata?.kraken_trade_id || metadata?.trade_id || metadata?.krakenTradeId),
    orderId: toStringOrNull(metadata?.kraken_order_id || metadata?.order_id || metadata?.orderId),
  };
}

function isKrakenTrade(trade: TradeRow): boolean {
  const metadata = trade?.metadata || {};
  if (metadata?.exchange && String(metadata.exchange).toLowerCase() === 'kraken') return true;
  if (metadata?.source && String(metadata.source).toLowerCase() === 'kraken') return true;
  const ids = extractKrakenIds(trade);
  return Boolean(ids.tradeId || ids.orderId);
}

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

  if (user) {
    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  }

  const phantomMode = String(
    request.nextUrl.searchParams.get('phantoms') ||
    body?.phantoms ||
    'flag'
  ).toLowerCase();

  const createMissing = Boolean(body?.createMissing || request.nextUrl.searchParams.get('createMissing') === 'true');

  const krakenTrades = await fetchKrakenTrades();
  const krakenByTradeId = new Map<string, any>();
  const krakenByOrderId = new Map<string, any>();

  for (const trade of krakenTrades) {
    if (trade?.id) krakenByTradeId.set(String(trade.id), trade);
    if (trade?.order) krakenByOrderId.set(String(trade.order), trade);
  }

  const boardTrades = await getTradesForBoard(boardId);
  const krakenBoardTrades = boardTrades.filter(isKrakenTrade);

  const matchedTradeIds = new Set<number>();
  const matchedKrakenTradeIds = new Set<string>();
  const matchedKrakenOrderIds = new Set<string>();
  const phantomTrades: TradeRow[] = [];
  const untrackedTrades: TradeRow[] = [];

  for (const trade of krakenBoardTrades) {
    const ids = extractKrakenIds(trade);
    if (!ids.tradeId && !ids.orderId) {
      untrackedTrades.push(trade);
      continue;
    }

    const matched = ids.tradeId ? krakenByTradeId.get(ids.tradeId) : null;
    const matchedByOrder = !matched && ids.orderId ? krakenByOrderId.get(ids.orderId) : null;
    const krakenMatch = matched || matchedByOrder;

    if (krakenMatch) {
      matchedTradeIds.add(Number(trade.id));
      if (krakenMatch.id) matchedKrakenTradeIds.add(String(krakenMatch.id));
      if (krakenMatch.order) matchedKrakenOrderIds.add(String(krakenMatch.order));

      const existingMetadata = trade.metadata || {};
      const updatedMetadata = {
        ...existingMetadata,
        exchange: 'kraken',
        kraken_trade_id: ids.tradeId || krakenMatch.id || null,
        kraken_order_id: ids.orderId || krakenMatch.order || null,
        verified_at: new Date().toISOString(),
      };

      if (JSON.stringify(existingMetadata) !== JSON.stringify(updatedMetadata)) {
        await updateTrade(Number(trade.id), { metadata: updatedMetadata });
      }
    } else {
      phantomTrades.push(trade);
    }
  }

  let deleted = 0;
  let flagged = 0;

  for (const trade of phantomTrades) {
    if (phantomMode === 'delete') {
      await deleteTrade(Number(trade.id));
      deleted++;
    } else {
      const existingMetadata = trade.metadata || {};
      await updateTrade(Number(trade.id), {
        status: 'phantom',
        column_name: 'Phantom',
        metadata: { ...existingMetadata, phantom: true, phantom_at: new Date().toISOString() },
      });
      flagged++;
    }
  }

  let created = 0;
  if (createMissing) {
    for (const krakenTrade of krakenTrades) {
      const tradeId = krakenTrade?.id ? String(krakenTrade.id) : null;
      const orderId = krakenTrade?.order ? String(krakenTrade.order) : null;
      if (tradeId && matchedKrakenTradeIds.has(tradeId)) continue;
      if (orderId && matchedKrakenOrderIds.has(orderId)) continue;

      const pair = krakenTrade?.symbol ? normalizePair(krakenTrade.symbol) : 'UNKNOWN';
      const price = Number(krakenTrade?.price ?? 0);
      const amount = Number(krakenTrade?.amount ?? 0);
      const positionSize = price && amount ? price * amount : null;
      const direction = String(krakenTrade?.side || 'buy').toLowerCase() === 'sell' ? 'SHORT' : 'LONG';

      await createTrade(boardId, user?.id || Number(body?.userId) || 1, {
        coin_pair: pair,
        direction,
        entry_price: price || null,
        current_price: price || null,
        position_size: positionSize,
        status: 'closed',
        column_name: 'Closed',
        metadata: {
          exchange: 'kraken',
          kraken_trade_id: tradeId,
          kraken_order_id: orderId,
          created_by_sync: true,
        },
      });
      created++;
    }
  }

  const stats = await getBoardTradingStats(boardId);

  return NextResponse.json({
    ok: true,
    boardId,
    krakenTrades: krakenTrades.length,
    boardTrades: boardTrades.length,
    krakenBoardTrades: krakenBoardTrades.length,
    matched: matchedTradeIds.size,
    phantom: phantomTrades.length,
    deleted,
    flagged,
    untracked: untrackedTrades.length,
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
