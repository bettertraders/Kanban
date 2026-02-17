import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import * as fs from 'fs/promises';
import * as path from 'path';

// POST /api/trading/reset-executor — clear Owen's trade executor state
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Owen's trade executor state file location
    const owenDir = path.join(process.env.HOME || '', 'Projects/owen-watchdog');
    const stateFile = path.join(owenDir, '.trade-executor-state.json');

    // Reset the state file to empty state
    const emptyState = {
      positions: {},
      lastExecution: Date.now(),
      executions: [],
      exitedIds: [],
      failedExits: [],
      resetAt: new Date().toISOString(),
    };

    try {
      await fs.writeFile(stateFile, JSON.stringify(emptyState, null, 2));
      console.log('[reset-executor] Cleared Owen trade executor state');
    } catch (fileErr) {
      // File might not exist on Railway deployment - that's OK
      console.log('[reset-executor] Could not write state file (may not exist on Railway):', fileErr);
    }

    return NextResponse.json({ cleared: true });
  } catch (error) {
    console.error('POST /api/trading/reset-executor error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
