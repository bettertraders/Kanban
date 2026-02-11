import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway.internal') ? false : { rejectUnauthorized: false }
});

// Initialize database schema
export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        password_hash VARCHAR(255),
        avatar_url TEXT,
        api_key VARCHAR(64) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Add password_hash column if it doesn't exist (migration)
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash') THEN
          ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
        END IF;
      END $$;

      -- Teams table
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Team members
      CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(team_id, user_id)
      );

      -- Boards table
      CREATE TABLE IF NOT EXISTS boards (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        owner_id INTEGER REFERENCES users(id),
        team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        is_personal BOOLEAN DEFAULT false,
        visibility VARCHAR(20) DEFAULT 'all',
        columns JSONB DEFAULT '["Backlog", "Planned", "In Progress", "Review", "Done"]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tasks table
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        notes TEXT,
        column_name VARCHAR(100) DEFAULT 'Backlog',
        position INTEGER DEFAULT 0,
        priority VARCHAR(20) DEFAULT 'medium',
        assigned_to INTEGER REFERENCES users(id),
        created_by INTEGER REFERENCES users(id),
        due_date TIMESTAMP,
        labels JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Add notes column if it doesn't exist (migration)
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='notes') THEN
          ALTER TABLE tasks ADD COLUMN notes TEXT;
        END IF;
      END $$;

      -- Add links column if it doesn't exist (migration)
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='links') THEN
          ALTER TABLE tasks ADD COLUMN links JSONB DEFAULT '[]';
        END IF;
      END $$;

      -- Comments table
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );


      -- API keys table for bot access
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        key_hash VARCHAR(64) UNIQUE NOT NULL,
        name VARCHAR(255),
        last_used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Task files table
      CREATE TABLE IF NOT EXISTS task_files (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100),
        size_bytes INTEGER,
        uploaded_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Board invites table
      CREATE TABLE IF NOT EXISTS board_invites (
        id SERIAL PRIMARY KEY,
        board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
        team_id INTEGER REFERENCES teams(id),
        invited_by INTEGER REFERENCES users(id),
        email VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        token VARCHAR(64) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_tasks_board ON tasks(board_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(board_id, column_name);
      CREATE INDEX IF NOT EXISTS idx_boards_owner ON boards(owner_id);
      CREATE INDEX IF NOT EXISTS idx_boards_team ON boards(team_id);
      CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
      CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_files_task ON task_files(task_id);

      -- Trading View: Add board_type to boards
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boards' AND column_name='board_type') THEN
          ALTER TABLE boards ADD COLUMN board_type VARCHAR(20) DEFAULT 'task';
        END IF;
      END $$;

      -- Board visibility (admin-only trading boards)
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='boards' AND column_name='visibility') THEN
          ALTER TABLE boards ADD COLUMN visibility VARCHAR(20) DEFAULT 'all';
        END IF;
      END $$;

      -- Trades table
      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
        column_name VARCHAR(50) DEFAULT 'Watchlist',
        coin_pair VARCHAR(20) NOT NULL,
        direction VARCHAR(10),
        entry_price DECIMAL(20,8),
        current_price DECIMAL(20,8),
        exit_price DECIMAL(20,8),
        stop_loss DECIMAL(20,8),
        take_profit DECIMAL(20,8),
        position_size DECIMAL(20,8),
        tbo_signal VARCHAR(20),
        rsi_value DECIMAL(5,2),
        macd_status VARCHAR(20),
        volume_assessment VARCHAR(20),
        confidence_score INTEGER,
        pnl_dollar DECIMAL(20,2),
        pnl_percent DECIMAL(10,4),
        bot_id INTEGER,
        created_by INTEGER REFERENCES users(id),
        priority VARCHAR(10) DEFAULT 'medium',
        pause_reason TEXT,
        lesson_tag TEXT,
        notes TEXT,
        trade_settings JSONB DEFAULT '{}',
        links JSONB DEFAULT '[]',
        status VARCHAR(20) DEFAULT 'watching',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        entered_at TIMESTAMP,
        exited_at TIMESTAMP
      );

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trades' AND column_name='trade_settings') THEN
          ALTER TABLE trades ADD COLUMN trade_settings JSONB DEFAULT '{}';
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_trades_board ON trades(board_id);
      CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
      CREATE INDEX IF NOT EXISTS idx_trades_coin ON trades(coin_pair);

      -- Paper trading accounts
      CREATE TABLE IF NOT EXISTS paper_accounts (
        id SERIAL PRIMARY KEY,
        board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        starting_balance DECIMAL(20,2) DEFAULT 10000,
        current_balance DECIMAL(20,2) DEFAULT 10000,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(board_id, user_id)
      );

      -- Trading bots
      CREATE TABLE IF NOT EXISTS trading_bots (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        board_id INTEGER REFERENCES boards(id),
        user_id INTEGER REFERENCES users(id),
        strategy_style VARCHAR(50) NOT NULL,
        strategy_substyle VARCHAR(50) NOT NULL,
        strategy_config JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'stopped',
        auto_trade BOOLEAN DEFAULT false,
        tbo_enabled BOOLEAN DEFAULT false,
        rebalancer_enabled BOOLEAN DEFAULT false,
        rebalancer_config JSONB DEFAULT '{}',
        performance JSONB DEFAULT '{}',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Migration: add metadata column if missing
      DO $$ BEGIN
        ALTER TABLE trading_bots ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;

      -- Bot executions
      CREATE TABLE IF NOT EXISTS bot_executions (
        id SERIAL PRIMARY KEY,
        bot_id INTEGER REFERENCES trading_bots(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        details JSONB DEFAULT '{}',
        executed_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Portfolio snapshots
      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id SERIAL PRIMARY KEY,
        bot_id INTEGER REFERENCES trading_bots(id) ON DELETE CASCADE,
        allocations JSONB NOT NULL,
        total_value DECIMAL(20,8),
        snapshot_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Bot leaderboard
      CREATE TABLE IF NOT EXISTS bot_leaderboard (
        id SERIAL PRIMARY KEY,
        bot_id INTEGER REFERENCES trading_bots(id) ON DELETE CASCADE,
        period VARCHAR(20) NOT NULL,
        total_return DECIMAL(10,4),
        win_rate DECIMAL(5,2),
        total_trades INTEGER,
        sharpe_ratio DECIMAL(6,3),
        max_drawdown DECIMAL(10,4),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(bot_id, period)
      );

      -- Trade comments table
      CREATE TABLE IF NOT EXISTS trade_comments (
        id SERIAL PRIMARY KEY,
        trade_id INTEGER REFERENCES trades(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_trade_comments_trade ON trade_comments(trade_id);

      -- Trade activity log
      CREATE TABLE IF NOT EXISTS trade_activity (
        id SERIAL PRIMARY KEY,
        trade_id INTEGER REFERENCES trades(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        from_column VARCHAR(50),
        to_column VARCHAR(50),
        actor_type VARCHAR(10),
        actor_name VARCHAR(100),
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_trade_activity_trade ON trade_activity(trade_id);

      -- Trade alerts
      CREATE TABLE IF NOT EXISTS trade_alerts (
        id SERIAL PRIMARY KEY,
        board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
        trade_id INTEGER REFERENCES trades(id) ON DELETE SET NULL,
        alert_type VARCHAR(50) NOT NULL,
        condition_value DECIMAL(20,8),
        condition_operator VARCHAR(10),
        message TEXT,
        triggered BOOLEAN DEFAULT false,
        triggered_at TIMESTAMP,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_trade_alerts_board ON trade_alerts(board_id);

      -- Trade journal
      CREATE TABLE IF NOT EXISTS trade_journal (
        id SERIAL PRIMARY KEY,
        trade_id INTEGER REFERENCES trades(id) ON DELETE CASCADE,
        entry_type VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        mood VARCHAR(20),
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_trade_journal_trade ON trade_journal(trade_id);

      -- Price cache
      CREATE TABLE IF NOT EXISTS price_history (
        id SERIAL PRIMARY KEY,
        coin_pair VARCHAR(20) NOT NULL,
        price DECIMAL(20,8) NOT NULL,
        volume DECIMAL(20,2),
        timestamp TIMESTAMP NOT NULL,
        source VARCHAR(50) DEFAULT 'ccxt'
      );

      CREATE INDEX IF NOT EXISTS idx_price_history_pair ON price_history(coin_pair, timestamp);

      -- Performance stats (aggregated daily)
      CREATE TABLE IF NOT EXISTS trading_stats (
        id SERIAL PRIMARY KEY,
        board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
        bot_id INTEGER,
        date DATE NOT NULL,
        total_trades INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        total_pnl DECIMAL(20,2) DEFAULT 0,
        win_rate DECIMAL(5,2),
        avg_win DECIMAL(20,2),
        avg_loss DECIMAL(20,2),
        sharpe_ratio DECIMAL(10,4),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_trading_stats_board ON trading_stats(board_id, date);

      -- TBO Signals table
      CREATE TABLE IF NOT EXISTS tbo_signals (
        id SERIAL PRIMARY KEY,
        ticker VARCHAR(20) NOT NULL,
        exchange VARCHAR(50) NOT NULL,
        interval VARCHAR(20) NOT NULL,
        signal VARCHAR(50) NOT NULL,
        price DOUBLE PRECISION NOT NULL,
        volume DOUBLE PRECISION,
        signal_time TIMESTAMP NOT NULL,
        received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed BOOLEAN DEFAULT false
      );

      CREATE INDEX IF NOT EXISTS idx_tbo_signals_ticker ON tbo_signals(ticker);
      CREATE INDEX IF NOT EXISTS idx_tbo_signals_signal ON tbo_signals(signal);
      CREATE INDEX IF NOT EXISTS idx_tbo_signals_received ON tbo_signals(received_at);

      -- TBO config (key/value settings store)
      CREATE TABLE IF NOT EXISTS tbo_config (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Seed TBO enabled default
      INSERT INTO tbo_config (key, value) VALUES ('enabled', 'false')
        ON CONFLICT (key) DO NOTHING;
    `);
    console.log('Database schema initialized');
  } finally {
    client.release();
  }
}

// User functions
export async function findOrCreateUser(email: string, name?: string, avatarUrl?: string) {
  const client = await pool.connect();
  try {
    // Try to find existing user
    let result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length > 0) {
      // Update name and avatar if provided
      if (name || avatarUrl) {
        await client.query(
          'UPDATE users SET name = COALESCE($2, name), avatar_url = COALESCE($3, avatar_url), updated_at = NOW() WHERE email = $1',
          [email, name, avatarUrl]
        );
        result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
      }
      return result.rows[0];
    }

    // Create new user
    result = await client.query(
      'INSERT INTO users (email, name, avatar_url) VALUES ($1, $2, $3) RETURNING *',
      [email, name, avatarUrl]
    );
    
    const user = result.rows[0];
    
    // Create personal board for new user
    const firstName = name ? name.split(' ')[0] : null;
    const boardName = firstName ? `${firstName}'s Personal Board` : 'Personal Board';
    await client.query(
      `INSERT INTO boards (name, description, owner_id, is_personal, columns) 
       VALUES ($1, $2, $3, true, $4)`,
      [boardName, 'Personal task board', user.id, JSON.stringify(['Backlog', 'Planned', 'In Progress', 'Review', 'Done'])]
    );
    
    return user;
  } finally {
    client.release();
  }
}

export async function getUserById(id: number) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
}

export async function getUserByEmail(email: string) {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0];
}

export async function createUserWithPassword(email: string, password: string, name?: string) {
  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash(password, 12);
  
  const client = await pool.connect();
  try {
    // Check if user already exists
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new Error('User already exists');
    }
    
    // Create new user with password
    const result = await client.query(
      'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [email, name, passwordHash]
    );
    
    const user = result.rows[0];
    
    // Create personal board for new user
    const firstName = name ? name.split(' ')[0] : null;
    const boardName = firstName ? `${firstName}'s Personal Board` : 'Personal Board';
    await client.query(
      `INSERT INTO boards (name, description, owner_id, is_personal, columns) 
       VALUES ($1, $2, $3, true, $4)`,
      [boardName, 'Personal task board', user.id, JSON.stringify(['Backlog', 'Planned', 'In Progress', 'Review', 'Done'])]
    );
    
    return user;
  } finally {
    client.release();
  }
}

export async function verifyPassword(email: string, password: string) {
  const bcrypt = await import('bcryptjs');
  const user = await getUserByEmail(email);
  
  if (!user || !user.password_hash) {
    return null;
  }
  
  const isValid = await bcrypt.compare(password, user.password_hash);
  return isValid ? user : null;
}

export async function getUserByApiKey(apiKey: string) {
  const crypto = await import('crypto');
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  const result = await pool.query(`
    SELECT u.* FROM users u
    JOIN api_keys ak ON u.id = ak.user_id
    WHERE ak.key_hash = $1
  `, [keyHash]);
  
  if (result.rows.length > 0) {
    // Update last used
    await pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1', [keyHash]);
  }
  
  return result.rows[0];
}

export async function generateApiKey(userId: number, name: string) {
  const crypto = await import('crypto');
  const apiKey = `kb_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  await pool.query(
    'INSERT INTO api_keys (user_id, key_hash, name) VALUES ($1, $2, $3)',
    [userId, keyHash, name]
  );
  
  return apiKey; // Only returned once!
}

// Team functions
export async function createTeam(
  name: string,
  slug: string,
  createdBy: number,
  description?: string,
  options: { createDefaultBoard?: boolean } = {}
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Create team
    const teamResult = await client.query(
      'INSERT INTO teams (name, slug, description, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, slug, description, createdBy]
    );
    const team = teamResult.rows[0];
    
    // Add creator as admin
    await client.query(
      'INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)',
      [team.id, createdBy, 'admin']
    );
    
    if (options.createDefaultBoard !== false) {
      // Create default team board
      await client.query(
        `INSERT INTO boards (name, description, team_id, is_personal, columns) 
         VALUES ($1, $2, $3, false, $4)`,
        [`${name} Board`, 'Team collaboration board', team.id, JSON.stringify(['Backlog', 'Planned', 'In Progress', 'Review', 'Done'])]
      );
    }
    
    await client.query('COMMIT');
    return team;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getTeamsForUser(userId: number) {
  const result = await pool.query(`
    SELECT t.*, tm.role as user_role
    FROM teams t
    JOIN team_members tm ON t.id = tm.team_id
    WHERE tm.user_id = $1
    ORDER BY t.name
  `, [userId]);
  return result.rows;
}

export async function getVisibleUsers(userId: number): Promise<{ id: number; name: string; email: string; image: string | null }[]> {
  const result = await pool.query(
    `
      SELECT DISTINCT u.id, u.name, u.email, u.avatar_url as image
      FROM users u
      JOIN team_members tm1 ON u.id = tm1.user_id
      JOIN team_members tm2 ON tm1.team_id = tm2.team_id
      WHERE tm2.user_id = $1 AND u.id <> $1
      ORDER BY u.name NULLS LAST, u.email
    `,
    [userId]
  );
  return result.rows;
}

export async function getTeamMembers(teamId: number) {
  const result = await pool.query(`
    SELECT u.id, u.email, u.name, u.avatar_url, tm.role, tm.joined_at
    FROM users u
    JOIN team_members tm ON u.id = tm.user_id
    WHERE tm.team_id = $1
    ORDER BY tm.role, u.name
  `, [teamId]);
  return result.rows;
}

export async function addTeamMember(teamId: number, userId: number, role: string = 'member') {
  await pool.query(
    'INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (team_id, user_id) DO UPDATE SET role = $3',
    [teamId, userId, role]
  );
}

export async function removeTeamMember(teamId: number, userId: number) {
  await pool.query(
    'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
}

export async function isTeamMember(teamId: number, userId: number) {
  const result = await pool.query(
    'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
  return result.rows[0];
}

export async function isAdminUser(userId: number) {
  const result = await pool.query(
    "SELECT 1 FROM team_members WHERE user_id = $1 AND role IN ('admin', 'owner') LIMIT 1",
    [userId]
  );
  return result.rows.length > 0;
}

// Auto-join teams based on email domain
export async function autoJoinTeams(userId: number, email: string) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return;
  
  // Map email domains to team slugs
  const domainTeamMap: Record<string, string> = {
    'thebettertraders.com': 'the-better-traders',
  };
  
  const teamSlug = domainTeamMap[domain];
  if (!teamSlug) return;
  
  const client = await pool.connect();
  try {
    // Find the team
    const teamResult = await client.query('SELECT id FROM teams WHERE slug = $1', [teamSlug]);
    if (teamResult.rows.length === 0) return;
    
    const teamId = teamResult.rows[0].id;
    
    // Check if already a member
    const memberResult = await client.query(
      'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, userId]
    );
    
    if (memberResult.rows.length === 0) {
      // Auto-join as member
      await client.query(
        'INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)',
        [teamId, userId, 'member']
      );
      console.log(`Auto-joined user ${userId} (${email}) to team ${teamSlug}`);
    }
  } finally {
    client.release();
  }
}

// Board functions
export async function getBoardsForUser(userId: number) {
  const result = await pool.query(`
    SELECT * FROM (
      SELECT DISTINCT ON (b.id) b.*, t.name as team_name, t.slug as team_slug, tm.role as user_role
      FROM boards b
      LEFT JOIN teams t ON b.team_id = t.id
      LEFT JOIN team_members tm ON t.id = tm.team_id AND tm.user_id = $1
      WHERE b.owner_id = $1 OR tm.user_id = $1
      ORDER BY b.id
    ) sub
    WHERE visibility IS NULL
       OR visibility <> 'admin_only'
       OR user_role IN ('admin', 'owner')
       OR owner_id = $1
    ORDER BY is_personal DESC, name
  `, [userId]);
  return result.rows;
}

export async function getBoard(boardId: number, userId: number) {
  const result = await pool.query(`
    SELECT b.*, t.name as team_name, t.slug as team_slug, tm.role as user_role
    FROM boards b
    LEFT JOIN teams t ON b.team_id = t.id
    LEFT JOIN team_members tm ON t.id = tm.team_id AND tm.user_id = $2
    WHERE b.id = $1 AND (b.owner_id = $2 OR tm.user_id = $2)
      AND (b.visibility IS NULL OR b.visibility <> 'admin_only' OR tm.role IN ('admin', 'owner') OR b.owner_id = $2)
  `, [boardId, userId]);
  return result.rows[0];
}

export async function createBoard(
  name: string,
  ownerId: number,
  teamId?: number,
  description?: string,
  options: {
    boardType?: string;
    columns?: string[];
    visibility?: string;
    startingBalance?: number;
  } = {}
) {
  const boardType = options.boardType ?? 'task';
  const columns = options.columns ?? (boardType === 'trading'
    ? ['Watchlist', 'Analyzing', 'Active', 'Parked', 'Wins', 'Losses']
    : ['Backlog', 'Planned', 'In Progress', 'Review', 'Done']);
  const visibility = options.visibility ?? (boardType === 'trading' ? 'admin_only' : 'all');

  const result = await pool.query(
    `INSERT INTO boards (name, description, owner_id, team_id, is_personal, board_type, columns, visibility)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [name, description, teamId ? null : ownerId, teamId, !teamId, boardType, JSON.stringify(columns), visibility]
  );
  const board = result.rows[0];
  if (boardType === 'trading') {
    const startingBalance = Number.isFinite(options.startingBalance)
      ? Number(options.startingBalance)
      : 10000;
    await pool.query(
      `INSERT INTO paper_accounts (board_id, user_id, starting_balance, current_balance)
       VALUES ($1, $2, $3, $3)
       ON CONFLICT (board_id, user_id) DO NOTHING`,
      [board.id, ownerId, startingBalance]
    );
  }
  return board;
}

// Board invites
export async function createInvite(
  boardId: number,
  teamId: number,
  invitedBy: number,
  email: string,
  token: string
): Promise<any> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await client.query(
      `SELECT id FROM board_invites
       WHERE board_id = $1
         AND LOWER(email) = $2
         AND status = 'pending'
         AND expires_at > NOW()
       LIMIT 1`,
      [boardId, normalizedEmail]
    );
    if (existing.rows.length > 0) {
      throw new Error('Invite already pending for this email');
    }

    const result = await client.query(
      `INSERT INTO board_invites (board_id, team_id, invited_by, email, token)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [boardId, teamId, invitedBy, normalizedEmail, token]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getInviteByToken(token: string): Promise<any> {
  const result = await pool.query(
    `SELECT bi.*, b.name as board_name, b.team_id as board_team_id, u.name as inviter_name, u.email as inviter_email
     FROM board_invites bi
     JOIN boards b ON bi.board_id = b.id
     LEFT JOIN users u ON bi.invited_by = u.id
     WHERE bi.token = $1`,
    [token]
  );
  return result.rows[0];
}

export async function acceptInvite(token: string, userId: number): Promise<any> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inviteResult = await client.query(
      `SELECT bi.*, b.team_id as board_team_id
       FROM board_invites bi
       JOIN boards b ON bi.board_id = b.id
       WHERE bi.token = $1
       FOR UPDATE`,
      [token]
    );
    const invite = inviteResult.rows[0];
    if (!invite) {
      throw new Error('Invite not found');
    }
    if (invite.status !== 'pending') {
      throw new Error('Invite already used');
    }
    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      throw new Error('Invite expired');
    }

    const teamId = invite.team_id || invite.board_team_id;
    if (!teamId) {
      throw new Error('Invite is not associated with a team');
    }

    await client.query(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (team_id, user_id) DO NOTHING`,
      [teamId, userId]
    );

    const updated = await client.query(
      `UPDATE board_invites SET status = 'accepted' WHERE id = $1 RETURNING *`,
      [invite.id]
    );

    await client.query('COMMIT');
    return { invite: updated.rows[0], board_id: invite.board_id, team_id: teamId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getPendingInvites(boardId: number): Promise<any[]> {
  const result = await pool.query(
    `SELECT id, board_id, email, status, created_at, expires_at
     FROM board_invites
     WHERE board_id = $1
       AND status = 'pending'
       AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [boardId]
  );
  return result.rows;
}

export async function cancelInvite(inviteId: number): Promise<void> {
  await pool.query(
    `UPDATE board_invites SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`,
    [inviteId]
  );
}

// Task functions
export async function getTasksForBoard(boardId: number) {
  const result = await pool.query(`
    SELECT t.*, 
           u.name as assigned_to_name, 
           u.avatar_url as assigned_to_avatar,
           c.name as created_by_name
    FROM tasks t
    LEFT JOIN users u ON t.assigned_to = u.id
    LEFT JOIN users c ON t.created_by = c.id
    WHERE t.board_id = $1
    ORDER BY t.column_name, t.position, t.created_at
  `, [boardId]);
  return result.rows;
}

export async function createTask(
  boardId: number, 
  title: string, 
  createdBy: number,
  options: {
    description?: string;
    column?: string;
    priority?: string;
    assignedTo?: number;
    dueDate?: Date;
    labels?: string[];
  } = {}
) {
  const result = await pool.query(
    `INSERT INTO tasks (board_id, title, description, column_name, priority, assigned_to, created_by, due_date, labels)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      boardId, 
      title, 
      options.description, 
      options.column || 'Backlog',
      options.priority || 'medium',
      options.assignedTo,
      createdBy,
      options.dueDate,
      JSON.stringify(options.labels || [])
    ]
  );
  return result.rows[0];
}

export async function updateTask(taskId: number, updates: Record<string, unknown>) {
  const allowedFields = ['title', 'description', 'notes', 'links', 'column_name', 'position', 'priority', 'assigned_to', 'due_date', 'labels'];
  const setClause: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClause.push(`${key} = $${paramIndex}`);
      values.push((key === 'labels' || key === 'links') ? JSON.stringify(value) : value);
      paramIndex++;
    }
  }

  if (setClause.length === 0) return null;

  setClause.push(`updated_at = NOW()`);
  values.push(taskId);

  const result = await pool.query(
    `UPDATE tasks SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function deleteTask(taskId: number) {
  await pool.query('DELETE FROM tasks WHERE id = $1', [taskId]);
}

export async function getTask(taskId: number) {
  const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  return result.rows[0];
}

// Comments functions
export async function getCommentsForTask(taskId: number) {
  const result = await pool.query(`
    SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.task_id = $1
    ORDER BY c.created_at ASC
  `, [taskId]);
  return result.rows;
}

export async function addComment(taskId: number, userId: number, content: string) {
  const result = await pool.query(`
    WITH inserted AS (
      INSERT INTO comments (task_id, user_id, content)
      VALUES ($1, $2, $3)
      RETURNING *
    )
    SELECT inserted.*, u.name as user_name, u.avatar_url as user_avatar
    FROM inserted
    LEFT JOIN users u ON inserted.user_id = u.id
  `, [taskId, userId, content]);
  return result.rows[0];
}

export async function deleteComment(commentId: number) {
  await pool.query('DELETE FROM comments WHERE id = $1', [commentId]);
}

// Trade comments functions
export async function getTradeComments(tradeId: number) {
  const result = await pool.query(`
    SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
    FROM trade_comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.trade_id = $1
    ORDER BY c.created_at ASC
  `, [tradeId]);
  return result.rows;
}

export async function addTradeComment(tradeId: number, userId: number, content: string) {
  const result = await pool.query(`
    WITH inserted AS (
      INSERT INTO trade_comments (trade_id, user_id, content)
      VALUES ($1, $2, $3)
      RETURNING *
    )
    SELECT inserted.*, u.name as user_name, u.avatar_url as user_avatar
    FROM inserted
    LEFT JOIN users u ON inserted.user_id = u.id
  `, [tradeId, userId, content]);
  return result.rows[0];
}

export async function getStatsForUser(userId: number) {
  const stats = await getDashboardStats(userId);
  return stats;
}

export async function getDashboardStats(userId: number) {
  // Get all board IDs the user has access to
  const boardsResult = await pool.query(
    `SELECT DISTINCT b.id, b.name
     FROM boards b
     LEFT JOIN team_members tm ON b.team_id = tm.team_id
     WHERE b.owner_id = $1 OR tm.user_id = $1`,
    [userId]
  );
  const boardIds = boardsResult.rows.map(r => r.id);
  const boardNames: Record<number, string> = {};
  boardsResult.rows.forEach(r => { boardNames[r.id] = r.name; });

  const empty = {
    total: 0, byStatus: {} as Record<string, number>, byPriority: {} as Record<string, number>,
    recentlyCompleted: 0, tasksCreatedThisWeek: 0, tasksCompletedThisWeek: 0,
    avgCompletionDays: 0, mostActiveBoard: '', overdueCount: 0,
    perBoardStats: [] as { boardId: number; boardName: string; total: number; done: number; inProgress: number; backlog: number }[],
    dailyCompleted: [] as { date: string; count: number }[],
    dailyCreated: [] as { date: string; count: number }[],
    recentActivity: [] as { taskTitle: string; boardName: string; action: string; userName: string; timestamp: string }[],
  };

  if (boardIds.length === 0) return empty;

  const client = await pool.connect();
  try {
    // By status
    const statusResult = await client.query(
      `SELECT column_name, COUNT(*) as count FROM tasks WHERE board_id = ANY($1) GROUP BY column_name`,
      [boardIds]
    );
    const byStatus: Record<string, number> = {};
    statusResult.rows.forEach(r => { byStatus[r.column_name] = parseInt(r.count); });

    // By priority
    const priorityResult = await client.query(
      `SELECT priority, COUNT(*) as count FROM tasks WHERE board_id = ANY($1) GROUP BY priority`,
      [boardIds]
    );
    const byPriority: Record<string, number> = {};
    priorityResult.rows.forEach(r => { byPriority[r.priority] = parseInt(r.count); });

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

    // Completed this week
    const completedWeek = await client.query(
      `SELECT COUNT(*) as count FROM tasks WHERE board_id = ANY($1) AND column_name = 'Done' AND updated_at > NOW() - INTERVAL '7 days'`,
      [boardIds]
    );
    const tasksCompletedThisWeek = parseInt(completedWeek.rows[0]?.count || '0');

    // Created this week
    const createdWeek = await client.query(
      `SELECT COUNT(*) as count FROM tasks WHERE board_id = ANY($1) AND created_at > NOW() - INTERVAL '7 days'`,
      [boardIds]
    );
    const tasksCreatedThisWeek = parseInt(createdWeek.rows[0]?.count || '0');

    // Avg completion days
    const avgResult = await client.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400) as avg_days
       FROM tasks WHERE board_id = ANY($1) AND column_name = 'Done'`,
      [boardIds]
    );
    const avgCompletionDays = parseFloat(parseFloat(avgResult.rows[0]?.avg_days || '0').toFixed(1));

    // Most active board (most tasks updated in last 7 days)
    const activeBoard = await client.query(
      `SELECT board_id, COUNT(*) as cnt FROM tasks
       WHERE board_id = ANY($1) AND updated_at > NOW() - INTERVAL '7 days'
       GROUP BY board_id ORDER BY cnt DESC LIMIT 1`,
      [boardIds]
    );
    const mostActiveBoard = activeBoard.rows[0] ? (boardNames[activeBoard.rows[0].board_id] || '') : '';

    // Overdue
    const overdueResult = await client.query(
      `SELECT COUNT(*) as count FROM tasks
       WHERE board_id = ANY($1) AND due_date < NOW() AND column_name != 'Done'`,
      [boardIds]
    );
    const overdueCount = parseInt(overdueResult.rows[0]?.count || '0');

    // Per board stats
    const perBoardResult = await client.query(
      `SELECT board_id, column_name, COUNT(*) as count FROM tasks
       WHERE board_id = ANY($1) GROUP BY board_id, column_name`,
      [boardIds]
    );
    const boardMap: Record<number, { done: number; inProgress: number; backlog: number; total: number }> = {};
    boardIds.forEach(id => { boardMap[id] = { done: 0, inProgress: 0, backlog: 0, total: 0 }; });
    perBoardResult.rows.forEach(r => {
      const bid = r.board_id;
      const cnt = parseInt(r.count);
      if (!boardMap[bid]) boardMap[bid] = { done: 0, inProgress: 0, backlog: 0, total: 0 };
      boardMap[bid].total += cnt;
      if (r.column_name === 'Done') boardMap[bid].done += cnt;
      else if (r.column_name === 'In Progress') boardMap[bid].inProgress += cnt;
      else boardMap[bid].backlog += cnt;
    });
    const perBoardStats = boardIds.map(id => ({
      boardId: id, boardName: boardNames[id] || '', ...boardMap[id],
    }));

    // Daily completed (14 days)
    const dailyCompletedResult = await client.query(
      `SELECT DATE(updated_at) as date, COUNT(*) as count FROM tasks
       WHERE board_id = ANY($1) AND column_name = 'Done' AND updated_at > NOW() - INTERVAL '14 days'
       GROUP BY DATE(updated_at) ORDER BY date`,
      [boardIds]
    );
    const dailyCompleted = dailyCompletedResult.rows.map(r => ({
      date: r.date.toISOString().split('T')[0], count: parseInt(r.count),
    }));

    // Daily created (14 days)
    const dailyCreatedResult = await client.query(
      `SELECT DATE(created_at) as date, COUNT(*) as count FROM tasks
       WHERE board_id = ANY($1) AND created_at > NOW() - INTERVAL '14 days'
       GROUP BY DATE(created_at) ORDER BY date`,
      [boardIds]
    );
    const dailyCreated = dailyCreatedResult.rows.map(r => ({
      date: r.date.toISOString().split('T')[0], count: parseInt(r.count),
    }));

    // Recent activity
    const activityResult = await client.query(
      `SELECT t.title as task_title, t.column_name, t.updated_at, b.name as board_name,
              COALESCE(u.name, 'Someone') as user_name
       FROM tasks t
       JOIN boards b ON t.board_id = b.id
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.board_id = ANY($1)
       ORDER BY t.updated_at DESC LIMIT 15`,
      [boardIds]
    );
    const recentActivity = activityResult.rows.map(r => ({
      taskTitle: r.task_title,
      boardName: r.board_name,
      action: `moved to ${r.column_name}`,
      userName: r.user_name,
      timestamp: r.updated_at.toISOString(),
    }));

    return {
      total, byStatus, byPriority,
      recentlyCompleted: tasksCompletedThisWeek,
      tasksCreatedThisWeek, tasksCompletedThisWeek,
      avgCompletionDays, mostActiveBoard, overdueCount,
      perBoardStats, dailyCompleted, dailyCreated, recentActivity,
    };
  } finally {
    client.release();
  }
}

// Task file functions
export async function getFilesForTask(taskId: number) {
  const result = await pool.query(`
    SELECT tf.*, u.name as uploaded_by_name
    FROM task_files tf
    LEFT JOIN users u ON tf.uploaded_by = u.id
    WHERE tf.task_id = $1
    ORDER BY tf.created_at DESC
  `, [taskId]);
  return result.rows;
}

export async function addFile(taskId: number, userId: number, filename: string, originalName: string, mimeType: string, sizeBytes: number) {
  const result = await pool.query(`
    WITH inserted AS (
      INSERT INTO task_files (task_id, uploaded_by, filename, original_name, mime_type, size_bytes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    )
    SELECT inserted.*, u.name as uploaded_by_name
    FROM inserted
    LEFT JOIN users u ON inserted.uploaded_by = u.id
  `, [taskId, userId, filename, originalName, mimeType, sizeBytes]);
  return result.rows[0];
}

export async function getFile(fileId: number) {
  const result = await pool.query('SELECT * FROM task_files WHERE id = $1', [fileId]);
  return result.rows[0];
}

export async function deleteFile(fileId: number) {
  const result = await pool.query('DELETE FROM task_files WHERE id = $1 RETURNING *', [fileId]);
  return result.rows[0];
}

// ============================================
// Bot functions
// ============================================

export async function createBot(data: {
  name: string;
  board_id: number;
  user_id: number;
  strategy_style: string;
  strategy_substyle: string;
  strategy_config?: any;
  auto_trade?: boolean;
  rebalancer_enabled?: boolean;
  rebalancer_config?: any;
}): Promise<any> {
  const result = await pool.query(
    `INSERT INTO trading_bots
      (name, board_id, user_id, strategy_style, strategy_substyle, strategy_config, auto_trade, rebalancer_enabled, rebalancer_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      data.name,
      data.board_id,
      data.user_id,
      data.strategy_style,
      data.strategy_substyle,
      JSON.stringify(data.strategy_config ?? {}),
      data.auto_trade ?? false,
      data.rebalancer_enabled ?? false,
      JSON.stringify(data.rebalancer_config ?? {})
    ]
  );
  return result.rows[0];
}

export async function getBot(id: number): Promise<any> {
  const result = await pool.query('SELECT * FROM trading_bots WHERE id = $1', [id]);
  return result.rows[0];
}

export async function getBotsByUser(userId: number): Promise<any[]> {
  const result = await pool.query(
    'SELECT * FROM trading_bots WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

export async function getBotsByBoard(boardId: number): Promise<any[]> {
  const result = await pool.query(
    'SELECT * FROM trading_bots WHERE board_id = $1 ORDER BY created_at DESC',
    [boardId]
  );
  return result.rows;
}

export async function updateBot(
  id: number,
  data: Partial<{
    name: string;
    strategy_config: any;
    status: string;
    auto_trade: boolean;
    tbo_enabled: boolean;
    rebalancer_enabled: boolean;
    rebalancer_config: any;
    performance: any;
    metadata: any;
  }>
): Promise<any> {
  const allowedFields = [
    'name',
    'strategy_config',
    'status',
    'auto_trade',
    'tbo_enabled',
    'rebalancer_enabled',
    'rebalancer_config',
    'performance',
    'metadata'
  ];

  const setClause: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(data)) {
    if (!allowedFields.includes(key)) continue;
    setClause.push(`${key} = $${paramIndex}`);
    if (['strategy_config', 'rebalancer_config', 'performance'].includes(key)) {
      values.push(JSON.stringify(value ?? {}));
    } else {
      values.push(value);
    }
    paramIndex++;
  }

  if (!setClause.length) return null;
  setClause.push('updated_at = NOW()');
  values.push(id);

  const result = await pool.query(
    `UPDATE trading_bots SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function deleteBot(id: number): Promise<void> {
  await pool.query('DELETE FROM trading_bots WHERE id = $1', [id]);
}

export async function startBot(id: number): Promise<any> {
  return updateBot(id, { status: 'running' });
}

export async function stopBot(id: number): Promise<any> {
  return updateBot(id, { status: 'stopped' });
}

export async function pauseBot(id: number): Promise<any> {
  return updateBot(id, { status: 'paused' });
}

export async function logBotExecution(botId: number, action: string, details?: any): Promise<any> {
  const result = await pool.query(
    `INSERT INTO bot_executions (bot_id, action, details)
     VALUES ($1, $2, $3) RETURNING *`,
    [botId, action, JSON.stringify(details ?? {})]
  );
  return result.rows[0];
}

export async function getBotExecutions(botId: number, limit: number = 50): Promise<any[]> {
  const result = await pool.query(
    `SELECT * FROM bot_executions WHERE bot_id = $1 ORDER BY executed_at DESC LIMIT $2`,
    [botId, limit]
  );
  return result.rows;
}

export async function getRecentBotExecutionsForUser(userId: number, limit: number = 10): Promise<any[]> {
  const result = await pool.query(
    `
      SELECT be.*, tb.name as bot_name, b.name as board_name
      FROM bot_executions be
      JOIN trading_bots tb ON tb.id = be.bot_id
      JOIN boards b ON b.id = tb.board_id
      LEFT JOIN team_members tm ON b.team_id = tm.team_id AND tm.user_id = $1
      WHERE (b.owner_id = $1 OR tm.user_id = $1)
        AND b.board_type = 'trading'
        AND (b.visibility IS NULL OR b.visibility <> 'admin_only' OR tm.role IN ('admin', 'owner') OR b.owner_id = $1)
      ORDER BY be.executed_at DESC
      LIMIT $2
    `,
    [userId, limit]
  );
  return result.rows;
}

export async function savePortfolioSnapshot(botId: number, allocations: any, totalValue: number): Promise<any> {
  const result = await pool.query(
    `INSERT INTO portfolio_snapshots (bot_id, allocations, total_value)
     VALUES ($1, $2, $3) RETURNING *`,
    [botId, JSON.stringify(allocations), totalValue]
  );
  return result.rows[0];
}

export async function getPortfolioSnapshots(botId: number, limit: number = 50): Promise<any[]> {
  const result = await pool.query(
    `SELECT * FROM portfolio_snapshots WHERE bot_id = $1 ORDER BY snapshot_at DESC LIMIT $2`,
    [botId, limit]
  );
  return result.rows;
}

export async function getLatestPortfolioSnapshot(botId: number): Promise<any> {
  const result = await pool.query(
    `SELECT * FROM portfolio_snapshots WHERE bot_id = $1 ORDER BY snapshot_at DESC LIMIT 1`,
    [botId]
  );
  return result.rows[0];
}

export async function updateLeaderboard(
  botId: number,
  period: string,
  stats: {
    total_return: number;
    win_rate: number;
    total_trades: number;
    sharpe_ratio?: number;
    max_drawdown?: number;
  }
): Promise<any> {
  const result = await pool.query(
    `
      INSERT INTO bot_leaderboard
        (bot_id, period, total_return, win_rate, total_trades, sharpe_ratio, max_drawdown)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (bot_id, period) DO UPDATE SET
        total_return = EXCLUDED.total_return,
        win_rate = EXCLUDED.win_rate,
        total_trades = EXCLUDED.total_trades,
        sharpe_ratio = EXCLUDED.sharpe_ratio,
        max_drawdown = EXCLUDED.max_drawdown,
        updated_at = NOW()
      RETURNING *
    `,
    [
      botId,
      period,
      stats.total_return,
      stats.win_rate,
      stats.total_trades,
      stats.sharpe_ratio ?? null,
      stats.max_drawdown ?? null
    ]
  );
  return result.rows[0];
}

export async function getLeaderboard(period?: string): Promise<any[]> {
  const values: unknown[] = [];
  let where = '';
  if (period) {
    where = 'WHERE bl.period = $1';
    values.push(period);
  }

  const result = await pool.query(
    `
      SELECT bl.*, tb.name, tb.strategy_style, tb.strategy_substyle, tb.status, tb.auto_trade
      FROM bot_leaderboard bl
      JOIN trading_bots tb ON tb.id = bl.bot_id
      ${where}
      ORDER BY bl.total_return DESC NULLS LAST, bl.win_rate DESC NULLS LAST
    `,
    values
  );
  return result.rows;
}

// ============================================
// Trading functions
// ============================================

export async function createTrade(boardId: number, userId: number, data: Record<string, unknown>) {
  const fields = [
    'coin_pair', 'direction', 'entry_price', 'current_price', 'exit_price',
    'stop_loss', 'take_profit', 'position_size', 'tbo_signal', 'rsi_value',
    'macd_status', 'volume_assessment', 'confidence_score', 'pnl_dollar',
    'pnl_percent', 'bot_id', 'priority', 'pause_reason', 'lesson_tag',
    'notes', 'links', 'status', 'column_name'
  ];
  const cols = ['board_id', 'created_by'];
  const vals: unknown[] = [boardId, userId];
  let idx = 3;

  for (const f of fields) {
    if (data[f] !== undefined) {
      cols.push(f);
      vals.push(f === 'links' ? JSON.stringify(data[f]) : data[f]);
      idx++;
    }
  }

  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
  const result = await pool.query(
    `INSERT INTO trades (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    vals
  );
  return result.rows[0];
}

export async function getTrade(tradeId: number) {
  const result = await pool.query(`
    SELECT t.*, u.name as created_by_name, b.name as board_name
    FROM trades t
    LEFT JOIN users u ON t.created_by = u.id
    LEFT JOIN boards b ON t.board_id = b.id
    WHERE t.id = $1
  `, [tradeId]);
  return result.rows[0];
}

export async function updateTrade(tradeId: number, updates: Record<string, unknown>) {
  const allowedFields = [
    'column_name', 'coin_pair', 'direction', 'entry_price', 'current_price',
    'exit_price', 'stop_loss', 'take_profit', 'position_size', 'tbo_signal',
    'rsi_value', 'macd_status', 'volume_assessment', 'confidence_score',
    'pnl_dollar', 'pnl_percent', 'bot_id', 'priority', 'pause_reason',
    'lesson_tag', 'notes', 'links', 'trade_settings', 'status', 'entered_at', 'exited_at'
  ];
  const setClause: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClause.push(`${key} = $${paramIndex}`);
      values.push(['links', 'trade_settings'].includes(key) ? JSON.stringify(value) : value);
      paramIndex++;
    }
  }

  if (setClause.length === 0) return null;
  setClause.push(`updated_at = NOW()`);
  values.push(tradeId);

  const result = await pool.query(
    `UPDATE trades SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function deleteTrade(tradeId: number) {
  await pool.query('DELETE FROM trades WHERE id = $1', [tradeId]);
}

export async function getTradesForBoard(boardId: number) {
  const result = await pool.query(`
    SELECT t.*, u.name as created_by_name
    FROM trades t
    LEFT JOIN users u ON t.created_by = u.id
    WHERE t.board_id = $1
    ORDER BY t.column_name, t.created_at
  `, [boardId]);
  return result.rows;
}

export async function moveTrade(tradeId: number, toColumn: string, actorType: string, actorName: string) {
  const trade = await getTrade(tradeId);
  if (!trade) return null;

  const fromColumn = trade.column_name;
  const updates: Record<string, unknown> = { column_name: toColumn };

  // Auto-set timestamps and status based on column
  if (toColumn === 'Active' && !trade.entered_at) {
    updates.entered_at = new Date().toISOString();
    updates.status = 'active';
  } else if (toColumn === 'Wins' || toColumn === 'Losses') {
    updates.exited_at = new Date().toISOString();
    updates.status = toColumn === 'Wins' ? 'won' : 'lost';
  } else if (toColumn === 'Parked') {
    updates.status = 'parked';
  } else if (toColumn === 'Watchlist') {
    updates.status = 'watching';
  } else if (toColumn === 'Analyzing') {
    updates.status = 'analyzing';
  }

  const updated = await updateTrade(tradeId, updates);
  await logTradeActivity(tradeId, 'move', fromColumn, toColumn, actorType, actorName, null);
  return updated;
}

export async function logTradeActivity(
  tradeId: number, action: string, fromCol: string | null,
  toCol: string | null, actorType: string, actorName: string, details: unknown
) {
  const result = await pool.query(
    `INSERT INTO trade_activity (trade_id, action, from_column, to_column, actor_type, actor_name, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [tradeId, action, fromCol, toCol, actorType, actorName, details ? JSON.stringify(details) : null]
  );
  return result.rows[0];
}

export async function getTradeActivity(tradeId: number) {
  const result = await pool.query(
    `SELECT * FROM trade_activity WHERE trade_id = $1 ORDER BY created_at DESC`,
    [tradeId]
  );
  return result.rows;
}

export async function getBotActivityForBoard(boardId: number, limit: number = 20) {
  const result = await pool.query(
    `
      SELECT ta.*, t.coin_pair, t.confidence_score
      FROM trade_activity ta
      JOIN trades t ON ta.trade_id = t.id
      WHERE t.board_id = $1 AND ta.actor_type = 'bot'
      ORDER BY ta.created_at DESC
      LIMIT $2
    `,
    [boardId, limit]
  );
  return result.rows;
}

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePair(pair: string) {
  return pair.replace(/-/g, '/').toUpperCase();
}

function formatJournalNumber(value: number) {
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return value.toFixed(decimals);
}

function formatJournalCurrency(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(2)}`;
}

function computePnl(
  entryPrice: unknown,
  exitPrice: unknown,
  positionSize: unknown,
  direction: unknown
): { pnlDollar: number; pnlPercent: number } | null {
  const entry = parseNumeric(entryPrice);
  const exit = parseNumeric(exitPrice);
  const size = parseNumeric(positionSize);
  if (entry === null || exit === null || size === null) return null;

  const isShort = String(direction || '').toLowerCase() === 'short';
  const perUnit = isShort ? entry - exit : exit - entry;
  // size is in dollars (e.g. $200), not coin quantity
  const pnlPercent = entry !== 0 ? (perUnit / entry) * 100 : 0;
  const pnlDollar = (pnlPercent / 100) * size;
  return { pnlDollar, pnlPercent };
}

export async function enterTrade(tradeId: number, entryPrice: number | null, userId: number) {
  const trade = await getTrade(tradeId);
  if (!trade) return null;

  const finalEntryPrice = entryPrice ?? parseNumeric(trade.current_price);
  if (finalEntryPrice === null) {
    throw new Error('ENTRY_PRICE_REQUIRED');
  }

  const positionSize = parseNumeric(trade.position_size);
  if (positionSize !== null && positionSize > 0) {
    await updatePaperBalance(trade.board_id, userId, -positionSize);
  }

  const updates: Record<string, unknown> = {
    entry_price: finalEntryPrice,
    entered_at: new Date().toISOString(),
    status: 'active',
    column_name: 'Active'
  };
  if (trade.current_price === null || trade.current_price === undefined) {
    updates.current_price = finalEntryPrice;
  }

  const updated = await updateTrade(tradeId, updates);
  const user = await getUserById(userId);
  await logTradeActivity(
    tradeId,
    'ENTERED',
    trade.column_name,
    'Active',
    'user',
    user?.name || 'Unknown',
    { entry_price: finalEntryPrice, direction: trade.direction, position_size: trade.position_size }
  );
  await addJournalEntry(
    tradeId,
    'note',
    `Entered at $${formatJournalNumber(finalEntryPrice)}`,
    null,
    userId
  );
  return updated;
}

export async function exitTrade(tradeId: number, exitPrice: number, lessonTag: string | null, userId: number) {
  const trade = await getTrade(tradeId);
  if (!trade) return null;

  if (exitPrice === null || exitPrice === undefined) {
    throw new Error('EXIT_PRICE_REQUIRED');
  }

  if (trade.entry_price === null || trade.entry_price === undefined) {
    throw new Error('ENTRY_PRICE_REQUIRED');
  }

  const pnl = computePnl(trade.entry_price, exitPrice, trade.position_size, trade.direction);
  const pnlDollar = pnl ? pnl.pnlDollar : null;
  const pnlPercent = pnl ? pnl.pnlPercent : null;
  const toColumn = pnlDollar !== null && pnlDollar < 0 ? 'Losses' : 'Wins';

  const updates: Record<string, unknown> = {
    exit_price: exitPrice,
    exited_at: new Date().toISOString(),
    pnl_dollar: pnlDollar,
    pnl_percent: pnlPercent,
    status: 'closed',
    column_name: toColumn
  };
  if (lessonTag) {
    updates.lesson_tag = lessonTag;
  }

  const updated = await updateTrade(tradeId, updates);
  const positionSize = parseNumeric(trade.position_size);
  if (positionSize !== null && positionSize > 0) {
    const balanceDelta = positionSize + (pnlDollar ?? 0);
    await updatePaperBalance(trade.board_id, userId, balanceDelta, 10000, true);
  }
  const user = await getUserById(userId);
  await logTradeActivity(
    tradeId,
    'EXITED',
    trade.column_name,
    toColumn,
    'user',
    user?.name || 'Unknown',
    { exit_price: exitPrice, pnl_dollar: pnlDollar, pnl_percent: pnlPercent, lesson_tag: lessonTag || null }
  );
  const pnlText = `${formatJournalCurrency(pnlDollar)} (${pnlPercent !== null ? pnlPercent.toFixed(2) : '—'}%)`;
  await addJournalEntry(
    tradeId,
    'note',
    `Exited at $${formatJournalNumber(exitPrice)}, P&L: ${pnlText}`,
    null,
    userId
  );
  return updated;
}

export async function parkTrade(tradeId: number, pauseReason: string, userId: number) {
  const trade = await getTrade(tradeId);
  if (!trade) return null;
  if (!pauseReason) {
    throw new Error('PAUSE_REASON_REQUIRED');
  }

  const updated = await updateTrade(tradeId, {
    column_name: 'Parked',
    status: 'parked',
    pause_reason: pauseReason
  });

  const user = await getUserById(userId);
  await logTradeActivity(
    tradeId,
    'PARKED',
    trade.column_name,
    'Parked',
    'user',
    user?.name || 'Unknown',
    { pause_reason: pauseReason }
  );
  await addJournalEntry(
    tradeId,
    'note',
    `Parked: ${pauseReason}`,
    null,
    userId
  );
  return updated;
}

export async function updateTradeSignals(
  tradeId: number,
  signals: {
    tbo_signal?: string;
    rsi_value?: number;
    macd_status?: string;
    volume_assessment?: string;
    confidence_score?: number;
    current_price?: number;
  },
  userId: number
) {
  const trade = await getTrade(tradeId);
  if (!trade) return null;

  const updates: Record<string, unknown> = {};
  if (signals.tbo_signal !== undefined) updates.tbo_signal = signals.tbo_signal;
  if (signals.rsi_value !== undefined) updates.rsi_value = signals.rsi_value;
  if (signals.macd_status !== undefined) updates.macd_status = signals.macd_status;
  if (signals.volume_assessment !== undefined) updates.volume_assessment = signals.volume_assessment;
  if (signals.confidence_score !== undefined) updates.confidence_score = signals.confidence_score;
  if (signals.current_price !== undefined) updates.current_price = signals.current_price;

  if (signals.current_price !== undefined && trade.status === 'active') {
    const pnl = computePnl(trade.entry_price, signals.current_price, trade.position_size, trade.direction);
    if (pnl) {
      updates.pnl_dollar = pnl.pnlDollar;
      updates.pnl_percent = pnl.pnlPercent;
    }
  }

  const updated = await updateTrade(tradeId, updates);
  const user = await getUserById(userId);
  await logTradeActivity(
    tradeId,
    'SIGNAL_UPDATE',
    trade.column_name,
    trade.column_name,
    'bot',
    user?.name || 'Bot',
    signals
  );
  return updated;
}

export async function getAlertsForBoard(boardId: number) {
  const result = await pool.query(
    `
      SELECT ta.*, t.coin_pair
      FROM trade_alerts ta
      LEFT JOIN trades t ON ta.trade_id = t.id
      WHERE ta.board_id = $1
      ORDER BY ta.created_at DESC
    `,
    [boardId]
  );
  return result.rows;
}

export async function createAlert(
  boardId: number,
  tradeId: number | null,
  alertType: string,
  conditionValue: number | null,
  conditionOperator: string | null,
  message: string | null,
  userId: number
) {
  const result = await pool.query(
    `
      INSERT INTO trade_alerts (board_id, trade_id, alert_type, condition_value, condition_operator, message, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [boardId, tradeId, alertType, conditionValue, conditionOperator, message, userId]
  );
  return result.rows[0];
}

export async function updateAlert(alertId: number, updates: Record<string, unknown>) {
  const allowedFields = [
    'alert_type',
    'trade_id',
    'condition_value',
    'condition_operator',
    'message',
    'triggered',
    'triggered_at'
  ];
  const setClause: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClause.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex += 1;
    }
  }

  if (!setClause.length) return null;
  values.push(alertId);

  const result = await pool.query(
    `UPDATE trade_alerts SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0];
}

function compareWithOperator(value: number, operator: string, target: number) {
  switch (operator) {
    case '>':
      return value > target;
    case '>=':
      return value >= target;
    case '<':
      return value < target;
    case '<=':
      return value <= target;
    case '=':
    case '==':
      return value === target;
    default:
      return value > target;
  }
}

function resolvePriceFromMap(prices: Record<string, number>, pair: string) {
  const normalized = normalizePair(pair);
  return prices[normalized] ?? prices[normalized.replace('/', '-')] ?? prices[pair] ?? null;
}

export async function checkAlerts(boardId: number, prices: Record<string, number>) {
  const alertsResult = await pool.query(
    `SELECT * FROM trade_alerts WHERE board_id = $1 AND triggered = false`,
    [boardId]
  );
  const alerts = alertsResult.rows;
  if (!alerts.length) return [];

  const tradesResult = await pool.query(
    `
      SELECT id, coin_pair, direction, entry_price, current_price, stop_loss, pnl_percent, position_size, confidence_score
      FROM trades
      WHERE board_id = $1
    `,
    [boardId]
  );

  const tradeMap = new Map<number, Record<string, unknown>>();
  tradesResult.rows.forEach((trade) => tradeMap.set(trade.id, trade));

  const triggeredAlerts: Record<string, unknown>[] = [];
  const triggeredIds: number[] = [];

  for (const alert of alerts) {
    const tradeId = alert.trade_id ? Number(alert.trade_id) : null;
    const trade = tradeId ? tradeMap.get(tradeId) : null;
    if (tradeId && !trade) continue;

    const alertType = String(alert.alert_type || '');
    const operator = String(alert.condition_operator || '').trim();
    const conditionValue = parseNumeric(alert.condition_value);
    const tradePair = trade ? String(trade.coin_pair || '') : '';
    const livePrice = tradePair ? resolvePriceFromMap(prices, tradePair) : null;
    const currentPrice = livePrice ?? parseNumeric(trade?.current_price);

    let shouldTrigger = false;

    if (alertType === 'price_above' && currentPrice !== null && conditionValue !== null) {
      shouldTrigger = currentPrice > conditionValue;
    }

    if (alertType === 'price_below' && currentPrice !== null && conditionValue !== null) {
      shouldTrigger = currentPrice < conditionValue;
    }

    if (alertType === 'pnl_target' && trade && conditionValue !== null) {
      const pnl = currentPrice !== null
        ? computePnl(trade.entry_price, currentPrice, trade.position_size, trade.direction)
        : null;
      const pnlPercent = parseNumeric(trade.pnl_percent) ?? pnl?.pnlPercent ?? null;
      if (pnlPercent !== null) {
        shouldTrigger = compareWithOperator(pnlPercent, operator || '>', conditionValue);
      }
    }

    if (alertType === 'stop_loss_hit' && trade && currentPrice !== null) {
      const stopLoss = parseNumeric(trade.stop_loss);
      if (stopLoss !== null) {
        const direction = String(trade.direction || '').toLowerCase();
        if (direction === 'short') {
          shouldTrigger = currentPrice >= stopLoss;
        } else {
          shouldTrigger = currentPrice <= stopLoss;
        }
      }
    }

    if (alertType === 'confidence_change' && trade && conditionValue !== null) {
      const confidence = parseNumeric(trade.confidence_score);
      if (confidence !== null) {
        shouldTrigger = compareWithOperator(confidence, operator || '>', conditionValue);
      }
    }

    if (shouldTrigger) {
      triggeredIds.push(Number(alert.id));
      triggeredAlerts.push({
        ...alert,
        triggered: true,
        triggered_at: new Date().toISOString(),
        coin_pair: tradePair || null
      });
    }
  }

  if (triggeredIds.length) {
    await pool.query(
      `UPDATE trade_alerts SET triggered = true, triggered_at = NOW() WHERE id = ANY($1::int[])`,
      [triggeredIds]
    );
  }

  return triggeredAlerts;
}

export async function deleteAlert(alertId: number) {
  await pool.query('DELETE FROM trade_alerts WHERE id = $1', [alertId]);
}

export async function getJournalEntries(tradeId: number) {
  const result = await pool.query(
    `
      SELECT tj.*, u.name as created_by_name
      FROM trade_journal tj
      LEFT JOIN users u ON tj.created_by = u.id
      WHERE tj.trade_id = $1
      ORDER BY tj.created_at DESC
    `,
    [tradeId]
  );
  return result.rows;
}

export async function addJournalEntry(
  tradeId: number,
  entryType: string,
  content: string,
  mood: string | null,
  userId: number
) {
  const result = await pool.query(
    `
      INSERT INTO trade_journal (trade_id, entry_type, content, mood, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [tradeId, entryType, content, mood, userId]
  );
  return result.rows[0];
}

export async function getTradeJournalForUser(userId: number, limit: number = 200) {
  const result = await pool.query(
    `
      SELECT tj.*, u.name as created_by_name, t.coin_pair, t.board_id, b.name as board_name
      FROM trade_journal tj
      JOIN trades t ON t.id = tj.trade_id
      JOIN boards b ON b.id = t.board_id
      LEFT JOIN users u ON tj.created_by = u.id
      LEFT JOIN team_members tm ON b.team_id = tm.team_id AND tm.user_id = $1
      WHERE (b.owner_id = $1 OR tm.user_id = $1)
        AND b.board_type = 'trading'
        AND (b.visibility IS NULL OR b.visibility <> 'admin_only' OR tm.role IN ('admin', 'owner') OR b.owner_id = $1)
      ORDER BY tj.created_at DESC
      LIMIT $2
    `,
    [userId, limit]
  );
  return result.rows;
}

export async function updateActiveTradePrices(prices: Record<string, number>) {
  const result = await pool.query(
    `SELECT id, coin_pair, entry_price, direction, position_size
     FROM trades
     WHERE status = 'active'`
  );

  let updatedCount = 0;

  for (const trade of result.rows) {
    const pair = String(trade.coin_pair || '').toUpperCase();
    const directPrice = prices[pair];
    const altPrice = prices[pair.replace('/', '-')];
    const price = directPrice ?? altPrice;
    if (price === undefined) continue;

    const pnl = computePnl(trade.entry_price, price, trade.position_size, trade.direction);
    await pool.query(
      `UPDATE trades
       SET current_price = $1,
           pnl_dollar = $2,
           pnl_percent = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [price, pnl?.pnlDollar ?? null, pnl?.pnlPercent ?? null, trade.id]
    );
    updatedCount += 1;
  }

  return updatedCount;
}

export async function scanTrades(
  boardId: number,
  scans: Array<{
    coin_pair: string;
    direction?: string;
    tbo_signal?: string;
    confidence_score?: number;
    rsi_value?: number;
    notes?: string;
  }>,
  userId: number
) {
  if (!scans.length) return [];

  const user = await getUserById(userId);
  const actorName = user?.name || 'Bot';
  const coinPairs = scans.map((scan) => scan.coin_pair).filter(Boolean);

  const existingResult = await pool.query(
    `SELECT * FROM trades WHERE board_id = $1 AND coin_pair = ANY($2)`,
    [boardId, coinPairs]
  );

  const existingByPair = new Map<string, Record<string, unknown>>();
  for (const row of existingResult.rows) {
    existingByPair.set(row.coin_pair, row);
  }

  const results: Record<string, unknown>[] = [];

  for (const scan of scans) {
    if (!scan.coin_pair) continue;
    const existing = existingByPair.get(scan.coin_pair) as Record<string, unknown> | undefined;

    if (existing) {
      const updates: Record<string, unknown> = {};
      if (scan.direction !== undefined) updates.direction = scan.direction;
      if (scan.tbo_signal !== undefined) updates.tbo_signal = scan.tbo_signal;
      if (scan.confidence_score !== undefined) updates.confidence_score = scan.confidence_score;
      if (scan.rsi_value !== undefined) updates.rsi_value = scan.rsi_value;
      if (scan.notes !== undefined) updates.notes = scan.notes;

      const updated = Object.keys(updates).length > 0
        ? await updateTrade(Number(existing.id), updates)
        : existing;

      await logTradeActivity(
        Number(existing.id),
        'SCANNED',
        (existing.column_name as string | null) ?? null,
        (existing.column_name as string | null) ?? null,
        'bot',
        actorName,
        updates
      );
      results.push(updated || existing);
    } else {
      const created = await createTrade(boardId, userId, {
        coin_pair: scan.coin_pair,
        direction: scan.direction,
        tbo_signal: scan.tbo_signal,
        confidence_score: scan.confidence_score,
        rsi_value: scan.rsi_value,
        notes: scan.notes,
        status: 'watching',
        column_name: 'Watchlist'
      });

      await logTradeActivity(
        created.id,
        'SCANNED',
        null,
        'Watchlist',
        'bot',
        actorName,
        scan
      );
      results.push(created);
    }
  }

  return results;
}

export async function getBoardTradingStats(boardId: number) {
  const totalsResult = await pool.query(
    `
      SELECT
        COUNT(*)::int as total_trades,
        COUNT(*) FILTER (WHERE status = 'active')::int as active_trades,
        COUNT(*) FILTER (WHERE column_name = 'Wins')::int as wins,
        COUNT(*) FILTER (WHERE column_name = 'Losses')::int as losses,
        COALESCE(SUM(CASE WHEN column_name IN ('Wins', 'Losses') OR status IN ('closed', 'won', 'lost') THEN COALESCE(pnl_dollar, 0) END), 0) as total_pnl,
        COALESCE(AVG(CASE WHEN pnl_dollar > 0 THEN pnl_dollar END), 0) as avg_win,
        COALESCE(AVG(CASE WHEN pnl_dollar < 0 THEN pnl_dollar END), 0) as avg_loss,
        COALESCE(MAX(CASE WHEN column_name IN ('Wins', 'Losses') OR status IN ('closed', 'won', 'lost') THEN pnl_dollar END), 0) as best_trade,
        COALESCE(MIN(CASE WHEN column_name IN ('Wins', 'Losses') OR status IN ('closed', 'won', 'lost') THEN pnl_dollar END), 0) as worst_trade
      FROM trades WHERE board_id = $1
    `,
    [boardId]
  );

  const totals = totalsResult.rows[0] || {};
  const wins = Number(totals.wins || 0);
  const losses = Number(totals.losses || 0);
  const closedTrades = wins + losses;
  const winRate = closedTrades > 0 ? (wins / closedTrades) * 100 : 0;

  const byCoinResult = await pool.query(
    `
      SELECT
        coin_pair,
        COUNT(*)::int as total_trades,
        COUNT(*) FILTER (WHERE column_name = 'Wins')::int as wins,
        COUNT(*) FILTER (WHERE column_name = 'Losses')::int as losses,
        COALESCE(SUM(CASE WHEN column_name IN ('Wins', 'Losses') OR status IN ('closed', 'won', 'lost') THEN COALESCE(pnl_dollar, 0) END), 0) as total_pnl,
        COALESCE(AVG(CASE WHEN pnl_dollar > 0 THEN pnl_dollar END), 0) as avg_win,
        COALESCE(AVG(CASE WHEN pnl_dollar < 0 THEN pnl_dollar END), 0) as avg_loss
      FROM trades WHERE board_id = $1
      GROUP BY coin_pair
      ORDER BY coin_pair
    `,
    [boardId]
  );

  const byCoin = byCoinResult.rows.map((row) => {
    const winsByCoin = Number(row.wins || 0);
    const lossesByCoin = Number(row.losses || 0);
    const closedByCoin = winsByCoin + lossesByCoin;
    return {
      coin_pair: row.coin_pair,
      total_trades: Number(row.total_trades || 0),
      wins: winsByCoin,
      losses: lossesByCoin,
      win_rate: closedByCoin > 0 ? (winsByCoin / closedByCoin) * 100 : 0,
      total_pnl: parseNumeric(row.total_pnl) || 0,
      avg_win: parseNumeric(row.avg_win) || 0,
      avg_loss: parseNumeric(row.avg_loss) || 0
    };
  });

  const recentResult = await pool.query(
    `
      SELECT id, coin_pair, direction, entry_price, exit_price, pnl_dollar, pnl_percent, exited_at, column_name, status
      FROM trades
      WHERE board_id = $1
        AND (column_name IN ('Wins', 'Losses') OR status IN ('closed', 'won', 'lost'))
      ORDER BY exited_at DESC NULLS LAST, updated_at DESC
      LIMIT 10
    `,
    [boardId]
  );

  const holdTimeResult = await pool.query(
    `
      SELECT AVG(EXTRACT(EPOCH FROM (exited_at - entered_at))) as avg_hold_seconds
      FROM trades
      WHERE board_id = $1
        AND exited_at IS NOT NULL
        AND entered_at IS NOT NULL
        AND (column_name IN ('Wins', 'Losses') OR status IN ('closed', 'won', 'lost'))
    `,
    [boardId]
  );

  const mostTradedResult = await pool.query(
    `
      SELECT coin_pair, COUNT(*)::int as total_trades
      FROM trades
      WHERE board_id = $1
      GROUP BY coin_pair
      ORDER BY total_trades DESC, coin_pair ASC
      LIMIT 6
    `,
    [boardId]
  );

  const pnlByWeekdayResult = await pool.query(
    `
      SELECT EXTRACT(DOW FROM exited_at)::int as dow,
             COALESCE(SUM(COALESCE(pnl_dollar, 0)), 0) as total_pnl,
             COUNT(*)::int as total_trades
      FROM trades
      WHERE board_id = $1
        AND exited_at IS NOT NULL
        AND (column_name IN ('Wins', 'Losses') OR status IN ('closed', 'won', 'lost'))
      GROUP BY EXTRACT(DOW FROM exited_at)
      ORDER BY dow ASC
    `,
    [boardId]
  );

  const pnlByDayResult = await pool.query(
    `
      SELECT DATE(exited_at) as day,
             COALESCE(SUM(COALESCE(pnl_dollar, 0)), 0) as total_pnl
      FROM trades
      WHERE board_id = $1
        AND exited_at IS NOT NULL
        AND (column_name IN ('Wins', 'Losses') OR status IN ('closed', 'won', 'lost'))
      GROUP BY DATE(exited_at)
      ORDER BY day ASC
    `,
    [boardId]
  );

  const streakResult = await pool.query(
    `
      SELECT exited_at, pnl_dollar, column_name, status
      FROM trades
      WHERE board_id = $1
        AND exited_at IS NOT NULL
        AND (column_name IN ('Wins', 'Losses') OR status IN ('closed', 'won', 'lost'))
      ORDER BY exited_at ASC
    `,
    [boardId]
  );

  const streaks = (() => {
    let longestWin = 0;
    let longestLoss = 0;
    let current = 0;
    let currentType: 'win' | 'loss' | null = null;

    streakResult.rows.forEach((row) => {
      const pnl = parseNumeric(row.pnl_dollar);
      const isWin = row.column_name === 'Wins' || (pnl !== null && pnl >= 0);
      const type: 'win' | 'loss' = isWin ? 'win' : 'loss';
      if (currentType === type) {
        current += 1;
      } else {
        currentType = type;
        current = 1;
      }
      if (type === 'win') longestWin = Math.max(longestWin, current);
      if (type === 'loss') longestLoss = Math.max(longestLoss, current);
    });

    return {
      current: currentType ? { type: currentType, count: current } : { type: null, count: 0 },
      longest_win: longestWin,
      longest_loss: longestLoss
    };
  })();

  let cumulative = 0;
  const pnlByDay = pnlByDayResult.rows.map((row) => {
    const pnl = parseNumeric(row.total_pnl) || 0;
    cumulative += pnl;
    return { date: row.day, pnl, cumulative };
  });

  const avgHoldSeconds = parseNumeric(holdTimeResult.rows[0]?.avg_hold_seconds) || 0;
  const avgHoldHours = avgHoldSeconds > 0 ? avgHoldSeconds / 3600 : 0;
  const avgWin = parseNumeric(totals.avg_win) || 0;
  const avgLoss = parseNumeric(totals.avg_loss) || 0;
  const riskReward = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

  return {
    total_trades: Number(totals.total_trades || 0),
    active_trades: Number(totals.active_trades || 0),
    wins,
    losses,
    win_rate: Math.round(winRate * 100) / 100,
    total_pnl: parseNumeric(totals.total_pnl) || 0,
    avg_win: parseNumeric(totals.avg_win) || 0,
    avg_loss: parseNumeric(totals.avg_loss) || 0,
    best_trade: parseNumeric(totals.best_trade) || 0,
    worst_trade: parseNumeric(totals.worst_trade) || 0,
    by_coin: byCoin,
    recent_trades: recentResult.rows,
    avg_hold_hours: Math.round(avgHoldHours * 100) / 100,
    risk_reward_ratio: Math.round(riskReward * 100) / 100,
    streaks,
    most_traded: mostTradedResult.rows,
    pnl_by_weekday: pnlByWeekdayResult.rows.map((row) => ({
      dow: Number(row.dow),
      total_pnl: parseNumeric(row.total_pnl) || 0,
      total_trades: Number(row.total_trades || 0)
    })),
    pnl_by_day: pnlByDay
  };
}

export async function getEquityCurve(boardId: number) {
  const result = await pool.query(
    `
      SELECT exited_at, pnl_dollar, coin_pair
      FROM trades
      WHERE board_id = $1 AND status = 'closed' AND exited_at IS NOT NULL
      ORDER BY exited_at ASC
    `,
    [boardId]
  );

  let cumulative = 0;
  return result.rows.map((row) => {
    const pnl = parseFloat(row.pnl_dollar || 0);
    cumulative += Number.isFinite(pnl) ? pnl : 0;
    return {
      date: row.exited_at,
      pnl: Number.isFinite(pnl) ? pnl : 0,
      cumulative,
      coin_pair: row.coin_pair
    };
  });
}

export async function getPaperAccount(boardId: number, userId: number, startingBalance: number = 1000) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO paper_accounts (board_id, user_id, starting_balance, current_balance)
        VALUES ($1, $2, $3, $3)
        ON CONFLICT (board_id, user_id) DO UPDATE
        SET starting_balance = EXCLUDED.starting_balance,
            current_balance = EXCLUDED.starting_balance
      `,
      [boardId, userId, startingBalance]
    );

    const result = await client.query(
      `SELECT * FROM paper_accounts WHERE board_id = $1 AND user_id = $2`,
      [boardId, userId]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function updatePaperBalance(
  boardId: number,
  userId: number,
  amount: number,
  startingBalance: number = 10000,
  allowNegative: boolean = false
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO paper_accounts (board_id, user_id, starting_balance, current_balance)
        VALUES ($1, $2, $3, $3)
        ON CONFLICT (board_id, user_id) DO NOTHING
      `,
      [boardId, userId, startingBalance]
    );

    const currentResult = await client.query(
      `SELECT current_balance FROM paper_accounts WHERE board_id = $1 AND user_id = $2 FOR UPDATE`,
      [boardId, userId]
    );
    const currentBalance = parseFloat(currentResult.rows[0]?.current_balance ?? '0');
    const nextBalance = currentBalance + amount;
    if (nextBalance < 0 && !allowNegative) {
      throw new Error('INSUFFICIENT_PAPER_BALANCE');
    }

    const updated = await client.query(
      `UPDATE paper_accounts
       SET current_balance = $1, updated_at = NOW()
       WHERE board_id = $2 AND user_id = $3
       RETURNING *`,
      [nextBalance, boardId, userId]
    );
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function resetPaperBalance(boardId: number, userId: number) {
  const result = await pool.query(
    `UPDATE paper_accounts
     SET current_balance = starting_balance, updated_at = NOW()
     WHERE board_id = $1 AND user_id = $2
     RETURNING *`,
    [boardId, userId]
  );
  return result.rows[0];
}

export async function getPortfolioStats(userId: number) {
  const summaryResult = await pool.query(
    `
      WITH accessible_boards AS (
        SELECT b.id
        FROM boards b
        LEFT JOIN team_members tm ON b.team_id = tm.team_id AND tm.user_id = $1
        WHERE (b.owner_id = $1 OR tm.user_id = $1)
          AND b.board_type = 'trading'
          AND (b.visibility IS NULL OR b.visibility <> 'admin_only' OR tm.role IN ('admin', 'owner') OR b.owner_id = $1)
      )
      SELECT
        (SELECT COUNT(*) FROM accessible_boards)::int as board_count,
        COUNT(*) FILTER (WHERE t.status = 'active' OR t.column_name = 'Active')::int as active_positions,
        COALESCE(SUM(CASE WHEN t.status = 'active' OR t.column_name = 'Active' THEN COALESCE(t.position_size, 0) END), 0) as total_position_size,
        COALESCE(SUM(CASE WHEN t.status IN ('closed', 'won', 'lost') OR t.column_name IN ('Wins', 'Losses') THEN COALESCE(t.pnl_dollar, 0) END), 0) as total_realized_pnl,
        COALESCE(SUM(CASE WHEN t.status = 'active' OR t.column_name = 'Active' THEN
          CASE
            WHEN t.entry_price IS NOT NULL AND t.entry_price > 0 AND t.current_price IS NOT NULL AND t.position_size IS NOT NULL THEN
              (CASE WHEN LOWER(COALESCE(t.direction, '')) = 'short'
                THEN t.entry_price - t.current_price
                ELSE t.current_price - t.entry_price
              END) / t.entry_price * t.position_size
            ELSE 0
          END
        END), 0) as total_unrealized_pnl,
        COUNT(*)::int as total_trades,
        COUNT(*) FILTER (WHERE t.column_name = 'Wins')::int as wins,
        COUNT(*) FILTER (WHERE t.column_name = 'Losses')::int as losses
      FROM trades t
      JOIN accessible_boards ab ON t.board_id = ab.id
    `,
    [userId]
  );

  const summaryRow = summaryResult.rows[0] || {};
  const wins = Number(summaryRow.wins || 0);
  const losses = Number(summaryRow.losses || 0);
  const closedTrades = wins + losses;
  const winRate = closedTrades > 0 ? (wins / closedTrades) * 100 : 0;

  const byCoinResult = await pool.query(
    `
      WITH accessible_boards AS (
        SELECT b.id
        FROM boards b
        LEFT JOIN team_members tm ON b.team_id = tm.team_id AND tm.user_id = $1
        WHERE (b.owner_id = $1 OR tm.user_id = $1)
          AND b.board_type = 'trading'
          AND (b.visibility IS NULL OR b.visibility <> 'admin_only' OR tm.role IN ('admin', 'owner') OR b.owner_id = $1)
      )
      SELECT
        t.coin_pair,
        COUNT(*)::int as total_trades,
        COUNT(*) FILTER (WHERE t.column_name = 'Wins')::int as wins,
        COUNT(*) FILTER (WHERE t.column_name = 'Losses')::int as losses,
        COALESCE(SUM(CASE WHEN t.column_name IN ('Wins', 'Losses') OR t.status IN ('closed', 'won', 'lost') THEN COALESCE(t.pnl_dollar, 0) END), 0) as total_pnl,
        COALESCE(AVG(CASE WHEN t.column_name IN ('Wins', 'Losses') OR t.status IN ('closed', 'won', 'lost') THEN t.pnl_dollar END), 0) as avg_pnl
      FROM trades t
      JOIN accessible_boards ab ON t.board_id = ab.id
      GROUP BY t.coin_pair
      ORDER BY t.coin_pair
    `,
    [userId]
  );

  const byCoin = byCoinResult.rows.map((row) => {
    const winsByCoin = Number(row.wins || 0);
    const lossesByCoin = Number(row.losses || 0);
    const closedByCoin = winsByCoin + lossesByCoin;
    return {
      coin_pair: row.coin_pair,
      total_trades: Number(row.total_trades || 0),
      wins: winsByCoin,
      losses: lossesByCoin,
      win_rate: closedByCoin > 0 ? (winsByCoin / closedByCoin) * 100 : 0,
      total_pnl: parseNumeric(row.total_pnl) || 0,
      avg_pnl: parseNumeric(row.avg_pnl) || 0
    };
  });

  const byDirectionResult = await pool.query(
    `
      WITH accessible_boards AS (
        SELECT b.id
        FROM boards b
        LEFT JOIN team_members tm ON b.team_id = tm.team_id AND tm.user_id = $1
        WHERE (b.owner_id = $1 OR tm.user_id = $1)
          AND b.board_type = 'trading'
          AND (b.visibility IS NULL OR b.visibility <> 'admin_only' OR tm.role IN ('admin', 'owner') OR b.owner_id = $1)
      )
      SELECT
        UPPER(COALESCE(t.direction, '')) as direction,
        COUNT(*)::int as total_trades,
        COUNT(*) FILTER (WHERE t.column_name = 'Wins')::int as wins,
        COUNT(*) FILTER (WHERE t.column_name = 'Losses')::int as losses,
        COALESCE(SUM(CASE WHEN t.column_name IN ('Wins', 'Losses') OR t.status IN ('closed', 'won', 'lost') THEN COALESCE(t.pnl_dollar, 0) END), 0) as total_pnl
      FROM trades t
      JOIN accessible_boards ab ON t.board_id = ab.id
      GROUP BY UPPER(COALESCE(t.direction, ''))
    `,
    [userId]
  );

  const byDirection = byDirectionResult.rows.map((row) => {
    const winsByDir = Number(row.wins || 0);
    const lossesByDir = Number(row.losses || 0);
    const closedByDir = winsByDir + lossesByDir;
    return {
      direction: row.direction || 'UNKNOWN',
      total_trades: Number(row.total_trades || 0),
      wins: winsByDir,
      losses: lossesByDir,
      win_rate: closedByDir > 0 ? (winsByDir / closedByDir) * 100 : 0,
      total_pnl: parseNumeric(row.total_pnl) || 0
    };
  });

  const equityCurveResult = await pool.query(
    `
      WITH accessible_boards AS (
        SELECT b.id
        FROM boards b
        LEFT JOIN team_members tm ON b.team_id = tm.team_id AND tm.user_id = $1
        WHERE (b.owner_id = $1 OR tm.user_id = $1)
          AND b.board_type = 'trading'
          AND (b.visibility IS NULL OR b.visibility <> 'admin_only' OR tm.role IN ('admin', 'owner') OR b.owner_id = $1)
      )
      SELECT exited_at, pnl_dollar, coin_pair
      FROM trades t
      JOIN accessible_boards ab ON t.board_id = ab.id
      WHERE t.status IN ('closed', 'won', 'lost') AND exited_at IS NOT NULL
      ORDER BY exited_at ASC
    `,
    [userId]
  );

  let cumulative = 0;
  const equityCurve = equityCurveResult.rows.map((row) => {
    const pnl = parseFloat(row.pnl_dollar || 0);
    cumulative += Number.isFinite(pnl) ? pnl : 0;
    return {
      date: row.exited_at,
      pnl: Number.isFinite(pnl) ? pnl : 0,
      cumulative,
      coin_pair: row.coin_pair
    };
  });

  // Fetch paper balance from paper_accounts
  const paperResult = await pool.query(
    `SELECT COALESCE(SUM(current_balance), 0) as paper_balance,
            COALESCE(SUM(starting_balance), 0) as starting_balance
     FROM paper_accounts pa
     JOIN boards b ON pa.board_id = b.id
     WHERE pa.user_id = $1
       AND b.board_type = 'trading'`,
    [userId]
  );
  const paperBalance = parseNumeric(paperResult.rows[0]?.paper_balance) || 0;
  const startingBalance = parseNumeric(paperResult.rows[0]?.starting_balance) || 0;

  // Active holdings: only coins currently held (Active column)
  const activeHoldingsResult = await pool.query(
    `
      WITH accessible_boards AS (
        SELECT b.id
        FROM boards b
        LEFT JOIN team_members tm ON b.team_id = tm.team_id AND tm.user_id = $1
        WHERE (b.owner_id = $1 OR tm.user_id = $1)
          AND b.board_type = 'trading'
          AND (b.visibility IS NULL OR b.visibility <> 'admin_only' OR tm.role IN ('admin', 'owner') OR b.owner_id = $1)
      )
      SELECT t.coin_pair, COALESCE(t.position_size, 0) as position_size, t.entry_price
      FROM trades t
      JOIN accessible_boards ab ON t.board_id = ab.id
      WHERE t.column_name = 'Active' OR t.status = 'active'
      ORDER BY t.position_size DESC NULLS LAST
    `,
    [userId]
  );

  const activeHoldings = activeHoldingsResult.rows.map((row) => ({
    coin_pair: row.coin_pair,
    position_size: parseNumeric(row.position_size) || 0,
    entry_price: parseNumeric(row.entry_price) || 0,
  }));

  return {
    summary: {
      total_portfolio_value: parseNumeric(summaryRow.total_position_size) || 0,
      total_realized_pnl: parseNumeric(summaryRow.total_realized_pnl) || 0,
      total_unrealized_pnl: parseNumeric(summaryRow.total_unrealized_pnl) || 0,
      paper_balance: paperBalance,
      starting_balance: startingBalance,
      win_rate: Math.round(winRate * 100) / 100,
      active_positions: Number(summaryRow.active_positions || 0),
      total_trades: Number(summaryRow.total_trades || 0),
      board_count: Number(summaryRow.board_count || 0)
    },
    byCoin,
    activeHoldings,
    byDirection,
    equityCurve
  };
}

export async function addPriceHistory(coinPair: string, price: number, volume: number | null, source: string = 'ccxt') {
  const result = await pool.query(
    `INSERT INTO price_history (coin_pair, price, volume, timestamp, source)
     VALUES ($1, $2, $3, NOW(), $4) RETURNING *`,
    [coinPair, price, volume, source]
  );
  return result.rows[0];
}

export async function recordPriceSnapshot(pair: string, price: number, volume: number) {
  return addPriceHistory(pair, price, volume, 'ccxt');
}

export async function getPriceHistory(coinPair: string, hours: number = 24) {
  const result = await pool.query(
    `SELECT * FROM price_history WHERE coin_pair = $1 AND timestamp > NOW() - INTERVAL '1 hour' * $2
     ORDER BY timestamp DESC`,
    [coinPair, hours]
  );
  return result.rows;
}

export async function getLatestPrice(coinPair: string) {
  const result = await pool.query(
    `SELECT * FROM price_history WHERE coin_pair = $1 ORDER BY timestamp DESC LIMIT 1`,
    [coinPair]
  );
  return result.rows[0];
}

export async function getTradingStats(boardId: number) {
  const result = await pool.query(
    `SELECT column_name, COUNT(*) as count,
            SUM(COALESCE(pnl_dollar, 0)) as total_pnl,
            AVG(CASE WHEN column_name = 'Wins' THEN pnl_dollar END) as avg_win,
            AVG(CASE WHEN column_name = 'Losses' THEN pnl_dollar END) as avg_loss
     FROM trades WHERE board_id = $1
     GROUP BY column_name`,
    [boardId]
  );

  const stats: Record<string, number> = {};
  let totalPnl = 0;
  let wins = 0;
  let losses = 0;
  let avgWin = 0;
  let avgLoss = 0;
  let totalTrades = 0;

  for (const row of result.rows) {
    stats[row.column_name] = parseInt(row.count);
    totalTrades += parseInt(row.count);
    totalPnl += parseFloat(row.total_pnl || '0');
    if (row.column_name === 'Wins') {
      wins = parseInt(row.count);
      avgWin = parseFloat(row.avg_win || '0');
    }
    if (row.column_name === 'Losses') {
      losses = parseInt(row.count);
      avgLoss = parseFloat(row.avg_loss || '0');
    }
  }

  const closedTrades = wins + losses;
  const winRate = closedTrades > 0 ? (wins / closedTrades) * 100 : 0;

  return {
    totalTrades,
    byColumn: stats,
    wins,
    losses,
    winRate: Math.round(winRate * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
  };
}

export async function seedTradingBoard(userId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create trading board
    const boardResult = await client.query(
      `INSERT INTO boards (name, description, owner_id, is_personal, board_type, columns, visibility)
       VALUES ($1, $2, $3, true, 'trading', $4, $5) RETURNING *`,
      ['Paper Trading', 'Paper trading board for practice', userId,
       JSON.stringify(['Watchlist', 'Analyzing', 'Active', 'Parked', 'Wins', 'Losses']),
       'admin_only']
    );
    const board = boardResult.rows[0];

    await client.query(
      `INSERT INTO paper_accounts (board_id, user_id, starting_balance, current_balance)
       VALUES ($1, $2, 10000, 10000)
       ON CONFLICT (board_id, user_id) DO NOTHING`,
      [board.id, userId]
    );

    // Sample trades
    const trades = [
      { coin_pair: 'BTC/USDT', column_name: 'Watchlist', direction: 'long', status: 'watching', confidence_score: 65, notes: 'Watching for breakout above 100k' },
      { coin_pair: 'ETH/USDT', column_name: 'Analyzing', direction: 'long', status: 'analyzing', rsi_value: 42, tbo_signal: 'buy', confidence_score: 72, notes: 'TBO buy signal fired, checking confirmation' },
      { coin_pair: 'SOL/USDT', column_name: 'Active', direction: 'long', status: 'active', entry_price: 195.50, current_price: 201.30, stop_loss: 188.00, take_profit: 220.00, position_size: 10, confidence_score: 80 },
      { coin_pair: 'DOGE/USDT', column_name: 'Wins', direction: 'long', status: 'won', entry_price: 0.32, exit_price: 0.38, pnl_dollar: 187.50, pnl_percent: 18.75 },
    ];

    for (const t of trades) {
      const tradeResult = await client.query(
        `INSERT INTO trades (board_id, created_by, coin_pair, column_name, direction, status, entry_price, current_price, exit_price, stop_loss, take_profit, position_size, confidence_score, rsi_value, tbo_signal, pnl_dollar, pnl_percent, notes, entered_at, exited_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING id`,
        [board.id, userId, t.coin_pair, t.column_name, t.direction, t.status,
         t.entry_price || null, t.current_price || null, t.exit_price || null,
         t.stop_loss || null, t.take_profit || null, t.position_size || null,
         t.confidence_score || null, t.rsi_value || null, t.tbo_signal || null,
         t.pnl_dollar || null, t.pnl_percent || null, t.notes || null,
         t.column_name === 'Active' || t.column_name === 'Wins' ? new Date() : null,
         t.column_name === 'Wins' ? new Date() : null]
      );

      // Add activity for each trade
      await client.query(
        `INSERT INTO trade_activity (trade_id, action, to_column, actor_type, actor_name)
         VALUES ($1, 'created', $2, 'user', 'System Seed')`,
        [tradeResult.rows[0].id, t.column_name]
      );
    }

    await client.query('COMMIT');
    return board;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export { pool };

// ── Trading Settings (per user, per board) ──────────────────────────────
export async function ensureTradingSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trading_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
      settings JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, board_id)
    )
  `);
}

export async function getTradingSettings(userId: number, boardId: number) {
  await ensureTradingSettingsTable();
  const result = await pool.query(
    'SELECT settings FROM trading_settings WHERE user_id = $1 AND board_id = $2',
    [userId, boardId]
  );
  return result.rows[0]?.settings || null;
}

export async function saveTradingSettings(userId: number, boardId: number, settings: Record<string, unknown>) {
  await ensureTradingSettingsTable();
  const result = await pool.query(
    `INSERT INTO trading_settings (user_id, board_id, settings, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, board_id) DO UPDATE SET settings = $3, updated_at = NOW()
     RETURNING settings`,
    [userId, boardId, JSON.stringify(settings)]
  );
  return result.rows[0]?.settings;
}
