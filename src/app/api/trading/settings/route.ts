import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { pool } from '@/lib/database';

// Ensure table exists
const ensureTable = pool.query(`
  CREATE TABLE IF NOT EXISTS trading_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    settings JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT NOW()
  )
`).catch(() => {});

// GET /api/trading/settings — load user's trading dashboard settings
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureTable;
    const result = await pool.query(
      'SELECT settings FROM trading_settings WHERE user_id = $1',
      [user.id]
    );

    return NextResponse.json({ settings: result.rows[0]?.settings || {} });
  } catch (error) {
    console.error('GET /api/trading/settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/trading/settings — save user's trading dashboard settings
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const settings = body.settings || body;

    await ensureTable;
    await pool.query(
      `INSERT INTO trading_settings (user_id, settings, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET settings = $2, updated_at = NOW()`,
      [user.id, JSON.stringify(settings)]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/trading/settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
