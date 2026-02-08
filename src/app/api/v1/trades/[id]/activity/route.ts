import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getTradeActivity } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const activity = await getTradeActivity(parseInt(id));
    return NextResponse.json({ activity });
  } catch (e) {
    console.error('GET /trades/[id]/activity error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
