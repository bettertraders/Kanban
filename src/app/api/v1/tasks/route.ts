import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { createTask, getBoard } from '@/lib/database';

// POST /api/v1/tasks - Create a new task
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { boardId, title, description, column, priority, assignedTo, dueDate, labels } = await request.json();
    
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
