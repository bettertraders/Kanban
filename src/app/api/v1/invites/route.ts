import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { createInvite, getBoard, isTeamMember } from '@/lib/database';
import { sendBoardInviteEmail } from '@/lib/email';
import crypto from 'crypto';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/v1/invites - Create invite and send email
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { board_id, email } = await request.json();

    const boardId = Number(board_id);
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'Invalid board_id' }, { status: 400 });
    }
    if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const board = await getBoard(boardId, user.id);
    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    if (board.is_personal) {
      if (board.owner_id !== user.id) {
        return NextResponse.json({ error: 'Only the board owner can invite members' }, { status: 403 });
      }
      return NextResponse.json({ error: 'Personal boards cannot be shared via email invites' }, { status: 400 });
    }

    if (!board.team_id) {
      return NextResponse.json({ error: 'Board is not associated with a team' }, { status: 400 });
    }

    const membership = await isTeamMember(board.team_id, user.id);
    if (!membership || !['admin', 'owner'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only board admins can invite members' }, { status: 403 });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const invite = await createInvite(boardId, board.team_id, user.id, email.trim(), token);

    const inviteUrl = `${request.nextUrl.origin}/invite/${token}`;
    const inviterName = user.name || user.email;
    const emailResult = await sendBoardInviteEmail({
      to: invite.email,
      inviterName,
      boardName: board.name,
      inviteUrl,
    });

    return NextResponse.json({ invite, emailSent: emailResult.success });
  } catch (error: any) {
    console.error('Error creating invite:', error);
    const message = error?.message || 'Failed to create invite';
    if (message.includes('Invite already pending')) {
      return NextResponse.json({ error: 'Invite already pending for this email' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
