import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { createTask, getBoard, getTasksForBoard } from '@/lib/database';

// GET /api/v1/tasks?boardId=N - List tasks for a board
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const boardId = searchParams.get('boardId');
    
    if (!boardId) {
      return NextResponse.json({ error: 'boardId query parameter is required' }, { status: 400 });
    }
    
    const board = await getBoard(parseInt(boardId), user.id);
    if (!board) {
      return NextResponse.json({ error: 'Board not found or access denied' }, { status: 404 });
    }
    
    const tasks = await getTasksForBoard(parseInt(boardId));
    
    return NextResponse.json({ 
      board: { id: board.id, name: board.name },
      tasks,
      count: tasks.length,
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

// POST /api/v1/tasks - Create a new task
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { boardId, title, description, priority, assignedTo, dueDate, labels } = body;
    const column = body.column || body.column_name || body.status;
    
    if (!boardId || !title) {
      return NextResponse.json({ error: 'boardId and title are required' }, { status: 400 });
    }
    
    // Verify user has access to board
    const board = await getBoard(boardId, user.id);
    if (!board) {
      return NextResponse.json({ error: 'Board not found or access denied' }, { status: 404 });
    }
    
    // Normalize labels: accept string (comma-separated) or array
    let normalizedLabels: string[] | undefined;
    if (labels) {
      normalizedLabels = typeof labels === 'string' 
        ? labels.split(',').map((l: string) => l.trim()).filter(Boolean)
        : Array.isArray(labels) ? labels : undefined;
    }
    
    const task = await createTask(boardId, title, user.id, {
      description,
      column,
      priority,
      assignedTo,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      labels: normalizedLabels
    });
    
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
