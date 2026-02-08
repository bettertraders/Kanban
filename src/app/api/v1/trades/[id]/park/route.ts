import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { parkTrade } from '@/lib/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    if (!body.pause_reason) {
      return NextResponse.json({ error: 'pause_reason required' }, { status: 400 });
    }

    const trade = await parkTrade(parseInt(id), body.pause_reason, user.id);
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    return NextResponse.json({ trade });
  } catch (e) {
    if (e instanceof Error && e.message === 'PAUSE_REASON_REQUIRED') {
      return NextResponse.json({ error: 'pause_reason required' }, { status: 400 });
    }
    console.error('POST /trades/[id]/park error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
