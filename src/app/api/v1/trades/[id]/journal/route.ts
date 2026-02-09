import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { addJournalEntry, getJournalEntries, getTrade } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const tradeId = parseInt(id, 10);
    const trade = await getTrade(tradeId);
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    const entries = await getJournalEntries(tradeId);
    return NextResponse.json({ entries });
  } catch (e) {
    console.error('GET /trades/[id]/journal error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const tradeId = parseInt(id, 10);
    const trade = await getTrade(tradeId);
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    const body = await request.json();
    const entryType = String(body.entry_type || '').trim();
    const content = String(body.content || '').trim();
    const mood = body.mood ? String(body.mood) : null;

    if (!entryType || !content) {
      return NextResponse.json({ error: 'entry_type and content required' }, { status: 400 });
    }

    const entry = await addJournalEntry(tradeId, entryType, content, mood, user.id);
    return NextResponse.json({ entry });
  } catch (e) {
    console.error('POST /trades/[id]/journal error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
