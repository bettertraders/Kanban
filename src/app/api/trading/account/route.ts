import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getPaperAccount, getPortfolioStats, pool } from '@/lib/database';

// GET /api/trading/account?boardId=X — get paper balance and stats
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const boardId = Number(request.nextUrl.searchParams.get('boardId'));
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    }

    // One-time fix: reset any board-15 accounts still at 10000 default
    await pool.query(`UPDATE paper_accounts SET starting_balance = 1000, current_balance = 1000 WHERE board_id = 15 AND starting_balance = 10000`).catch(() => {});

    const account = await getPaperAccount(boardId, user.id);
    const stats = await getPortfolioStats(user.id);

    return NextResponse.json({ account, stats });
  } catch (error) {
    console.error('GET /api/trading/account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/trading/account — reset/update paper account balance
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const boardId = Number(body.boardId || body.board_id);
    const balance = Number(body.balance || body.starting_balance || body.current_balance);

    if (!Number.isFinite(boardId) || !Number.isFinite(balance)) {
      return NextResponse.json({ error: 'boardId and balance required' }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE paper_accounts SET starting_balance = $1, current_balance = $1, created_at = NOW(), updated_at = NOW() WHERE board_id = $2 AND user_id = $3 RETURNING *`,
      [balance, boardId, user.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ account: result.rows[0] });
  } catch (error) {
    console.error('PATCH /api/trading/account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/trading/account — create paper account with initial balance
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const boardId = Number(body.boardId);
    const initialBalance = Number(body.initialBalance) || 1000;

    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    }

    const account = await getPaperAccount(boardId, user.id, initialBalance);
    return NextResponse.json({ account });
  } catch (error) {
    console.error('POST /api/trading/account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
