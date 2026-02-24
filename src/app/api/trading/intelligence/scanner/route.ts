import { NextRequest, NextResponse } from 'next/server';
import { saveScannerSnapshot } from '@/lib/db/trading';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '') || request.headers.get('x-api-key');
    
    // Simple auth check - compare against KANBAN_API_KEY
    const expectedKey = process.env.KANBAN_API_KEY;
    if (expectedKey && apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId = 1, watchlist, totalScanned, timestamp } = body;

    if (!Array.isArray(watchlist)) {
      return NextResponse.json({ error: 'watchlist must be an array' }, { status: 400 });
    }

    await saveScannerSnapshot(
      userId,
      watchlist,
      totalScanned || 0,
      timestamp || Date.now()
    );

    return NextResponse.json({
      success: true,
      coinsReceived: watchlist.length,
      topCoin: watchlist[0]?.symbol || null,
    });
  } catch (error: any) {
    console.error('POST /api/trading/intelligence/scanner error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save scanner data' }, { status: 500 });
  }
}
