import { ensureHarvestStateTable, pool } from '@/lib/database';

export type TradingAccount = {
  id: number;
  user_id: number;
  exchange: string;
  base_balance: number;
  current_balance: number;
  realized_pnl: number;
  unrealized_pnl: number;
  active_cycles: number;
  avg_cycle_days: number;
  circuit_breaker: boolean;
  circuit_breaker_until: Date | null;
  updated_at: Date;
};

export type StrategyState = {
  id: number;
  user_id: number;
  strategy_id: string | null;
  name: string | null;
  enabled: boolean;
  direction: string | null;
  weight: number | null;
  risk_params: Record<string, any> | null;
  queue_coins: string[] | null;
  updated_at: Date;
};

export type QueueCoinScore = {
  id: number;
  user_id: number;
  symbol: string;
  score: number;
  rsi: number;
  price: number;
  change24h: number;
  rank: number | null;
  updated_at: Date;
};

export type StrategyAdjustment = {
  id: string | number;
  user_id: number | null;
  agent: string | null;
  type: string | null;
  strategy: string | null;
  summary: string | null;
  details: Record<string, any> | null;
  created_at: Date | null;
  timestamp?: Date | null;
  reason?: string | null;
};

let tradingTablesReady = false;
export async function ensureTradingTables() {
  if (tradingTablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trading_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      exchange VARCHAR(50) DEFAULT 'kraken',
      base_balance DECIMAL(20, 8) DEFAULT 100.0,
      current_balance DECIMAL(20, 8) DEFAULT 100.0,
      realized_pnl DECIMAL(20, 8) DEFAULT 0,
      unrealized_pnl DECIMAL(20, 8) DEFAULT 0,
      active_cycles INTEGER DEFAULT 0,
      avg_cycle_days DECIMAL(5, 2) DEFAULT 2.5,
      circuit_breaker BOOLEAN DEFAULT FALSE,
      circuit_breaker_until TIMESTAMP,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS trading_accounts_user_exchange_uq
      ON trading_accounts(user_id, exchange);

    CREATE TABLE IF NOT EXISTS strategy_state (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      strategy_id VARCHAR(50),
      name VARCHAR(100),
      enabled BOOLEAN DEFAULT TRUE,
      direction VARCHAR(10),
      weight DECIMAL(5, 2),
      risk_params JSONB,
      queue_coins TEXT[],
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS strategy_state_user_strategy_uq
      ON strategy_state(user_id, strategy_id);

    CREATE TABLE IF NOT EXISTS queue_coin_scores (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      symbol VARCHAR(20),
      score DECIMAL(10, 2),
      rsi DECIMAL(5, 2),
      price DECIMAL(20, 8),
      change24h DECIMAL(10, 4),
      rank INTEGER,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS queue_coin_scores_user_symbol_uq
      ON queue_coin_scores(user_id, symbol);

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
    );

    ALTER TABLE IF EXISTS strategy_adjustments
      ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
    ALTER TABLE IF EXISTS strategy_adjustments
      ADD COLUMN IF NOT EXISTS summary TEXT;
    ALTER TABLE IF EXISTS strategy_adjustments
      ADD COLUMN IF NOT EXISTS details JSONB;
    ALTER TABLE IF EXISTS strategy_adjustments
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
  `);
  await ensureHarvestStateTable();
  tradingTablesReady = true;
}

export async function getTradingAccount(userId: number, exchange = 'kraken'): Promise<TradingAccount | null> {
  await ensureTradingTables();
  const result = await pool.query(
    `SELECT * FROM trading_accounts WHERE user_id = $1 AND exchange = $2 LIMIT 1`,
    [userId, exchange]
  );
  return result.rows[0] || null;
}

export async function upsertTradingAccount(params: {
  userId: number;
  exchange?: string;
  baseBalance?: number | null;
  currentBalance?: number | null;
  realizedPnl?: number | null;
  unrealizedPnl?: number | null;
  activeCycles?: number | null;
  avgCycleDays?: number | null;
  circuitBreaker?: boolean | null;
  circuitBreakerUntil?: Date | null;
}) {
  await ensureTradingTables();
  const exchange = params.exchange || 'kraken';
  const existing = await pool.query(
    `SELECT * FROM trading_accounts WHERE user_id = $1 AND exchange = $2 LIMIT 1`,
    [params.userId, exchange]
  );

  if (existing.rows.length === 0) {
    const baseBalance = params.baseBalance ?? 100;
    const currentBalance = params.currentBalance ?? baseBalance;
    const inserted = await pool.query(
      `INSERT INTO trading_accounts (
        user_id, exchange, base_balance, current_balance, realized_pnl, unrealized_pnl,
        active_cycles, avg_cycle_days, circuit_breaker, circuit_breaker_until, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *`,
      [
        params.userId,
        exchange,
        baseBalance,
        currentBalance,
        params.realizedPnl ?? 0,
        params.unrealizedPnl ?? 0,
        params.activeCycles ?? 0,
        params.avgCycleDays ?? 2.5,
        params.circuitBreaker ?? false,
        params.circuitBreakerUntil ?? null,
      ]
    );
    return inserted.rows[0] as TradingAccount;
  }

  const result = await pool.query(
    `UPDATE trading_accounts SET
      base_balance = COALESCE($3, base_balance),
      current_balance = COALESCE($4, current_balance),
      realized_pnl = COALESCE($5, realized_pnl),
      unrealized_pnl = COALESCE($6, unrealized_pnl),
      active_cycles = COALESCE($7, active_cycles),
      avg_cycle_days = COALESCE($8, avg_cycle_days),
      circuit_breaker = COALESCE($9, circuit_breaker),
      circuit_breaker_until = COALESCE($10, circuit_breaker_until),
      updated_at = NOW()
     WHERE user_id = $1 AND exchange = $2
     RETURNING *`,
    [
      params.userId,
      exchange,
      params.baseBalance ?? null,
      params.currentBalance ?? null,
      params.realizedPnl ?? null,
      params.unrealizedPnl ?? null,
      params.activeCycles ?? null,
      params.avgCycleDays ?? null,
      params.circuitBreaker ?? null,
      params.circuitBreakerUntil ?? null,
    ]
  );

  return result.rows[0] as TradingAccount;
}

export async function getStrategyStates(userId: number): Promise<StrategyState[]> {
  await ensureTradingTables();
  const result = await pool.query(
    `SELECT * FROM strategy_state WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  return result.rows as StrategyState[];
}

export async function getStrategyState(userId: number, strategyId: string): Promise<StrategyState | null> {
  await ensureTradingTables();
  const result = await pool.query(
    `SELECT * FROM strategy_state WHERE user_id = $1 AND strategy_id = $2 LIMIT 1`,
    [userId, strategyId]
  );
  return result.rows[0] || null;
}

export async function upsertStrategyState(params: {
  userId: number;
  strategyId: string;
  name?: string | null;
  enabled?: boolean | null;
  direction?: string | null;
  weight?: number | null;
  riskParams?: Record<string, any> | null;
  queueCoins?: string[] | null;
}) {
  await ensureTradingTables();
  const result = await pool.query(
    `INSERT INTO strategy_state (
      user_id, strategy_id, name, enabled, direction, weight, risk_params, queue_coins, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (user_id, strategy_id) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, strategy_state.name),
      enabled = COALESCE(EXCLUDED.enabled, strategy_state.enabled),
      direction = COALESCE(EXCLUDED.direction, strategy_state.direction),
      weight = COALESCE(EXCLUDED.weight, strategy_state.weight),
      risk_params = COALESCE(EXCLUDED.risk_params, strategy_state.risk_params),
      queue_coins = COALESCE(EXCLUDED.queue_coins, strategy_state.queue_coins),
      updated_at = NOW()
    RETURNING *`,
    [
      params.userId,
      params.strategyId,
      params.name ?? null,
      params.enabled ?? true,
      params.direction ?? null,
      params.weight ?? null,
      params.riskParams ?? null,
      params.queueCoins ?? null,
    ]
  );
  return result.rows[0] as StrategyState;
}

export async function replaceQueueCoinScores(userId: number, scores: Array<Omit<QueueCoinScore, 'id' | 'user_id' | 'updated_at'>>) {
  await ensureTradingTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM queue_coin_scores WHERE user_id = $1', [userId]);

    for (const score of scores) {
      await client.query(
        `INSERT INTO queue_coin_scores (user_id, symbol, score, rsi, price, change24h, rank, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          userId,
          score.symbol,
          score.score,
          score.rsi,
          score.price,
          score.change24h,
          score.rank ?? null,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getQueueCoinScores(userId: number, limit = 5): Promise<QueueCoinScore[]> {
  await ensureTradingTables();
  const result = await pool.query(
    `SELECT * FROM queue_coin_scores
     WHERE user_id = $1
     ORDER BY rank NULLS LAST, score DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows as QueueCoinScore[];
}

export async function getRecentStrategyAdjustments(userId: number, limit = 3): Promise<StrategyAdjustment[]> {
  await ensureTradingTables();
  const result = await pool.query(
    `SELECT * FROM strategy_adjustments
     WHERE user_id = $1 OR user_id IS NULL
     ORDER BY COALESCE(created_at, timestamp) DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows as StrategyAdjustment[];
}
