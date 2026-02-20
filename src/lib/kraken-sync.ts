import type { Order, Trade } from 'ccxt';

type KrakenClient = {
  fetchMyTrades: (symbol?: string, since?: number, limit?: number, params?: Record<string, unknown>) => Promise<Trade[]>;
  fetchOrder: (orderId: string, symbol?: string, params?: Record<string, unknown>) => Promise<Order>;
  fetchOpenOrders: (symbol?: string, since?: number, limit?: number, params?: Record<string, unknown>) => Promise<Order[]>;
  createOrder: (symbol: string, type: string, side: string, amount: number, price?: number, params?: Record<string, unknown>) => Promise<Order>;
};

async function createKrakenClient(): Promise<KrakenClient> {
  const { default: ccxt } = await import('ccxt');
  const apiKey = process.env.KRAKEN_API_KEY || '';
  const apiSecret = process.env.KRAKEN_API_SECRET || '';

  if (!apiKey || !apiSecret) {
    throw new Error('Kraken API credentials not configured');
  }

  return new ccxt.kraken({
    apiKey,
    secret: apiSecret,
    enableRateLimit: true,
  }) as unknown as KrakenClient;
}

export async function fetchKrakenTrades(options: { since?: number; symbol?: string } = {}): Promise<Trade[]> {
  const exchange = await createKrakenClient();
  return exchange.fetchMyTrades(options.symbol, options.since);
}

export async function fetchKrakenOpenOrders(options: { symbol?: string } = {}): Promise<Order[]> {
  const exchange = await createKrakenClient();
  return exchange.fetchOpenOrders(options.symbol);
}

export async function fetchKrakenOrder(orderId: string, symbol?: string): Promise<Order> {
  const exchange = await createKrakenClient();
  return exchange.fetchOrder(orderId, symbol);
}

export async function verifyOrder(orderId: string, symbol?: string): Promise<{ eligible: boolean; order: Order | null }>{
  try {
    const order = await fetchKrakenOrder(orderId, symbol);
    const filled = Number(order?.filled ?? 0);
    const status = String(order?.status || '').toLowerCase();
    const eligible = (status === 'closed' || status === 'open') && filled > 0;
    return { eligible, order };
  } catch (error) {
    console.error('[kraken-sync] verifyOrder error:', error);
    return { eligible: false, order: null };
  }
}

export async function createKrakenOrder(options: {
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  type?: 'market' | 'limit';
  price?: number;
  params?: Record<string, unknown>;
}): Promise<Order> {
  const exchange = await createKrakenClient();
  const type = options.type || 'market';
  return exchange.createOrder(options.symbol, type, options.side, options.amount, options.price, options.params);
}
