import { NextResponse } from 'next/server';
import { getTradingSettings } from '@/lib/database';

// GET /api/trading/scan-status
// Returns the latest orchestrator scan result including active strategy
export async function GET() {
  try {
    // Read activeStrategy from trading settings (Owen pushes it each cycle)
    const settings = await getTradingSettings(0, 15);
    const activeStrategy = settings?.activeStrategy || 'contrarian';

    return NextResponse.json({
      status: 'ok',
      activeStrategy,
      message: 'Owen is scanning the watchlist for opportunities...',
      timestamp: Date.now(),
    });
  } catch {
    return NextResponse.json({ status: 'unknown', activeStrategy: 'contrarian', message: 'Unable to reach scanner' });
  }
}
