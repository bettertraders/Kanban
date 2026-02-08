import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getMultiplePrices } from '@/lib/price-service';

function normalizePair(pair: string) {
  return pair.replace(/-/g, '/').toUpperCase();
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pairsParam = request.nextUrl.searchParams.get('pairs');
    if (!pairsParam) {
      return NextResponse.json({ error: 'pairs required' }, { status: 400 });
    }

    const pairs = pairsParam
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map(normalizePair);

    if (!pairs.length) {
      return NextResponse.json({ error: 'pairs required' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = async () => {
          if (closed) return;
          try {
            const prices = await getMultiplePrices(pairs);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ prices })}\n\n`));
          } catch (error) {
            console.error('SSE price fetch failed:', error);
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
    console.error('GET /prices/stream error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
