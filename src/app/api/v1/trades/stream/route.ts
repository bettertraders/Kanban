import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBoard, getTradesForBoard } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const boardIdParam = request.nextUrl.searchParams.get('boardId');
    const boardId = boardIdParam ? parseInt(boardIdParam, 10) : NaN;
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    }

    const board = await getBoard(boardId, user.id);
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

    const encoder = new TextEncoder();
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = async () => {
          if (closed) return;
          try {
            const trades = await getTradesForBoard(boardId);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ trades })}\n\n`));
          } catch (error) {
            console.error('SSE trades fetch failed:', error);
          }
        };

        void send();
        intervalId = setInterval(() => void send(), 15000);

        const close = () => {
          if (closed) return;
          closed = true;
          if (intervalId) clearInterval(intervalId);
          controller.close();
        };

        request.signal.addEventListener('abort', close);
      },
      cancel() {
        closed = true;
        if (intervalId) clearInterval(intervalId);
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });
  } catch (error) {
    console.error('GET /trades/stream error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
