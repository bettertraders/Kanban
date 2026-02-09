import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTasksForBoard, pool } from '@/lib/database';

// Check if user can edit a board (personal: owner only, team: admin only)
async function canEditBoard(board: any, userId: number): Promise<boolean> {
  // Personal boards: only owner can edit
  if (board.is_personal) {
    return board.owner_id === userId;
  }
  
  // Team boards: only admins can edit
  if (board.team_id) {
    const result = await pool.query(
      'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
      [board.team_id, userId]
    );
    return result.rows[0]?.role === 'admin';
  }
  
  return false;
}

// GET /api/v1/boards/:id - Get board with tasks grouped by column
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id } = await params;
    const boardId = parseInt(id);
    
    const board = await getBoard(boardId, user.id);
    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }
    
    const tasks = await getTasksForBoard(boardId);
    
    // Group tasks by column
    const columns = (board.columns as string[]).map(columnName => ({
      name: columnName,
      tasks: tasks.filter(t => t.column_name === columnName)
    }));
    
    return NextResponse.json({ board, columns, totalTasks: tasks.length });
  } catch (error) {
    console.error('Error fetching board:', error);
    return NextResponse.json({ error: 'Failed to fetch board' }, { status: 500 });
  }
}

// PATCH /api/v1/boards/:id - Update board (name, description, columns)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const boardId = parseInt(id);

    const board = await getBoard(boardId, user.id);
    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    // Check if user can edit this board
    const canEdit = await canEditBoard(board, user.id);
    if (!canEdit) {
      return NextResponse.json({ 
        error: board.is_personal 
          ? 'Only the board owner can edit this board' 
          : 'Only team admins can edit team boards' 
      }, { status: 403 });
    }

    const { name, description, columns, board_type, team_id, visibility } = await request.json();

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
      }
      updates.push(`name = $${paramIdx++}`);
      values.push(name.trim());
    }
    if (description !== undefined) {
      if (description !== null && typeof description !== 'string') {
        return NextResponse.json({ error: 'description must be a string' }, { status: 400 });
      }
      updates.push(`description = $${paramIdx++}`);
      values.push(description);
    }
    if (columns !== undefined) {
      if (!Array.isArray(columns) || columns.length === 0) {
        return NextResponse.json({ error: 'columns must be a non-empty array' }, { status: 400 });
      }
      updates.push(`columns = $${paramIdx++}`);
      values.push(JSON.stringify(columns));
    }

    if (board_type !== undefined) {
      if (!['task', 'trading'].includes(String(board_type))) {
        return NextResponse.json({ error: 'board_type must be task or trading' }, { status: 400 });
      }
      updates.push(`board_type = $${paramIdx++}`);
      values.push(board_type);
    }
    if (visibility !== undefined) {
      if (!['all', 'admin_only'].includes(String(visibility))) {
        return NextResponse.json({ error: 'visibility must be all or admin_only' }, { status: 400 });
      }
      updates.push(`visibility = $${paramIdx++}`);
      values.push(visibility);
    }
    if (team_id !== undefined) {
      if (!Number.isFinite(Number(team_id))) {
        return NextResponse.json({ error: 'team_id must be a number' }, { status: 400 });
      }
      updates.push(`team_id = $${paramIdx++}`);
      values.push(Number(team_id));
      updates.push(`is_personal = false`);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    values.push(boardId);

    await pool.query(
      `UPDATE boards SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
      values
    );

    const updated = await getBoard(boardId, user.id);
    return NextResponse.json({ board: updated });
  } catch (error) {
    console.error('Error updating board:', error);
    return NextResponse.json({ error: 'Failed to update board' }, { status: 500 });
  }
}

// DELETE /api/v1/boards/:id - Delete a board (and all its tasks)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const boardId = parseInt(id);

    const board = await getBoard(boardId, user.id);
    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    // Don't allow deleting personal boards
    if (board.is_personal) {
      return NextResponse.json({ error: 'Cannot delete personal boards' }, { status: 400 });
    }

    await pool.query('DELETE FROM boards WHERE id = $1', [boardId]);

    return NextResponse.json({ success: true, deleted: boardId });
  } catch (error) {
    console.error('Error deleting board:', error);
    return NextResponse.json({ error: 'Failed to delete board' }, { status: 500 });
  }
}
