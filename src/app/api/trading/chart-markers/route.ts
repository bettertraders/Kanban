import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { pool } from '@/lib/database';

// GET /api/trading/chart-markers?symbol=BTCUSDT&boardId=X
// Returns buy/sell markers from paper trades for chart overlay
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const symbol = request.nextUrl.searchParams.get('symbol');
    const boardId = request.nextUrl.searchParams.get('boardId');

    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    const normalized = symbol.replace(/-/g, '/').replace(/USDT$/, '/USDT').replace(/\/\//, '/').toUpperCase();
    const pair = normalized.includes('/') ? normalized : `${normalized}/USDT`;

    let query = `
      SELECT
        id,
        coin_pair,
        direction,
        entry_price,
        exit_price,
        entered_at,
        exited_at,
        pnl_dollar,
        pnl_percent,
        status,
        column_name,
        notes
      FROM trades
      WHERE coin_pair = $1
    `;
    const params: unknown[] = [pair];

    if (boardId) {
      query += ` AND board_id = $${params.length + 1}`;
      params.push(Number(boardId));
    }

    query += ' ORDER BY entered_at ASC';
    const result = await pool.query(query, params);

    const markers: Array<{
      time: string;
      type: 'buy' | 'sell';
      price: number;
      strategy: string;
      pnl: number | null;
    }> = [];

    for (const row of result.rows) {
      // Entry marker
      if (row.entered_at && row.entry_price) {
        markers.push({
          time: row.entered_at,
          type: row.direction === 'short' ? 'sell' : 'buy',
          price: Number(row.entry_price),
          strategy: row.notes || '',
          pnl: null,
        });
      }
      // Exit marker
      if (row.exited_at && row.exit_price) {
        markers.push({
          time: row.exited_at,
          type: row.direction === 'short' ? 'buy' : 'sell',
          price: Number(row.exit_price),
          strategy: row.notes || '',
          pnl: row.pnl_dollar ? Number(row.pnl_dollar) : null,
        });
      }
    }

    return NextResponse.json({ symbol: pair, markers });
  } catch (error) {
    console.error('GET /api/trading/chart-markers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
