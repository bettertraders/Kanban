import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTasksForBoard, createTask } from '@/lib/database';

// GET /api/v1/boards/:id/tasks - List tasks with optional filters
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

    let tasks = await getTasksForBoard(boardId);

    // Apply filters from query params
    const { searchParams } = new URL(request.url);
    const column = searchParams.get('column');
    const priority = searchParams.get('priority');
    const search = searchParams.get('search');
    const label = searchParams.get('label');
    const assignedTo = searchParams.get('assigned_to');

    if (column) {
      tasks = tasks.filter(t => t.column_name === column);
    }
    if (priority) {
      tasks = tasks.filter(t => t.priority === priority);
    }
    if (search) {
      const q = search.toLowerCase();
      tasks = tasks.filter(t => 
        t.title.toLowerCase().includes(q) || 
        (t.description && t.description.toLowerCase().includes(q))
      );
    }
    if (label) {
      tasks = tasks.filter(t => 
        t.labels && (t.labels as string[]).includes(label)
      );
    }
    if (assignedTo) {
      tasks = tasks.filter(t => String(t.assigned_to) === assignedTo);
    }

    return NextResponse.json({ 
      board: { id: board.id, name: board.name },
      tasks,
      count: tasks.length,
    });
  } catch (error) {
    console.error('Error fetching board tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

// POST /api/v1/boards/:id/tasks - Create task on this board (convenience)
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
    const boardId = parseInt(id);
    const board = await getBoard(boardId, user.id);

    if (!board) {
      return NextResponse.json({ error: 'Board not found or access denied' }, { status: 404 });
    }

    const body = await request.json();
    const { title, description, priority, assignedTo, dueDate, labels } = body;
    const column = body.column || body.column_name || body.status;

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const task = await createTask(boardId, title, user.id, {
      description,
      column,
      priority,
      assignedTo,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      labels,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
