import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getFile, getTask, getBoard } from '@/lib/database';
import { readFile } from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = '/data/uploads';

// GET /api/v1/files/:id — serve file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const fileRecord = await getFile(parseInt(id));
    if (!fileRecord) return NextResponse.json({ error: 'File not found' }, { status: 404 });

    const task = await getTask(fileRecord.task_id);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const board = await getBoard(task.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const filePath = path.join(UPLOAD_DIR, fileRecord.filename);
    const buffer = await readFile(filePath);

    const isInline = fileRecord.mime_type?.startsWith('image/');
    const disposition = isInline ? 'inline' : 'attachment';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': fileRecord.mime_type || 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename="${fileRecord.original_name}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('Error serving file:', error);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
}
