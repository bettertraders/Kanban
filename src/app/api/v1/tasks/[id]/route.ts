import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getTask, updateTask, deleteTask, getBoard } from '@/lib/database';
import { notifyAssignment } from '@/lib/notifications';

// GET /api/v1/tasks/:id - Get a task
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
    const task = await getTask(parseInt(id));
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    // Verify user has access to the board
    const board = await getBoard(task.board_id, user.id);
    if (!board) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    return NextResponse.json({ task });
  } catch (error) {
    console.error('Error fetching task:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

// PATCH /api/v1/tasks/:id - Update a task
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
    const taskId = parseInt(id);
    const task = await getTask(taskId);
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    // Verify user has access to the board
    const board = await getBoard(task.board_id, user.id);
    if (!board) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    const rawUpdates = await request.json();
    
    // Normalize field names from API-friendly to DB column names
    const updates: Record<string, unknown> = {};
    if (rawUpdates.title !== undefined) updates.title = rawUpdates.title;
    if (rawUpdates.description !== undefined) updates.description = rawUpdates.description;
    if (rawUpdates.notes !== undefined) updates.notes = rawUpdates.notes;
    if (rawUpdates.column !== undefined) updates.column_name = rawUpdates.column;
    if (rawUpdates.column_name !== undefined) updates.column_name = rawUpdates.column_name;
    if (rawUpdates.status !== undefined) updates.column_name = rawUpdates.status;
    if (rawUpdates.priority !== undefined) updates.priority = rawUpdates.priority;
    if (rawUpdates.assignedTo !== undefined) updates.assigned_to = rawUpdates.assignedTo;
    if (rawUpdates.assigned_to !== undefined) updates.assigned_to = rawUpdates.assigned_to;
    if (rawUpdates.dueDate !== undefined) updates.due_date = rawUpdates.dueDate;
    if (rawUpdates.due_date !== undefined) updates.due_date = rawUpdates.due_date;
    if (rawUpdates.labels !== undefined) {
      updates.labels = typeof rawUpdates.labels === 'string'
        ? rawUpdates.labels.split(',').map((l: string) => l.trim()).filter(Boolean)
        : rawUpdates.labels;
    }
    
    const oldAssignedTo = task.assigned_to;
    const updatedTask = await updateTask(taskId, updates);

    // Fire-and-forget: notify if assignee changed to someone else
    const newAssignedTo = updates.assigned_to;
    if (newAssignedTo && newAssignedTo !== oldAssignedTo && newAssignedTo !== user.id) {
      notifyAssignment({
        taskTitle: updates.title as string || task.title,
        boardName: board.name,
        assignedByName: user.name || user.email,
      });
    }
    
    return NextResponse.json({ task: updatedTask });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/v1/tasks/:id - Delete a task
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
    const taskId = parseInt(id);
    const task = await getTask(taskId);
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    // Verify user has access to the board
    const board = await getBoard(task.board_id, user.id);
    if (!board) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    await deleteTask(taskId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
