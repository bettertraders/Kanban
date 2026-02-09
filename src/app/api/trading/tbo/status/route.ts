import { NextResponse } from 'next/server';
import { pool } from '@/lib/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [configRes, countRes, lastRes, timeframesRes] = await Promise.all([
      pool.query(`SELECT value FROM tbo_config WHERE key = 'enabled'`),
      pool.query(`SELECT COUNT(*) as count FROM tbo_signals WHERE received_at >= CURRENT_DATE`),
      pool.query(`SELECT received_at, ticker, signal, interval FROM tbo_signals ORDER BY received_at DESC LIMIT 1`),
      pool.query(`SELECT DISTINCT interval FROM tbo_signals WHERE received_at >= NOW() - INTERVAL '24 hours' ORDER BY interval`),
    ]);

    const enabled = configRes.rows[0]?.value === 'true';
    const signalsToday = parseInt(countRes.rows[0]?.count || '0');
    const lastSignal = lastRes.rows[0] || null;
    const activeTimeframes = timeframesRes.rows.map((r: any) => r.interval);

    return NextResponse.json({
      enabled,
      signalsToday,
      lastSignal: lastSignal ? {
        time: lastSignal.received_at,
        ticker: lastSignal.ticker,
        signal: lastSignal.signal,
        interval: lastSignal.interval,
      } : null,
      activeTimeframes,
    });
  } catch (err: any) {
    console.error('[TBO Status] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
