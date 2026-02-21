import ccxt from "ccxt";

const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY || "";
const KRAKEN_API_SECRET = process.env.KRAKEN_API_SECRET || "";

/**
 * Get actual balance from Kraken exchange
 * Returns total USD value of account (USD + crypto positions at current prices)
 */
export async function getKrakenBalance(boardId?: number): Promise<number | null> {
  if (!KRAKEN_API_KEY || !KRAKEN_API_SECRET) {
    console.error("[Kraken] API keys not configured");
    return null;
  }

  try {
    const exchange = new ccxt.kraken({
      apiKey: KRAKEN_API_KEY,
      secret: KRAKEN_API_SECRET,
      enableRateLimit: true,
    });

    // Fetch balance and tickers
    const balance = await exchange.fetchBalance();
    const tickers = await exchange.fetchTickers();

    let totalUSD = balance.total?.USD || 0;

    // Calculate USD value of each crypto position
    for (const [asset, amount] of Object.entries(balance.total || {})) {
      if (asset === "USD" || amount <= 0) continue;

      const symbol = `${asset}/USD`;
      const ticker = tickers[symbol];
      
      if (ticker && ticker.last) {
        totalUSD += amount * ticker.last;
      }
    }

    return Math.round(totalUSD * 100) / 100;
  } catch (error) {
    console.error("[Kraken] Error fetching balance:", error.message);
    return null;
  }
}

/**
 * Get detailed Kraken positions
 */
export async function getKrakenPositions(): Promise<any[]> {
  if (!KRAKEN_API_KEY || !KRAKEN_API_SECRET) {
    return [];
  }

  try {
    const exchange = new ccxt.kraken({
      apiKey: KRAKEN_API_KEY,
      secret: KRAKEN_API_SECRET,
      enableRateLimit: true,
    });

    const balance = await exchange.fetchBalance();
    const tickers = await exchange.fetchTickers();
    const positions = [];

    for (const [asset, amount] of Object.entries(balance.total || {})) {
      if (asset === "USD" || amount <= 0) continue;

      const symbol = `${asset}/USD`;
      const ticker = tickers[symbol];
      const price = ticker?.last || 0;

      positions.push({
        symbol,
        asset,
        amount,
        price,
        usdValue: amount * price,
      });
    }

    return positions;
  } catch (error) {
    console.error("[Kraken] Error fetching positions:", error.message);
    return [];
  }
}
