import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, createTask, updateTask, deleteTask, getTask } from '@/lib/database';

// POST /api/v1/tasks/batch - Batch operations on tasks
// Body: { operations: [{ action: "create"|"update"|"move"|"delete", ... }] }
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { operations } = await request.json();

    if (!operations || !Array.isArray(operations)) {
      return NextResponse.json({ error: 'operations array is required' }, { status: 400 });
    }

    if (operations.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 operations per batch' }, { status: 400 });
    }

    const results = [];

    for (const op of operations) {
      try {
        switch (op.action) {
          case 'create': {
            if (!op.boardId || !op.title) {
              results.push({ action: 'create', error: 'boardId and title required' });
              break;
            }
            const board = await getBoard(op.boardId, user.id);
            if (!board) {
              results.push({ action: 'create', error: 'Board not found' });
              break;
            }
            const task = await createTask(op.boardId, op.title, user.id, {
              description: op.description,
              column: op.column,
              priority: op.priority,
              labels: op.labels,
            });
            results.push({ action: 'create', success: true, task });
            break;
          }

          case 'update': {
            if (!op.taskId) {
              results.push({ action: 'update', error: 'taskId required' });
              break;
            }
            const existingTask = await getTask(op.taskId);
            if (!existingTask) {
              results.push({ action: 'update', error: 'Task not found' });
              break;
            }
            const taskBoard = await getBoard(existingTask.board_id, user.id);
            if (!taskBoard) {
              results.push({ action: 'update', error: 'Access denied' });
              break;
            }
            const { taskId: _tid, action: _a, ...updates } = op;
            const updated = await updateTask(op.taskId, updates);
            results.push({ action: 'update', success: true, task: updated });
            break;
          }

          case 'move': {
            if (!op.taskId || !op.column) {
              results.push({ action: 'move', error: 'taskId and column required' });
              break;
            }
            const moveTask = await getTask(op.taskId);
            if (!moveTask) {
              results.push({ action: 'move', error: 'Task not found' });
              break;
            }
            const moveBoard = await getBoard(moveTask.board_id, user.id);
            if (!moveBoard) {
              results.push({ action: 'move', error: 'Access denied' });
              break;
            }
            const moved = await updateTask(op.taskId, { column_name: op.column });
            results.push({ action: 'move', success: true, task: moved, from: moveTask.column_name, to: op.column });
            break;
          }

          case 'delete': {
            if (!op.taskId) {
              results.push({ action: 'delete', error: 'taskId required' });
              break;
            }
            const delTask = await getTask(op.taskId);
            if (!delTask) {
              results.push({ action: 'delete', error: 'Task not found' });
              break;
            }
            const delBoard = await getBoard(delTask.board_id, user.id);
            if (!delBoard) {
              results.push({ action: 'delete', error: 'Access denied' });
              break;
            }
            await deleteTask(op.taskId);
            results.push({ action: 'delete', success: true, taskId: op.taskId });
            break;
          }

          default:
            results.push({ action: op.action, error: `Unknown action: ${op.action}` });
        }
      } catch (err) {
        results.push({ action: op.action, error: String(err) });
      }
    }

    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => r.error).length;

    return NextResponse.json({ 
      results,
      summary: { total: results.length, successes, failures },
    });
  } catch (error) {
    console.error('Error in batch operation:', error);
    return NextResponse.json({ error: 'Batch operation failed' }, { status: 500 });
  }
}
