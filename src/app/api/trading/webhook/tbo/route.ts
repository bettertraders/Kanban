import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/database';

const VALID_SIGNALS = [
  'TREND_LONG', 'TREND_SHORT',
  'BUY', 'SELL',
  'CLOSE_LONG', 'CLOSE_SHORT',
];

// POST /api/trading/webhook/tbo - Receive TBO PRO signals
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Auth: validate secret
    const expectedSecret = process.env.TBO_WEBHOOK_SECRET || 'tbt_tbo_webhook_2026';
    if (!body.secret || body.secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate required fields
    const { ticker, exchange, interval, signal, price, time } = body;
    if (!ticker || !exchange || !interval || !signal || !price || !time) {
      return NextResponse.json(
        { error: 'Missing required fields: ticker, exchange, interval, signal, price, time' },
        { status: 400 }
      );
    }

    // Validate signal type
    if (!VALID_SIGNALS.includes(signal)) {
      return NextResponse.json(
        { error: `Invalid signal type. Must be one of: ${VALID_SIGNALS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate price is numeric
    const priceNum = parseFloat(price);
    if (isNaN(priceNum)) {
      return NextResponse.json({ error: 'Invalid price format' }, { status: 400 });
    }

    const volumeNum = body.volume ? parseFloat(body.volume) : null;
    const signalTime = new Date(time);
    if (isNaN(signalTime.getTime())) {
      return NextResponse.json({ error: 'Invalid time format' }, { status: 400 });
    }

    // Check if TBO is enabled
    const configRes = await pool.query(
      `SELECT value FROM tbo_config WHERE key = 'enabled'`
    );
    const tboEnabled = configRes.rows[0]?.value === 'true';

    // Store signal (always store, but mark processed based on enabled state)
    const result = await pool.query(
      `INSERT INTO tbo_signals (ticker, exchange, interval, signal, price, volume, signal_time, processed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [ticker, exchange, interval, signal, priceNum, volumeNum, signalTime, false]
    );

    const signalId = result.rows[0].id;
    const activeLabel = tboEnabled ? 'ACTIVE' : 'INACTIVE';
    console.log(`[TBO] [${activeLabel}] ${signal} ${ticker} @ ${price} (${interval}) — id: ${signalId}`);

    return NextResponse.json({ received: true, signalId, active: tboEnabled });
  } catch (error) {
    console.error('[TBO] Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
