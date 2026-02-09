import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBot, isAdminUser, logBotExecution, updateBot } from '@/lib/database';

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

    return NextResponse.json({
      rebalancer_enabled: Boolean(bot.rebalancer_enabled),
      rebalancer_config: bot.rebalancer_config ?? {}
    });
  } catch (error) {
    console.error('GET /bots/[id]/rebalancer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
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

    const body = await request.json();
    const nextConfig = { ...(bot.rebalancer_config ?? {}) } as Record<string, unknown>;

    if (body?.riskLevel !== undefined) {
      const level = Number(body.riskLevel);
      if (!Number.isFinite(level) || level < 1 || level > 10) {
        return NextResponse.json({ error: 'riskLevel must be between 1 and 10' }, { status: 400 });
      }
      nextConfig.riskLevel = level;
    }

    if (body?.rebalanceThreshold !== undefined) {
      const threshold = Number(body.rebalanceThreshold);
      if (!Number.isFinite(threshold) || threshold <= 0) {
        return NextResponse.json({ error: 'rebalanceThreshold must be a positive number' }, { status: 400 });
      }
      nextConfig.rebalanceThreshold = threshold;
    }

    if (body?.rebalanceInterval !== undefined) {
      const interval = String(body.rebalanceInterval);
      if (!interval) return NextResponse.json({ error: 'rebalanceInterval must be a string' }, { status: 400 });
      nextConfig.rebalanceInterval = interval;
    }

    if (body?.watchlistSize !== undefined) {
      const size = Number(body.watchlistSize);
      if (!Number.isFinite(size) || size <= 0) {
        return NextResponse.json({ error: 'watchlistSize must be a positive number' }, { status: 400 });
      }
      nextConfig.watchlistSize = Math.round(size);
    }

    const updates: Record<string, unknown> = { rebalancer_config: nextConfig };
    if (body?.enabled !== undefined) updates.rebalancer_enabled = Boolean(body.enabled);
    if (body?.rebalancer_enabled !== undefined) updates.rebalancer_enabled = Boolean(body.rebalancer_enabled);

    const updated = await updateBot(botId, updates);
    if (!updated) return NextResponse.json({ error: 'No update applied' }, { status: 400 });

    await logBotExecution(botId, 'rebalancer_config', { actor: user.id, updates });
    return NextResponse.json({ bot: updated });
  } catch (error) {
    console.error('POST /bots/[id]/rebalancer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
