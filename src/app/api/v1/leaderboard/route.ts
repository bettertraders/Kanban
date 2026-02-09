import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getLeaderboard } from '@/lib/database';

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
