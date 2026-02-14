import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/database';

// GET — list adjustments (newest first)
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const strategy = url.searchParams.get('strategy');

  try {
    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS strategy_adjustments (
        id TEXT PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        agent TEXT,
        type TEXT,
        severity TEXT,
        strategy TEXT,
        changes JSONB DEFAULT '[]',
        reason TEXT,
        market_context JSONB DEFAULT '{}',
        backtest_data JSONB DEFAULT '{}'
      )
    `);

    let query = 'SELECT * FROM strategy_adjustments';
    const params: (string | number)[] = [];
    
    if (strategy) {
      query += ' WHERE strategy = $1';
      params.push(strategy);
    }
    query += ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await pool.query(query, params);
    
    const adjustments = result.rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      agent: row.agent,
      type: row.type,
      severity: row.severity,
      strategy: row.strategy,
      changes: row.changes,
      reason: row.reason,
      marketContext: row.market_context,
      backtestData: row.backtest_data,
    }));

    const countResult = await pool.query('SELECT COUNT(*) FROM strategy_adjustments');
    
    return NextResponse.json({
      adjustments,
      total: parseInt(countResult.rows[0].count)
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — log a new adjustment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS strategy_adjustments (
        id TEXT PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        agent TEXT,
        type TEXT,
        severity TEXT,
        strategy TEXT,
        changes JSONB DEFAULT '[]',
        reason TEXT,
        market_context JSONB DEFAULT '{}',
        backtest_data JSONB DEFAULT '{}'
      )
    `);

    const id = body.id || `adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timestamp = body.timestamp || new Date().toISOString();

    await pool.query(
      `INSERT INTO strategy_adjustments (id, timestamp, agent, type, severity, strategy, changes, reason, market_context, backtest_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        timestamp,
        body.agent || 'backtester',
        body.type || 'param_tune',
        body.severity || 'minor',
        body.strategy || 'unknown',
        JSON.stringify(body.changes || []),
        body.reason || '',
        JSON.stringify(body.marketContext || body.market_context || {}),
        JSON.stringify(body.backtestData || body.backtest_data || {}),
      ]
    );

    return NextResponse.json({ success: true, id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
