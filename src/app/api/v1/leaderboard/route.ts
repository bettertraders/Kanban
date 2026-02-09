import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getLeaderboard, updateLeaderboard, getBot, isAdminUser } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const period = request.nextUrl.searchParams.get('period') || undefined;
    const leaderboard = await getLeaderboard(period);

    return NextResponse.json({ leaderboard });
  } catch (error) {
    console.error('GET /leaderboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/v1/leaderboard — update leaderboard stats for a bot
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { bot_id, period, total_return, win_rate, total_trades, sharpe_ratio, max_drawdown } = body;

    if (!bot_id || !period) {
      return NextResponse.json({ error: 'bot_id and period required' }, { status: 400 });
    }

    const bot = await getBot(Number(bot_id));
    if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 });

    // Only bot owner or admin can update
    if (bot.user_id !== user.id) {
      const admin = await isAdminUser(user.id);
      if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const entry = await updateLeaderboard(Number(bot_id), period, {
      total_return: Number(total_return) || 0,
      win_rate: Number(win_rate) || 0,
      total_trades: Number(total_trades) || 0,
      sharpe_ratio: sharpe_ratio != null ? Number(sharpe_ratio) : undefined,
      max_drawdown: max_drawdown != null ? Number(max_drawdown) : undefined,
    });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('POST /leaderboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
