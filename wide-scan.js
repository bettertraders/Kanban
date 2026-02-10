const ccxt = require('ccxt');
const exchange = new ccxt.binance({ enableRateLimit: true });

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const rs = (gains / period) / (losses / period || 0.001);
  return 100 - 100 / (1 + rs);
}

function calcSMA(closes, period) {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

(async () => {
  // Get all USDT pairs with decent volume
  const tickers = await exchange.fetchTickers();
  const usdtPairs = Object.entries(tickers)
    .filter(([s, t]) => s.endsWith('/USDT') && t.quoteVolume > 5000000) // >$5M daily vol
    .sort((a, b) => b[1].quoteVolume - a[1].quoteVolume)
    .slice(0, 100); // Top 100 by volume
  
  console.log(`Scanning ${usdtPairs.length} coins with >$5M volume...\n`);
  
  const results = [];
  for (const [symbol, ticker] of usdtPairs) {
    try {
      const ohlcv = await exchange.fetchOHLCV(symbol, '4h', undefined, 60);
      if (ohlcv.length < 30) continue;
      const closes = ohlcv.map(c => c[4]);
      const price = closes[closes.length - 1];
      const rsi = calcRSI(closes);
      const sma20 = calcSMA(closes, 20);
      
      // 24h change
      const change24h = ticker.percentage || 0;
      
      // Last 3 candles momentum (are we bouncing?)
      const recentMom = closes.length >= 3 ? ((closes[closes.length-1] - closes[closes.length-3]) / closes[closes.length-3] * 100) : 0;
      
      // IDEAL ENTRY: oversold (RSI<40) BUT showing short-term bounce (positive recent momentum)
      let score = 0;
      if (rsi < 30) score += 3;
      else if (rsi < 35) score += 2;
      else if (rsi < 40) score += 1;
      
      // Bouncing = positive recent momentum while still oversold
      if (rsi < 40 && recentMom > 0) score += 3; // THE KEY: oversold + bouncing
      if (recentMom > 1) score += 1;
      if (recentMom > 3) score += 1;
      
      // Near SMA20 support
      if (sma20 && Math.abs(price - sma20) / sma20 < 0.03) score += 1;
      
      if (score >= 3) {
        results.push({ symbol, price, rsi: rsi?.toFixed(1), change24h: change24h.toFixed(1), recentMom: recentMom.toFixed(2), vol: (ticker.quoteVolume/1e6).toFixed(0), score });
      }
    } catch {}
  }
  
  results.sort((a, b) => b.score - a.score);
  console.log('🔥 TOP ENTRY CANDIDATES (oversold + bouncing):\n');
  console.log('Symbol          | Price        | RSI  | 24h%   | Bounce% | Vol($M) | Score');
  console.log('----------------|-------------|------|--------|---------|---------|------');
  for (const r of results.slice(0, 20)) {
    console.log(`${r.symbol.padEnd(16)}| $${String(r.price).padEnd(10)}| ${r.rsi.padEnd(5)}| ${(r.change24h+'%').padEnd(7)}| ${(r.recentMom+'%').padEnd(8)}| ${r.vol.padEnd(8)}| ${r.score}`);
  }
})();
