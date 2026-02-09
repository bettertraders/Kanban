import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getTeamMembers, addTeamMember, isTeamMember, findOrCreateUser } from '@/lib/database';

// GET /api/v1/teams/:id/members - List team members
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
    const teamId = parseInt(id);
    
    // Verify user is a member
    const membership = await isTeamMember(teamId, user.id);
    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this team' }, { status: 403 });
    }
    
    const members = await getTeamMembers(teamId);
    return NextResponse.json({ members });
  } catch (error) {
    console.error('Error fetching team members:', error);
    return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 });
  }
}

// PATCH /api/v1/teams/:id/members - Update a member's role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id } = await params;
    const teamId = parseInt(id);
    
    // Verify user is an admin
    const membership = await isTeamMember(teamId, user.id);
    if (!membership || !['admin', 'owner'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only admins can update member roles' }, { status: 403 });
    }
    
    const { userId, role } = await request.json();
    
    if (!userId || !role) {
      return NextResponse.json({ error: 'userId and role are required' }, { status: 400 });
    }
    
    if (!['admin', 'member'].includes(role)) {
      return NextResponse.json({ error: 'Role must be "admin" or "member"' }, { status: 400 });
    }
    
    // Verify target is a team member
    const targetMembership = await isTeamMember(teamId, userId);
    if (!targetMembership) {
      return NextResponse.json({ error: 'User is not a member of this team' }, { status: 404 });
    }
    
    await addTeamMember(teamId, userId, role);
    
    return NextResponse.json({ success: true, userId, role });
  } catch (error) {
    console.error('Error updating team member:', error);
    return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 });
  }
}

// DELETE /api/v1/teams/:id/members - Remove a team member
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
    const teamId = parseInt(id);
    
    // Verify user is an admin
    const membership = await isTeamMember(teamId, user.id);
    if (!membership || !['admin', 'owner'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only admins can remove members' }, { status: 403 });
    }
    
    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    
    // Don't allow removing yourself
    if (userId === user.id) {
      return NextResponse.json({ error: 'Cannot remove yourself from the team' }, { status: 400 });
    }
    
    // Verify target is a team member
    const targetMembership = await isTeamMember(teamId, userId);
    if (!targetMembership) {
      return NextResponse.json({ error: 'User is not a member of this team' }, { status: 404 });
    }
    
    const { removeTeamMember } = await import('@/lib/database');
    await removeTeamMember(teamId, userId);
    
    return NextResponse.json({ success: true, removed: userId });
  } catch (error) {
    console.error('Error removing team member:', error);
    return NextResponse.json({ error: 'Failed to remove team member' }, { status: 500 });
  }
}

// POST /api/v1/teams/:id/members - Add a team member
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id } = await params;
    const teamId = parseInt(id);
    
    // Verify user is an admin
    const membership = await isTeamMember(teamId, user.id);
    if (!membership || !['admin', 'owner'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only admins can add members' }, { status: 403 });
    }
    
    const { email, name, role = 'member' } = await request.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    
    // Find or create the user by email, with optional name
    const newMember = await findOrCreateUser(email, name);
    await addTeamMember(teamId, newMember.id, role);
    
    return NextResponse.json({ success: true, member: { id: newMember.id, email: newMember.email, name: newMember.name, role } });
  } catch (error) {
    console.error('Error adding team member:', error);
    return NextResponse.json({ error: 'Failed to add team member' }, { status: 500 });
  }
}
