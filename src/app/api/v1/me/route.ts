import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoardsForUser, getTeamsForUser } from '@/lib/database';

// GET /api/v1/me - Who am I? (useful for bots to confirm auth works)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const boards = await getBoardsForUser(user.id);
    const teams = await getTeamsForUser(user.id);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      boards: boards.map(b => ({ id: b.id, name: b.name, is_personal: b.is_personal, team_id: b.team_id, team_name: b.team_name })),
      teams: teams.map(t => ({ id: t.id, name: t.name, slug: t.slug, role: t.user_role })),
    });
  } catch (error) {
    console.error('Error fetching user info:', error);
    return NextResponse.json({ error: 'Failed to fetch user info' }, { status: 500 });
  }
}
