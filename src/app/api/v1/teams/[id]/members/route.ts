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
    if (!membership || membership.role !== 'admin') {
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
