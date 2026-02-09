import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getVisibleUsers } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const users = await getVisibleUsers(user.id);
    return NextResponse.json({ users });
  } catch (error) {
    console.error('GET /users/visible error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
