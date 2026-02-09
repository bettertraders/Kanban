import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBot, getLatestPortfolioSnapshot, getPortfolioSnapshots, isAdminUser } from '@/lib/database';

async function canAccessBot(userId: number, bot: any): Promise<boolean> {
  if (!bot) return false;
  if (bot.user_id === userId) return true;
  return isAdminUser(userId);
}

function toPieData(allocations: any): Array<{ label: string; value: number }> {
  if (!allocations) return [];
  if (Array.isArray(allocations)) {
    return allocations
      .map((item) => ({
        label: String(item?.label ?? item?.coin ?? item?.category ?? ''),
        value: Number(item?.value ?? item?.amount ?? 0)
      }))
      .filter((item) => item.label && Number.isFinite(item.value));
  }
  if (typeof allocations === 'object') {
    return Object.entries(allocations)
      .map(([label, value]) => ({ label, value: Number(value) }))
      .filter((item) => item.label && Number.isFinite(item.value));
  }
  return [];
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

    const current = await getLatestPortfolioSnapshot(botId);
    const history = await getPortfolioSnapshots(botId, 50);

    const pie = toPieData(current?.allocations);

    return NextResponse.json({
      current: current
        ? {
            ...current,
            pie
          }
        : null,
      history
    });
  } catch (error) {
    console.error('GET /bots/[id]/portfolio error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
