import { NextRequest, NextResponse } from 'next/server';
import { findOrCreateUser, generateApiKey, createTeam, addTeamMember } from '@/lib/database';

// POST /api/setup/bootstrap - Bootstrap admin user + team with setup key
// This is a one-time setup endpoint for when the DB is fresh
export async function POST(request: NextRequest) {
  try {
    const { setupKey, email, name, teamName } = await request.json();

    if (setupKey !== process.env.SETUP_KEY) {
      return NextResponse.json({ error: 'Invalid setup key' }, { status: 401 });
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Create or find the user
    const user = await findOrCreateUser(email, name);

    // Generate API key
    const apiKey = await generateApiKey(user.id, `${name || email}-bootstrap`);

    // If teamName provided, create team and add user as admin
    let team = null;
    if (teamName) {
      const slug = teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      team = await createTeam(teamName, slug, user.id, `${teamName} team`);
    }

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      apiKey,
      team: team ? { id: team.id, name: team.name } : null,
      warning: 'Save the API key now! It will not be shown again.'
    }, { status: 201 });
  } catch (error) {
    console.error('Bootstrap error:', error);
    return NextResponse.json({ error: 'Bootstrap failed' }, { status: 500 });
  }
}
