import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { createBoard, getBoardsForUser, getPaperAccount, isTeamMember } from '@/lib/database';

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
    
    const { name, description, teamId, board_type, visibility, starting_balance } = await request.json();
    
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    
    if (board_type !== undefined && !['task', 'trading'].includes(String(board_type))) {
      return NextResponse.json({ error: 'Invalid board_type' }, { status: 400 });
    }
    if (description !== undefined && description !== null && typeof description !== 'string') {
      return NextResponse.json({ error: 'Invalid description' }, { status: 400 });
    }
    if (visibility !== undefined && !['all', 'admin_only'].includes(String(visibility))) {
      return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 });
    }

    // If teamId provided, verify user is a member
    if (teamId) {
      if (!Number.isFinite(Number(teamId))) {
        return NextResponse.json({ error: 'Invalid teamId' }, { status: 400 });
      }
      const membership = await isTeamMember(Number(teamId), user.id);
      if (!membership) {
        return NextResponse.json({ error: 'Not a member of this team' }, { status: 403 });
      }
      if (board_type === 'trading' && membership.role !== 'admin') {
        return NextResponse.json({ error: 'Only team admins can create trading boards' }, { status: 403 });
      }
    }
    
    const startingBalance = starting_balance !== undefined && starting_balance !== null
      ? Number(starting_balance)
      : undefined;
    if (startingBalance !== undefined && !Number.isFinite(startingBalance)) {
      return NextResponse.json({ error: 'Invalid starting_balance' }, { status: 400 });
    }

    const board = await createBoard(
      name.trim(),
      user.id,
      teamId ? Number(teamId) : undefined,
      typeof description === 'string' ? description : undefined,
      {
        boardType: board_type === 'trading' ? 'trading' : 'task',
        visibility: visibility ? String(visibility) : undefined,
        startingBalance
      }
    );
    return NextResponse.json({ board }, { status: 201 });
  } catch (error) {
    console.error('Error creating board:', error);
    return NextResponse.json({ error: 'Failed to create board' }, { status: 500 });
  }
}
