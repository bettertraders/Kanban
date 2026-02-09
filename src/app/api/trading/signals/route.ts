import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/database';

// GET /api/trading/signals - List recent TBO signals
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const ticker = searchParams.get('ticker');
    const signal = searchParams.get('signal');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (ticker) {
      conditions.push(`ticker = $${paramIndex++}`);
      values.push(ticker.toUpperCase());
    }
    if (signal) {
      conditions.push(`signal = $${paramIndex++}`);
      values.push(signal.toUpperCase());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(limit);

    const result = await pool.query(
      `SELECT * FROM tbo_signals ${whereClause} ORDER BY received_at DESC LIMIT $${paramIndex}`,
      values
    );

    return NextResponse.json({ signals: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('[Signals] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
