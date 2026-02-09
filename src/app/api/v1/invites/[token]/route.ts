import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { acceptInvite, getInviteByToken } from '@/lib/database';

function isExpired(expiresAt?: string | Date | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

// GET /api/v1/invites/:token - View invite details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const invite = await getInviteByToken(token);
    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    const expired = isExpired(invite.expires_at);

    return NextResponse.json({
      invite: {
        boardName: invite.board_name,
        inviterName: invite.inviter_name || invite.inviter_email || 'Someone',
        status: invite.status,
        email: invite.email,
        expiresAt: invite.expires_at,
        expired,
      },
    });
  } catch (error) {
    console.error('Error fetching invite:', error);
    return NextResponse.json({ error: 'Failed to fetch invite' }, { status: 500 });
  }
}

// POST /api/v1/invites/:token - Accept invite
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const invite = await getInviteByToken(token);
    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Invite already used' }, { status: 409 });
    }

    if (isExpired(invite.expires_at)) {
      return NextResponse.json({ error: 'Invite expired' }, { status: 410 });
    }

    const accepted = await acceptInvite(token, user.id);
    return NextResponse.json({ success: true, boardId: accepted.board_id });
  } catch (error: any) {
    console.error('Error accepting invite:', error);
    const message = error?.message || 'Failed to accept invite';
    if (message.includes('Invite expired')) {
      return NextResponse.json({ error: 'Invite expired' }, { status: 410 });
    }
    if (message.includes('Invite already used')) {
      return NextResponse.json({ error: 'Invite already used' }, { status: 409 });
    }
    if (message.includes('Invite not found')) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
