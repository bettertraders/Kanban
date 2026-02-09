import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBot, isAdminUser, logBotExecution, updateBot } from '@/lib/database';

async function canAccessBot(userId: number, bot: any): Promise<boolean> {
  if (!bot) return false;
  if (bot.user_id === userId) return true;
  return isAdminUser(userId);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const botId = Number(id);
    if (!Number.isFinite(botId)) return NextResponse.json({ error: 'Invalid bot id' }, { status: 400 });

    const bot = await getBot(botId);
    if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 });

    const allowed = await canAccessBot(user.id, bot);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const enabled = body?.enabled !== undefined
      ? Boolean(body.enabled)
      : body?.auto_trade !== undefined
        ? Boolean(body.auto_trade)
        : !Boolean(bot.auto_trade);

    const updated = await updateBot(botId, { auto_trade: enabled });
    if (!updated) return NextResponse.json({ error: 'No update applied' }, { status: 400 });

    await logBotExecution(botId, 'auto_trade', { enabled, actor: user.id });
    return NextResponse.json({ bot: updated });
  } catch (error) {
    console.error('POST /bots/[id]/auto-trade error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
