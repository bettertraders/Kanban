import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway.internal') ? false : { rejectUnauthorized: false }
});

// GET /api/v1/users - List all users (admin only)
export async function GET(request: NextRequest) {
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

    const result = await pool.query(
      'SELECT id, email, name, avatar_url, created_at FROM users ORDER BY id'
    );
    return NextResponse.json({ users: result.rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
