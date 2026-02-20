-- Trading Intelligence schema + seed (2026-02-20)

-- Trading account state
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

-- Strategy state
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

-- Queue coins with scores (from backtester)
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

-- Strategy adjustments log (augment existing table if present)
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

-- Seed initial data for Michael (user_id = 1)
INSERT INTO trading_accounts (user_id, exchange, base_balance, current_balance, active_cycles, avg_cycle_days)
VALUES (1, 'kraken', 100.0, 100.0, 0, 2.5)
ON CONFLICT (user_id, exchange) DO NOTHING;

INSERT INTO strategy_state (user_id, strategy_id, name, enabled, direction, weight, risk_params, queue_coins)
VALUES (
  1,
  'momentum-long',
  'Momentum Long',
  true,
  'LONG',
  1.5,
  '{"sl": 0.06, "tp": 0.12, "trail": 0.03}'::jsonb,
  ARRAY['MUBARAKUSDT', 'CRVUSDT', 'DOTUSDT', 'ONDOUSDT', 'RUNEUSDT', 'TRUMPUSDT', 'BERAUSDT', 'TRBUSDT', 'SUSDT', 'SHIBUSDT', 'ARUSDT', 'ETHFIUSDT', 'ATOMUSDT', 'ALGOUSDT', 'WUSDT', 'COMPUSDT']
)
ON CONFLICT (user_id, strategy_id) DO NOTHING;
