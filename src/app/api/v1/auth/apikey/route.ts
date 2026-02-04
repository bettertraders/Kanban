import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { findOrCreateUser, generateApiKey } from '@/lib/database';

// POST /api/v1/auth/apikey - Generate an API key (requires session auth)
export async function POST(request: NextRequest) {
  try {
    // Only session auth allowed for generating API keys
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized - must be logged in via browser' }, { status: 401 });
    }
    
    const user = await findOrCreateUser(session.user.email);
    
    const { name } = await request.json();
    
    if (!name) {
      return NextResponse.json({ error: 'Name is required for API key' }, { status: 400 });
    }
    
    const apiKey = await generateApiKey(user.id, name);
    
    return NextResponse.json({ 
      apiKey,
      warning: 'Save this key now! It will not be shown again.'
    }, { status: 201 });
  } catch (error) {
    console.error('Error generating API key:', error);
    return NextResponse.json({ error: 'Failed to generate API key' }, { status: 500 });
  }
}
