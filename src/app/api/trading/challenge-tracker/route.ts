import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.env.HOME || '', 'Projects/owen-watchdog');
const TRACKER_FILE = path.join(DATA_DIR, '.challenge-tracker.json');

interface DailySnapshot {
  date: string;
  day: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  realizedPnl: number;
  unrealizedPnl: number;
  balance: number;
  activePositions: number;
  backtestTarget: number;
  deviation: number;        // winRate - backtestTarget
  status: string;           // 'on_track' | 'warning' | 'critical'
  notes: string[];
}

interface TrackerData {
  challengeStart: string;
  challengeEnd: string;
  startingBalance: number;
  backtestWinRate: number;
  backtestPnl: number;
  snapshots: DailySnapshot[];
  alerts: Array<{ timestamp: string; type: string; message: string }>;
}

function readTracker(): TrackerData {
  try {
    return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  } catch {
    return {
      challengeStart: '2026-02-13',
      challengeEnd: '2026-02-23',
      startingBalance: 1000,
      backtestWinRate: 82.1,
      backtestPnl: 33.9,
      snapshots: [],
      alerts: []
    };
  }
}

function writeTracker(data: TrackerData) {
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(data, null, 2));
}

// GET — return tracker data with current comparison
export async function GET() {
  const tracker = readTracker();
  
  // Calculate current status
  const latestSnapshot = tracker.snapshots[tracker.snapshots.length - 1];
  const totalTrades = latestSnapshot?.trades || 0;
  const currentWinRate = latestSnapshot?.winRate || 0;
  const deviation = currentWinRate - tracker.backtestWinRate;
  
  // Determine health
  let health = 'insufficient_data';
  if (totalTrades >= 5) {
    if (Math.abs(deviation) <= 10) health = 'on_track';
    else if (Math.abs(deviation) <= 20) health = 'warning';
    else health = 'critical';
  }
  
  return NextResponse.json({
    ...tracker,
    current: {
      winRate: currentWinRate,
      backtestTarget: tracker.backtestWinRate,
      deviation,
      health,
      totalTrades,
      daysElapsed: tracker.snapshots.length,
      daysRemaining: 10 - tracker.snapshots.length,
    }
  });
}

// POST — add a daily snapshot
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tracker = readTracker();
    
    const snapshot: DailySnapshot = {
      date: body.date || new Date().toISOString().split('T')[0],
      day: (tracker.snapshots.length + 1),
      trades: body.trades || 0,
      wins: body.wins || 0,
      losses: body.losses || 0,
      winRate: body.winRate || 0,
      realizedPnl: body.realizedPnl || 0,
      unrealizedPnl: body.unrealizedPnl || 0,
      balance: body.balance || 0,
      activePositions: body.activePositions || 0,
      backtestTarget: tracker.backtestWinRate,
      deviation: (body.winRate || 0) - tracker.backtestWinRate,
      status: 'on_track',
      notes: body.notes || [],
    };
    
    // Determine status
    if (snapshot.trades >= 5) {
      if (Math.abs(snapshot.deviation) <= 10) snapshot.status = 'on_track';
      else if (Math.abs(snapshot.deviation) <= 20) snapshot.status = 'warning';
      else snapshot.status = 'critical';
    } else {
      snapshot.status = 'insufficient_data';
    }
    
    // Check for alerts
    if (snapshot.status === 'warning') {
      tracker.alerts.push({
        timestamp: new Date().toISOString(),
        type: 'warning',
        message: `Day ${snapshot.day}: Win rate ${snapshot.winRate.toFixed(1)}% is ${Math.abs(snapshot.deviation).toFixed(1)}% off backtest target (${tracker.backtestWinRate}%)`
      });
    }
    if (snapshot.status === 'critical') {
      tracker.alerts.push({
        timestamp: new Date().toISOString(),
        type: 'critical',
        message: `Day ${snapshot.day}: Win rate ${snapshot.winRate.toFixed(1)}% is ${Math.abs(snapshot.deviation).toFixed(1)}% off backtest target — INVESTIGATION NEEDED`
      });
    }
    
    // Replace snapshot for same day or add new
    const existingIdx = tracker.snapshots.findIndex(s => s.date === snapshot.date);
    if (existingIdx >= 0) {
      snapshot.day = tracker.snapshots[existingIdx].day;
      tracker.snapshots[existingIdx] = snapshot;
    } else {
      tracker.snapshots.push(snapshot);
    }
    
    writeTracker(tracker);
    return NextResponse.json({ success: true, snapshot });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
