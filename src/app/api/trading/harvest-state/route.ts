import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getHarvestState, upsertHarvestState } from '@/lib/database';

const parseOptionalNumber = (value: any, field: string) => {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${field} must be a number`);
  }
  return num;
};

const parseOptionalBoolean = (value: any, field: string) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'false') return value === 'true';
  if (value === 1 || value === 0) return Boolean(value);
  throw new Error(`${field} must be a boolean`);
};

const parseOptionalString = (value: any) => {
  if (value === undefined || value === null) return undefined;
  return String(value);
};

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const state = await getHarvestState();
    return NextResponse.json(state);
  } catch (error) {
    console.error('GET /api/trading/harvest-state error:', error);
    return NextResponse.json({ error: 'Failed to load harvest state' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const state = await upsertHarvestState({
      cycleTarget: parseOptionalNumber(body.cycleTarget, 'cycleTarget'),
      cycleRegime: parseOptionalString(body.cycleRegime),
      cycleNumber: parseOptionalNumber(body.cycleNumber, 'cycleNumber'),
      cycleGain: parseOptionalNumber(body.cycleGain, 'cycleGain'),
      cycleActive: parseOptionalBoolean(body.cycleActive, 'cycleActive'),
      stopLoss: parseOptionalNumber(body.stopLoss, 'stopLoss'),
      harvestFloor: parseOptionalNumber(body.harvestFloor, 'harvestFloor'),
      trailEnabled: parseOptionalBoolean(body.trailEnabled, 'trailEnabled'),
      trailWidth: parseOptionalNumber(body.trailWidth, 'trailWidth'),
      maxDays: parseOptionalNumber(body.maxDays, 'maxDays'),
    });

    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update harvest state';
    console.error('POST /api/trading/harvest-state error:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
