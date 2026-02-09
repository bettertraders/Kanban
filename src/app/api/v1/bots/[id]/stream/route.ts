import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getBot, isAdminUser, pool } from '@/lib/database';

async function canAccessBot(userId: number, bot: any): Promise<boolean> {
  if (!bot) return false;
  if (bot.user_id === userId) return true;
  return isAdminUser(userId);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const botId = Number(id);
    if (!Number.isFinite(botId)) return NextResponse.json({ error: 'Invalid bot id' }, { status: 400 });

    const bot = await getBot(botId);
    if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 });

    const allowed = await canAccessBot(user.id, bot);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const encoder = new TextEncoder();
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    let lastId = 0;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = async () => {
          if (closed) return;
          try {
            if (lastId === 0) {
              const initial = await pool.query(
                `SELECT * FROM bot_executions WHERE bot_id = $1 ORDER BY executed_at DESC LIMIT 20`,
                [botId]
              );
              const rows = initial.rows.reverse();
              if (rows.length) {
                lastId = Number(rows[rows.length - 1].id) || lastId;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ executions: rows })}\n\n`));
              }
              return;
            }

            const result = await pool.query(
              `SELECT * FROM bot_executions WHERE bot_id = $1 AND id > $2 ORDER BY executed_at ASC`,
              [botId, lastId]
            );
            if (result.rows.length) {
              lastId = Number(result.rows[result.rows.length - 1].id) || lastId;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ executions: result.rows })}\n\n`));
            }
          } catch (error) {
            console.error('SSE bot execution fetch failed:', error);
          }
        };

        void send();
        intervalId = setInterval(() => void send(), 10000);

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
    console.error('GET /bots/[id]/stream error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
