import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getTask, updateTask, getBoard } from '@/lib/database';

// POST /api/v1/tasks/:id/move - Move a task to a different column
// Body: { column: "In Progress" }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const taskId = parseInt(id);
    const task = await getTask(taskId);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const board = await getBoard(task.board_id, user.id);
    if (!board) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { column } = await request.json();
    if (!column) {
      return NextResponse.json({ error: 'column is required' }, { status: 400 });
    }

    // Validate column exists on this board
    const validColumns = board.columns as string[];
    if (!validColumns.includes(column)) {
      return NextResponse.json({ 
        error: `Invalid column "${column}". Valid columns: ${validColumns.join(', ')}` 
      }, { status: 400 });
    }

    const updatedTask = await updateTask(taskId, { column_name: column });

    return NextResponse.json({ 
      task: updatedTask,
      moved: { from: task.column_name, to: column },
    });
  } catch (error) {
    console.error('Error moving task:', error);
    return NextResponse.json({ error: 'Failed to move task' }, { status: 500 });
  }
}
