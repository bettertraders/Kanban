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

    // Store signal
    const result = await pool.query(
      `INSERT INTO tbo_signals (ticker, exchange, interval, signal, price, volume, signal_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [ticker, exchange, interval, signal, priceNum, volumeNum, signalTime]
    );

    const signalId = result.rows[0].id;
    console.log(`[TBO] ${signal} ${ticker} @ ${price} (${interval}) — id: ${signalId}`);

    return NextResponse.json({ received: true, signalId });
  } catch (error) {
    console.error('[TBO] Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
