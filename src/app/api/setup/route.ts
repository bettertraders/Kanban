import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    const { setupKey } = await request.json();
    
    if (setupKey !== process.env.SETUP_KEY) {
      return NextResponse.json({ error: 'Invalid setup key' }, { status: 401 });
    }
    
    await initializeDatabase();
    
    return NextResponse.json({ success: true, message: 'Database initialized' });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 });
  }
}
