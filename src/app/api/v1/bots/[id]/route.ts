import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import {
  deleteBot,
  getBot,
  getBotExecutions,
  getLatestPortfolioSnapshot,
  isAdminUser,
  updateBot
} from '@/lib/database';

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

    const executions = await getBotExecutions(botId, 20);
    const currentPortfolio = await getLatestPortfolioSnapshot(botId);

    return NextResponse.json({ bot, executions, currentPortfolio });
  } catch (error) {
    console.error('GET /bots/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
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
    const updates: Record<string, unknown> = {};

    if (body?.name !== undefined) updates.name = body.name;
    if (body?.strategy_config !== undefined) updates.strategy_config = body.strategy_config;
    if (body?.status !== undefined) updates.status = body.status;
    if (body?.auto_trade !== undefined) updates.auto_trade = Boolean(body.auto_trade);
    if (body?.tbo_enabled !== undefined) updates.tbo_enabled = Boolean(body.tbo_enabled);
    if (body?.rebalancer_enabled !== undefined) updates.rebalancer_enabled = Boolean(body.rebalancer_enabled);
    if (body?.rebalancer_config !== undefined) updates.rebalancer_config = body.rebalancer_config;
    if (body?.performance !== undefined) updates.performance = body.performance;
    if (body?.metadata !== undefined) updates.metadata = body.metadata;

    const updated = await updateBot(botId, updates);
    if (!updated) return NextResponse.json({ error: 'No valid updates' }, { status: 400 });

    return NextResponse.json({ bot: updated });
  } catch (error) {
    console.error('PATCH /bots/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
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

    await deleteBot(botId);
    return NextResponse.json({ success: true, deleted: botId });
  } catch (error) {
    console.error('DELETE /bots/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
