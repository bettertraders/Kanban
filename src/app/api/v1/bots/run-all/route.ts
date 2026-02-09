import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { isAdminUser } from '@/lib/database';
import { runAllActiveBots } from '@/lib/bot-engine';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = await isAdminUser(user.id);
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const results = await runAllActiveBots();
    return NextResponse.json({ results });
  } catch (error) {
    console.error('POST /bots/run-all error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
