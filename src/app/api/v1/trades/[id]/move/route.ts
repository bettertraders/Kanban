import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { moveTrade } from '@/lib/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { column, actorType, actorName } = await request.json();
    if (!column) return NextResponse.json({ error: 'column required' }, { status: 400 });

    const trade = await moveTrade(
      parseInt(id), column,
      actorType || 'user', actorName || user.name || 'Unknown'
    );
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    return NextResponse.json({ trade });
  } catch (e) {
    console.error('POST /trades/[id]/move error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
