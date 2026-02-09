import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const enabled = body.enabled === true;

    await pool.query(
      `INSERT INTO tbo_config (key, value, updated_at) VALUES ('enabled', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [enabled ? 'true' : 'false']
    );

    console.log(`[TBO] Toggle: ${enabled ? 'ON' : 'OFF'}`);
    return NextResponse.json({ enabled });
  } catch (err: any) {
    console.error('[TBO Toggle] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
