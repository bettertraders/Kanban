import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { cancelInvite, getBoard, getPendingInvites, isTeamMember, pool } from '@/lib/database';

// GET /api/v1/invites/board/:id - List pending invites
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const boardId = Number(id);
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'Invalid board id' }, { status: 400 });
    }

    const board = await getBoard(boardId, user.id);
    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    const invites = await getPendingInvites(boardId);
    return NextResponse.json({ invites });
  } catch (error) {
    console.error('Error fetching pending invites:', error);
    return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 });
  }
}

// DELETE /api/v1/invites/board/:id - Cancel invite
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const boardId = Number(id);
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'Invalid board id' }, { status: 400 });
    }

    const board = await getBoard(boardId, user.id);
    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    if (board.is_personal) {
      if (board.owner_id !== user.id) {
        return NextResponse.json({ error: 'Only the board owner can cancel invites' }, { status: 403 });
      }
      return NextResponse.json({ error: 'Personal boards do not support invites' }, { status: 400 });
    }

    if (!board.team_id) {
      return NextResponse.json({ error: 'Board is not associated with a team' }, { status: 400 });
    }

    const membership = await isTeamMember(board.team_id, user.id);
    if (!membership || !['admin', 'owner'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only board admins can cancel invites' }, { status: 403 });
    }

    const { invite_id } = await request.json();
    const inviteId = Number(invite_id);
    if (!Number.isFinite(inviteId)) {
      return NextResponse.json({ error: 'Invalid invite_id' }, { status: 400 });
    }

    const existing = await pool.query(
      'SELECT id FROM board_invites WHERE id = $1 AND board_id = $2',
      [inviteId, boardId]
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    await cancelInvite(inviteId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error cancelling invite:', error);
    return NextResponse.json({ error: 'Failed to cancel invite' }, { status: 500 });
  }
}
