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
        links JSONB DEFAULT '[]',
        status VARCHAR(20) DEFAULT 'watching',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        entered_at TIMESTAMP,
        exited_at TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_trades_board ON trades(board_id);
      CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
      CREATE INDEX IF NOT EXISTS idx_trades_coin ON trades(coin_pair);

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
export async function createTeam(name: string, slug: string, createdBy: number, description?: string) {
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
    
    // Create default team board
    await client.query(
      `INSERT INTO boards (name, description, team_id, is_personal, columns) 
       VALUES ($1, $2, $3, false, $4)`,
      [`${name} Board`, 'Team collaboration board', team.id, JSON.stringify(['Backlog', 'Planned', 'In Progress', 'Review', 'Done'])]
    );
    
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
      SELECT DISTINCT ON (b.id) b.*, t.name as team_name, t.slug as team_slug
      FROM boards b
      LEFT JOIN teams t ON b.team_id = t.id
      LEFT JOIN team_members tm ON t.id = tm.team_id
      WHERE b.owner_id = $1 OR tm.user_id = $1
      ORDER BY b.id
    ) sub
    ORDER BY is_personal DESC, name
  `, [userId]);
  return result.rows;
}

export async function getBoard(boardId: number, userId: number) {
  const result = await pool.query(`
    SELECT b.*, t.name as team_name, t.slug as team_slug
    FROM boards b
    LEFT JOIN teams t ON b.team_id = t.id
    LEFT JOIN team_members tm ON t.id = tm.team_id
    WHERE b.id = $1 AND (b.owner_id = $2 OR tm.user_id = $2)
  `, [boardId, userId]);
  return result.rows[0];
}

export async function createBoard(name: string, ownerId: number, teamId?: number, description?: string) {
  const result = await pool.query(
    `INSERT INTO boards (name, description, owner_id, team_id, is_personal, columns) 
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, description, teamId ? null : ownerId, teamId, !teamId, JSON.stringify(['Backlog', 'Planned', 'In Progress', 'Review', 'Done'])]
  );
  return result.rows[0];
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
    'lesson_tag', 'notes', 'links', 'status', 'entered_at', 'exited_at'
  ];
  const setClause: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClause.push(`${key} = $${paramIndex}`);
      values.push(key === 'links' ? JSON.stringify(value) : value);
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

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
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
  const pnlDollar = perUnit * size;
  const pnlPercent = entry !== 0 ? (perUnit / entry) * 100 : 0;
  return { pnlDollar, pnlPercent };
}

export async function enterTrade(tradeId: number, entryPrice: number | null, userId: number) {
  const trade = await getTrade(tradeId);
  if (!trade) return null;

  const finalEntryPrice = entryPrice ?? parseNumeric(trade.current_price);
  if (finalEntryPrice === null) {
    throw new Error('ENTRY_PRICE_REQUIRED');
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
    recent_trades: recentResult.rows
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
      `INSERT INTO boards (name, description, owner_id, is_personal, board_type, columns)
       VALUES ($1, $2, $3, true, 'trading', $4) RETURNING *`,
      ['Paper Trading', 'Paper trading board for practice', userId,
       JSON.stringify(['Watchlist', 'Analyzing', 'Active', 'Parked', 'Wins', 'Losses'])]
    );
    const board = boardResult.rows[0];

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
