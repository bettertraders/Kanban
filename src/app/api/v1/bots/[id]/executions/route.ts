import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBot, getBotExecutions, isAdminUser } from '@/lib/database';

async function canAccessBot(userId: number, bot: any): Promise<boolean> {
  if (!bot) return false;
  if (bot.user_id === userId) return true;
  return isAdminUser(userId);
}

export async function GET(
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

    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;
    const executions = await getBotExecutions(botId, Number.isFinite(limit as number) ? Number(limit) : 50);

    return NextResponse.json({ executions });
  } catch (error) {
    console.error('GET /bots/[id]/executions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
