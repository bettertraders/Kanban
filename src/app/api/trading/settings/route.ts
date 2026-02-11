import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getTradingSettings, saveTradingSettings, pool } from '@/lib/database';

async function findTradingBoardId(userId: number, requestedBoardId?: number): Promise<number | null> {
  if (requestedBoardId) return requestedBoardId;
  // Find first trading board the user has access to
  const result = await pool.query(
    `SELECT b.id FROM boards b
     LEFT JOIN team_members tm ON b.team_id = tm.team_id AND tm.user_id = $1
     WHERE (b.owner_id = $1 OR tm.user_id = $1) AND b.board_type = 'trading'
     ORDER BY b.id LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.id || null;
}

// GET /api/trading/settings?boardId=X (boardId optional — defaults to first trading board)
export async function GET(request: NextRequest) {
  try {
    let user = await getAuthenticatedUser(request).catch(() => null);
    
    // Fallback: if getAuthenticatedUser failed but API key is present, try direct lookup
    if (!user) {
      const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
      if (apiKey?.startsWith('kb_')) {
        const { getUserByApiKey } = await import('@/lib/database');
        const dbUser = await getUserByApiKey(apiKey);
        if (dbUser) user = { id: dbUser.id, email: dbUser.email, name: dbUser.name };
      }
    }
    
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const requestedId = Number(new URL(request.url).searchParams.get('boardId') || 0) || undefined;
    const boardId = await findTradingBoardId(user.id, requestedId);
    if (!boardId) return NextResponse.json({ settings: {} });

    const settings = await getTradingSettings(user.id, boardId);
    return NextResponse.json({ settings: settings || {} });
  } catch (error: any) {
    console.error('GET /api/trading/settings error:', error?.message, error?.stack);
    return NextResponse.json({ error: 'Internal server error', detail: error?.message }, { status: 500 });
  }
}

// POST/PUT /api/trading/settings — save settings
async function saveHandler(request: NextRequest) {
  try {
    let user = await getAuthenticatedUser(request).catch(() => null);
    
    if (!user) {
      const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
      if (apiKey?.startsWith('kb_')) {
        const { getUserByApiKey } = await import('@/lib/database');
        const dbUser = await getUserByApiKey(apiKey);
        if (dbUser) user = { id: dbUser.id, email: dbUser.email, name: dbUser.name };
      }
    }
    
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const requestedId = Number(body?.boardId || 0) || undefined;
    const boardId = await findTradingBoardId(user.id, requestedId);
    if (!boardId) return NextResponse.json({ error: 'No trading board found' }, { status: 404 });

    const settings = body?.settings || {};
    const saved = await saveTradingSettings(user.id, boardId, settings);
    return NextResponse.json({ settings: saved });
  } catch (error) {
    console.error('PUT /api/trading/settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const PUT = saveHandler;
export const POST = saveHandler;
