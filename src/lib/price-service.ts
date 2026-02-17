import ccxt, { type OHLCV, type Ticker } from 'ccxt';

type PriceSnapshot = {
  price: number;
  volume24h: number;
  change24h: number;
  high24h: number;
  low24h: number;
  timestamp: Date;
};

type OhlcvCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type PriceSummary = {
  price: number;
  volume24h: number;
  change24h: number;
  high24h: number;
  low24h: number;
};

type CachedEntry = {
  expiresAt: number;
  data: PriceSnapshot;
};

const CACHE_TTL_MS = 60 * 1000;
const priceCache = new Map<string, CachedEntry>();

const binance = new ccxt.binanceus({ enableRateLimit: true });
const binanceGlobal = new ccxt.binance({ enableRateLimit: true });
const coinbase = new ccxt.coinbase({ enableRateLimit: true });

// Load markets once on startup for better symbol resolution
let binanceGlobalMarketsLoaded = false;
let binanceUsMarketsLoaded = false;

async function ensureMarketsLoaded(): Promise<void> {
  if (!binanceGlobalMarketsLoaded) {
    try {
      await binanceGlobal.loadMarkets();
      binanceGlobalMarketsLoaded = true;
    } catch (e) {
      console.warn('Failed to load Binance Global markets:', e);
    }
  }
  if (!binanceUsMarketsLoaded) {
    try {
      await binance.loadMarkets();
      binanceUsMarketsLoaded = true;
    } catch (e) {
      console.warn('Failed to load Binance US markets:', e);
    }
  }
}

function normalizePair(pair: string): string {
  return pair.replace(/-/g, '/').toUpperCase();
}

function getCachedPrice(pair: string): PriceSnapshot | null {
  const entry = priceCache.get(pair);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    priceCache.delete(pair);
    return null;
  }
  return entry.data;
}

function getStalePrice(pair: string): PriceSnapshot | null {
  const entry = priceCache.get(pair);
  return entry ? entry.data : null;
}

function setCachedPrice(pair: string, data: PriceSnapshot) {
  priceCache.set(pair, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function extractPriceSnapshot(ticker: Ticker): PriceSnapshot {
  const price = Number(ticker.last ?? ticker.close ?? ticker.ask ?? ticker.bid ?? 0);
  const volume24h = Number(ticker.quoteVolume ?? ticker.baseVolume ?? 0);
  const high24h = Number(ticker.high ?? 0);
  const low24h = Number(ticker.low ?? 0);
  let change24h = Number(ticker.percentage ?? ticker.change ?? 0);

  if (!Number.isFinite(change24h)) {
    change24h = 0;
  }

  if ((ticker.percentage === undefined || ticker.percentage === null) && ticker.open && price) {
    const open = Number(ticker.open);
    if (Number.isFinite(open) && open !== 0) {
      change24h = ((price - open) / open) * 100;
    }
  }

  const timestamp = new Date(ticker.timestamp ?? Date.now());
  return {
    price: Number.isFinite(price) ? price : 0,
    volume24h: Number.isFinite(volume24h) ? volume24h : 0,
    change24h,
    high24h: Number.isFinite(high24h) && high24h > 0 ? high24h : (Number.isFinite(price) ? price : 0),
    low24h: Number.isFinite(low24h) && low24h > 0 ? low24h : (Number.isFinite(price) ? price : 0),
    timestamp
  };
}

function isSymbolError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /symbol|market|pair|BadSymbol|ExchangeError/i.test(message);
}

function isTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /timeout|timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN/i.test(message);
}

async function fetchTickerWithFallback(pair: string): Promise<Ticker> {
  // Ensure markets are loaded for proper symbol resolution
  await ensureMarketsLoaded();
  
  // Normalize pair format - try both with and without slash
  const pairVariants = [
    pair,
    pair.replace('/', ''),  // BTCUSDT format
    pair.replace(/(\w+)\/(\w+)/, '$1/$2'),  // Ensure slash format
  ].filter((v, i, arr) => arr.indexOf(v) === i); // unique values

  // Try Binance.US first (works from US servers / Railway)
  for (const variant of pairVariants) {
    try {
      // Check if symbol exists in loaded markets
      if (binanceUsMarketsLoaded && binance.markets && binance.markets[variant]) {
        return await binance.fetchTicker(variant);
      }
    } catch (error) {
      // Continue to next variant
    }
  }
  
  // Try the standard pair if no variant worked
  try {
    return await binance.fetchTicker(pair);
  } catch (error) {
    if (!isSymbolError(error)) {
      console.warn(`Binance.US ticker fetch failed for ${pair}:`, error);
    }
  }

  // Try Binance Global with market check (works for most altcoins)
  for (const variant of pairVariants) {
    try {
      if (binanceGlobalMarketsLoaded && binanceGlobal.markets && binanceGlobal.markets[variant]) {
        return await binanceGlobal.fetchTicker(variant);
      }
    } catch (error) {
      // Continue to next variant
    }
  }
  
  // Try standard pair on Binance Global
  try {
    return await binanceGlobal.fetchTicker(pair);
  } catch (error) {
    if (!isSymbolError(error)) {
      console.warn(`Binance Global ticker fetch failed for ${pair}:`, error);
    }
  }

  // Last resort: Coinbase
  try {
    return await coinbase.fetchTicker(pair);
  } catch (error) {
    console.warn(`All exchanges failed for ${pair}. Binance US loaded: ${binanceUsMarketsLoaded}, Binance Global loaded: ${binanceGlobalMarketsLoaded}`);
    throw error;
  }
}

async function fetchOhlcvWithFallback(
  pair: string,
  timeframe: string,
  limit: number
): Promise<OHLCV[]> {
  try {
    return await binance.fetchOHLCV(pair, timeframe, undefined, limit);
  } catch (error) {
    if (!isSymbolError(error)) {
      console.warn('Binance.US OHLCV fetch failed, trying Binance global:', error);
    }
  }

  try {
    return await binanceGlobal.fetchOHLCV(pair, timeframe, undefined, limit);
  } catch (error) {
    if (!isSymbolError(error)) {
      console.warn('Binance global OHLCV fetch failed, trying Coinbase:', error);
    }
  }

  return await coinbase.fetchOHLCV(pair, timeframe, undefined, limit);
}

export async function getCurrentPrice(pair: string): Promise<PriceSnapshot> {
  const normalized = normalizePair(pair);
  const cached = getCachedPrice(normalized);
  if (cached) return cached;

  try {
    const ticker = await fetchTickerWithFallback(normalized);
    const snapshot = extractPriceSnapshot(ticker);
    setCachedPrice(normalized, snapshot);
    return snapshot;
  } catch (error) {
    if (isTimeoutError(error)) {
      const stale = getStalePrice(normalized);
      if (stale) return stale;
    }
    throw error;
  }
}

export async function getOHLCV(pair: string, timeframe: string, limit: number): Promise<OhlcvCandle[]> {
  const normalized = normalizePair(pair);
  const rows = await fetchOhlcvWithFallback(normalized, timeframe, limit);
  return rows.map((row) => ({
    time: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5])
  }));
}

export async function getMultiplePrices(pairs: string[]): Promise<Record<string, PriceSummary>> {
  const results: Record<string, PriceSummary> = {};
  const normalizedPairs = pairs.map((pair) => normalizePair(pair));

  const snapshots = await Promise.all(
    normalizedPairs.map(async (pair) => {
      try {
        const snapshot = await getCurrentPrice(pair);
        return [pair, snapshot] as const;
      } catch (error) {
        console.warn(`Price fetch failed for ${pair}:`, error);
        return [pair, null] as const;
      }
    })
  );

  for (const [pair, snapshot] of snapshots) {
    if (!snapshot) continue;
    results[pair] = {
      price: snapshot.price,
      volume24h: snapshot.volume24h,
      change24h: snapshot.change24h,
      high24h: snapshot.high24h,
      low24h: snapshot.low24h
    };
  }

  return results;
}

export async function getTopCoins(limit: number): Promise<Array<{ pair: string; price: number; volume24h: number; change24h: number }>> {
  try {
    const tickers = await binance.fetchTickers();
    const entries = Object.entries(tickers)
      .filter(([symbol]) => symbol.endsWith('/USDT'))
      .map(([symbol, ticker]) => {
        const snapshot = extractPriceSnapshot(ticker);
    return {
      pair: symbol,
      price: snapshot.price,
      volume24h: snapshot.volume24h,
      change24h: snapshot.change24h,
      high24h: snapshot.high24h,
      low24h: snapshot.low24h
    };
  })
  .sort((a, b) => b.volume24h - a.volume24h);

    return entries.slice(0, limit);
  } catch (error) {
    console.warn('Binance top coins fetch failed, trying Coinbase:', error);
  }

  const tickers = await coinbase.fetchTickers();
  const entries = Object.entries(tickers)
    .filter(([symbol]) => symbol.endsWith('/USD'))
    .map(([symbol, ticker]) => {
      const snapshot = extractPriceSnapshot(ticker);
    return {
      pair: symbol,
      price: snapshot.price,
      volume24h: snapshot.volume24h,
      change24h: snapshot.change24h,
      high24h: snapshot.high24h,
      low24h: snapshot.low24h
    };
  })
  .sort((a, b) => b.volume24h - a.volume24h);

  return entries.slice(0, limit);
}

export async function getPrice(pair: string): Promise<PriceSnapshot> {
  return getCurrentPrice(pair);
}

export async function getBatchPrices(pairs: string[]): Promise<Record<string, PriceSummary>> {
  return getMultiplePrices(pairs);
}
