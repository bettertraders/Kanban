import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getPaperAccount, getPortfolioStats, pool } from '@/lib/database';

// GET /api/trading/account?boardId=X — get paper balance and stats
// IMPORTANT: GET should NEVER auto-create an account. Use POST to create.
// The check=1 param is now the default behavior (read-only).
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const boardId = Number(request.nextUrl.searchParams.get('boardId'));
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    }

    // Always just look up without auto-creating (read-only operation)
    // Account creation only happens via POST when user clicks "Start Trading"
    const result = await pool.query(
      `SELECT * FROM paper_accounts WHERE board_id = $1 AND user_id = $2`,
      [boardId, user.id]
    );
    const account = result.rows[0] || null;
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

    // Update balance — only reset created_at if explicitly provided
    const startDate = body.created_at || body.start_date;
    if (startDate) {
      await pool.query(
        `UPDATE paper_accounts SET starting_balance = $1, current_balance = $1, created_at = $3, updated_at = NOW() WHERE board_id = $2 AND user_id = $4`,
        [balance, boardId, new Date(startDate), user.id]
      );
    } else {
      await pool.query(
        `UPDATE paper_accounts SET starting_balance = $1, current_balance = $1, updated_at = NOW() WHERE board_id = $2 AND user_id = $3`,
        [balance, boardId, user.id]
      );
    }

    const result = await pool.query(
      `SELECT * FROM paper_accounts WHERE board_id = $1 AND user_id = $2`,
      [boardId, user.id]
    );

    if (result.rows.length === 0) {
      // Create one if doesn't exist for this user
      const ins = await pool.query(
        `INSERT INTO paper_accounts (board_id, user_id, starting_balance, current_balance) VALUES ($1, $2, $3, $3) RETURNING *`,
        [boardId, user.id, balance]
      );
      return NextResponse.json({ account: ins.rows[0] });
    }

    // Also reset timeframeStartDate in trading_settings so day counter resets
    try {
      const existing = await pool.query(
        `SELECT settings FROM trading_settings WHERE user_id = $1 AND board_id = $2`,
        [user.id, boardId]
      );
      if (existing.rows.length > 0) {
        const settings = existing.rows[0].settings || {};
        settings.timeframeStartDate = new Date().toISOString();
        await pool.query(
          `UPDATE trading_settings SET settings = $1, updated_at = NOW() WHERE user_id = $2 AND board_id = $3`,
          [JSON.stringify(settings), user.id, boardId]
        );
      }
    } catch {}

    return NextResponse.json({ account: result.rows[0] });
  } catch (error) {
    console.error('PATCH /api/trading/account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/trading/account?boardId=X — delete paper account (used by reset)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const boardId = Number(request.nextUrl.searchParams.get('boardId'));
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    }

    await pool.query(
      `DELETE FROM paper_accounts WHERE board_id = $1 AND user_id = $2`,
      [boardId, user.id]
    );

    // Also clear timeframeStartDate from trading_settings
    try {
      const existing = await pool.query(
        `SELECT settings FROM trading_settings WHERE user_id = $1 AND board_id = $2`,
        [user.id, boardId]
      );
      if (existing.rows.length > 0) {
        const settings = existing.rows[0].settings || {};
        delete settings.timeframeStartDate;
        await pool.query(
          `UPDATE trading_settings SET settings = $1, updated_at = NOW() WHERE user_id = $2 AND board_id = $3`,
          [JSON.stringify(settings), user.id, boardId]
        );
      }
    } catch {}

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('DELETE /api/trading/account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/trading/account — create paper account with initial balance
// This is called when user clicks "Start Trading" — it MUST set the balance
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

    // Use UPSERT that ALWAYS updates the balance when called
    // This is different from getPaperAccount which uses DO NOTHING
    // because POST is explicitly setting the user's chosen amount
    await pool.query(
      `INSERT INTO paper_accounts (board_id, user_id, starting_balance, current_balance)
       VALUES ($1, $2, $3, $3)
       ON CONFLICT (board_id, user_id) DO UPDATE SET 
         starting_balance = $3,
         current_balance = $3,
         created_at = NOW(),
         updated_at = NOW()`,
      [boardId, user.id, initialBalance]
    );

    const result = await pool.query(
      `SELECT * FROM paper_accounts WHERE board_id = $1 AND user_id = $2`,
      [boardId, user.id]
    );

    return NextResponse.json({ account: result.rows[0] });
  } catch (error) {
    console.error('POST /api/trading/account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
