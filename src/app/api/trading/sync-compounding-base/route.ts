import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/database';

// POST /api/trading/sync-compounding-base
// Syncs the compounding base from local harvest state to Railway database
// Body: { boardId: number, compoundingBase: number }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { boardId, compoundingBase } = body;

    if (!boardId || typeof compoundingBase !== 'number') {
      return NextResponse.json(
        { error: 'boardId and compoundingBase required' },
        { status: 400 }
      );
    }

    // Update paper_accounts starting_balance to compounding base
    await pool.query(
      `UPDATE paper_accounts 
       SET starting_balance = $1, current_balance = $1, updated_at = NOW()
       WHERE board_id = $2`,
      [compoundingBase, boardId]
    );

    // Also store in harvest_state for reference
    await pool.query(
      `UPDATE harvest_state 
       SET cycle_number = GREATEST(cycle_number, 1),
           updated_at = NOW()
       WHERE id = 1`
    );

    return NextResponse.json({
      success: true,
      boardId,
      compoundingBase,
      message: 'Compounding base synced to database'
    });
  } catch (error) {
    console.error('Sync compounding base error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/trading/sync-compounding-base
// Returns current values for debugging
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const boardId = searchParams.get('boardId') || '15';

    const [paperRes, harvestRes] = await Promise.all([
      pool.query(
        'SELECT starting_balance, current_balance FROM paper_accounts WHERE board_id = $1',
        [boardId]
      ),
      pool.query('SELECT cycle_number, cycle_active FROM harvest_state WHERE id = 1')
    ]);

    return NextResponse.json({
      boardId,
      paperAccount: paperRes.rows[0] || null,
      harvestState: harvestRes.rows[0] || null,
    });
  } catch (error) {
    console.error('Get compounding base error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
