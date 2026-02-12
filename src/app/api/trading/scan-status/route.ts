import { NextResponse } from 'next/server';

// GET /api/trading/scan-status
// Returns the latest orchestrator scan result (read from Owen's local output)
// On Railway (no local Owen), returns a pending status
export async function GET() {
  try {
    // In production, Owen pushes scan results via a different mechanism
    // For now, return a status based on settings state
    return NextResponse.json({
      status: 'scanning',
      message: 'Owen is scanning the watchlist for opportunities...',
      timestamp: Date.now(),
    });
  } catch {
    return NextResponse.json({ status: 'unknown', message: 'Unable to reach scanner' });
  }
}
