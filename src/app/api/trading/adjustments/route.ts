import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.env.HOME || '', 'Projects/owen-watchdog');
const ADJUSTMENTS_FILE = path.join(DATA_DIR, '.strategy-adjustments.json');

interface Adjustment {
  id: string;
  timestamp: string;
  agent: string;           // 'penny' | 'owen' | 'backtester'
  type: string;            // 'sl_change' | 'tp_change' | 'direction_flip' | 'regime_shift' | 'coin_add' | 'coin_remove' | 'param_tune'
  severity: string;        // 'minor' | 'major'
  strategy: string;        // strategy name
  changes: {
    field: string;
    from: string | number;
    to: string | number;
  }[];
  reason: string;
  marketContext?: {
    regime?: string;
    fearGreed?: number;
    btcPrice?: number;
    trigger?: string;      // what triggered the change
  };
  backtestData?: {
    coinsAnalyzed?: number;
    simulations?: number;
    winRateBefore?: number;
    winRateAfter?: number;
  };
}

function readAdjustments(): Adjustment[] {
  try {
    return JSON.parse(fs.readFileSync(ADJUSTMENTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeAdjustments(adjustments: Adjustment[]) {
  fs.writeFileSync(ADJUSTMENTS_FILE, JSON.stringify(adjustments, null, 2));
}

// GET — list adjustments (newest first), optional ?limit=N&strategy=name
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const strategy = url.searchParams.get('strategy');
  
  let adjustments = readAdjustments();
  if (strategy) {
    adjustments = adjustments.filter(a => a.strategy === strategy);
  }
  
  // Newest first
  adjustments.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  return NextResponse.json({
    adjustments: adjustments.slice(0, limit),
    total: adjustments.length
  });
}

// POST — log a new adjustment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const adjustments = readAdjustments();
    
    const adjustment: Adjustment = {
      id: `adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      agent: body.agent || 'backtester',
      type: body.type || 'param_tune',
      severity: body.severity || 'minor',
      strategy: body.strategy || 'unknown',
      changes: body.changes || [],
      reason: body.reason || '',
      marketContext: body.marketContext,
      backtestData: body.backtestData,
    };
    
    adjustments.push(adjustment);
    
    // Keep last 500 adjustments
    if (adjustments.length > 500) {
      adjustments.splice(0, adjustments.length - 500);
    }
    
    writeAdjustments(adjustments);
    
    return NextResponse.json({ success: true, adjustment });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
