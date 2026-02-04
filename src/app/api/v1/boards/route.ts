import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoardsForUser, createBoard, isTeamMember } from '@/lib/database';

// GET /api/v1/boards - List all boards for user
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const boards = await getBoardsForUser(user.id);
    return NextResponse.json({ boards });
  } catch (error) {
    console.error('Error fetching boards:', error);
    return NextResponse.json({ error: 'Failed to fetch boards' }, { status: 500 });
  }
}

// POST /api/v1/boards - Create a new board
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { name, description, teamId } = await request.json();
    
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    
    // If teamId provided, verify user is a member
    if (teamId) {
      const membership = await isTeamMember(teamId, user.id);
      if (!membership) {
        return NextResponse.json({ error: 'Not a member of this team' }, { status: 403 });
      }
    }
    
    const board = await createBoard(name, user.id, teamId, description);
    return NextResponse.json({ board }, { status: 201 });
  } catch (error) {
    console.error('Error creating board:', error);
    return NextResponse.json({ error: 'Failed to create board' }, { status: 500 });
  }
}
