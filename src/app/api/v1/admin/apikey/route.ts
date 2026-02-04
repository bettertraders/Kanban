import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { generateApiKey } from '@/lib/database';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway.internal') ? false : { rejectUnauthorized: false }
});

// POST /api/v1/admin/apikey - Generate an API key for any user (admin only)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin of any team
    const adminCheck = await pool.query(
      "SELECT 1 FROM team_members WHERE user_id = $1 AND role = 'admin' LIMIT 1",
      [user.id]
    );
    if (adminCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { userId, name } = await request.json();

    if (!userId || !name) {
      return NextResponse.json({ error: 'userId and name are required' }, { status: 400 });
    }

    // Verify target user exists
    const userCheck = await pool.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const apiKey = await generateApiKey(userId, name);

    return NextResponse.json({
      apiKey,
      userId,
      email: userCheck.rows[0].email,
      warning: 'Save this key now! It will not be shown again.'
    }, { status: 201 });
  } catch (error) {
    console.error('Error generating admin API key:', error);
    return NextResponse.json({ error: 'Failed to generate API key' }, { status: 500 });
  }
}
