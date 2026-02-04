import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTasksForBoard } from '@/lib/database';

// GET /api/v1/boards/:id - Get board with tasks
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
    
    return NextResponse.json({ board, columns });
  } catch (error) {
    console.error('Error fetching board:', error);
    return NextResponse.json({ error: 'Failed to fetch board' }, { status: 500 });
  }
}
