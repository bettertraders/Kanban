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

export async function getStatsForUser(userId: number) {
  // Get all board IDs the user has access to
  const boardsResult = await pool.query(
    `SELECT DISTINCT b.id 
     FROM boards b
     LEFT JOIN team_members tm ON b.team_id = tm.team_id
     WHERE b.owner_id = $1 OR tm.user_id = $1`,
    [userId]
  );
  const boardIds = boardsResult.rows.map(r => r.id);
  
  if (boardIds.length === 0) {
    return { total: 0, byStatus: {}, byPriority: {}, recentlyCompleted: 0 };
  }

  // Get task counts by status
  const statusResult = await pool.query(
    `SELECT column_name, COUNT(*) as count 
     FROM tasks 
     WHERE board_id = ANY($1)
     GROUP BY column_name`,
    [boardIds]
  );
  const byStatus: Record<string, number> = {};
  statusResult.rows.forEach(r => { byStatus[r.column_name] = parseInt(r.count); });

  // Get task counts by priority
  const priorityResult = await pool.query(
    `SELECT priority, COUNT(*) as count 
     FROM tasks 
     WHERE board_id = ANY($1)
     GROUP BY priority`,
    [boardIds]
  );
  const byPriority: Record<string, number> = {};
  priorityResult.rows.forEach(r => { byPriority[r.priority] = parseInt(r.count); });

  // Get recently completed (last 7 days)
  const recentResult = await pool.query(
    `SELECT COUNT(*) as count 
     FROM tasks 
     WHERE board_id = ANY($1) 
     AND column_name = 'Done'
     AND updated_at > NOW() - INTERVAL '7 days'`,
    [boardIds]
  );
  const recentlyCompleted = parseInt(recentResult.rows[0]?.count || '0');

  // Total tasks
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

  return { total, byStatus, byPriority, recentlyCompleted };
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

export { pool };
