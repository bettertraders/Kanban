import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getTask, getBoard, getFilesForTask, addFile, getFile, deleteFile } from '@/lib/database';
import { writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = '/data/uploads';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain',
  'application/zip', 'application/x-zip-compressed',
]);

async function ensureUploadDir() {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

// GET /api/v1/tasks/:id/files
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const task = await getTask(parseInt(id));
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const board = await getBoard(task.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const files = await getFilesForTask(task.id);
    return NextResponse.json({ files });
  } catch (error) {
    console.error('Error fetching files:', error);
    return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
  }
}

// POST /api/v1/tasks/:id/files
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const taskId = parseInt(id);
    const task = await getTask(taskId);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const board = await getBoard(task.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
    }

    await ensureUploadDir();

    const originalName = file.name;
    const filename = `${taskId}_${Date.now()}_${originalName}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const record = await addFile(taskId, user.id, filename, originalName, file.type, file.size);
    return NextResponse.json({ file: record }, { status: 201 });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}

// DELETE /api/v1/tasks/:id/files?fileId=123
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const task = await getTask(parseInt(id));
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const board = await getBoard(task.board_id, user.id);
    if (!board) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const fileId = parseInt(request.nextUrl.searchParams.get('fileId') || '');
    if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

    const fileRecord = await getFile(fileId);
    if (!fileRecord || fileRecord.task_id !== task.id) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Delete from disk
    try {
      await unlink(path.join(UPLOAD_DIR, fileRecord.filename));
    } catch {}

    await deleteFile(fileId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
