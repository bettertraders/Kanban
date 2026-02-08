import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { exitTrade } from '@/lib/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    if (body.exit_price === undefined || body.exit_price === null) {
      return NextResponse.json({ error: 'exit_price required' }, { status: 400 });
    }

    const trade = await exitTrade(parseInt(id), body.exit_price, body.lesson_tag ?? null, user.id);
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    return NextResponse.json({ trade });
  } catch (e) {
    if (e instanceof Error && e.message === 'ENTRY_PRICE_REQUIRED') {
      return NextResponse.json({ error: 'entry_price required' }, { status: 400 });
    }
    if (e instanceof Error && e.message === 'EXIT_PRICE_REQUIRED') {
      return NextResponse.json({ error: 'exit_price required' }, { status: 400 });
    }
    console.error('POST /trades/[id]/exit error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
