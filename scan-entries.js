const ccxt = require('ccxt');

const exchange = new ccxt.binance({ enableRateLimit: true });

const COINS = [
  // Current watchlist
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ATOM/USDT', 'LINK/USDT',
  // Expanded scan
  'AVAX/USDT', 'DOT/USDT', 'MATIC/USDT', 'ADA/USDT', 'NEAR/USDT',
  'FTM/USDT', 'ARB/USDT', 'OP/USDT', 'INJ/USDT', 'SUI/USDT',
  'DOGE/USDT', 'XRP/USDT', 'UNI/USDT', 'AAVE/USDT', 'RENDER/USDT',
];

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
  const results = [];
  for (const symbol of COINS) {
    try {
      const ohlcv = await exchange.fetchOHLCV(symbol, '4h', undefined, 60);
      const closes = ohlcv.map(c => c[4]);
      const volumes = ohlcv.map(c => c[5]);
      const price = closes[closes.length - 1];
      const rsi = calcRSI(closes);
      const sma20 = calcSMA(closes, 20);
      const sma50 = calcSMA(closes, 50);
      const volAvg = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
      const volRatio = volumes[volumes.length - 1] / volAvg;
      const distFromSMA20 = sma20 ? ((price - sma20) / sma20 * 100).toFixed(2) : 'N/A';
      
      // Score: lower RSI + near SMA20 + volume = better entry
      let score = 0;
      if (rsi < 35) score += 3;
      else if (rsi < 40) score += 2;
      else if (rsi < 45) score += 1;
      
      if (sma20 && Math.abs(price - sma20) / sma20 < 0.02) score += 2; // within 2% of SMA20
      if (sma20 && price > sma20 && sma50 && sma20 > sma50) score += 1; // bullish structure
      if (volRatio > 1.2) score += 1;
      
      results.push({ symbol, price, rsi: rsi?.toFixed(1), sma20: sma20?.toFixed(2), distFromSMA20, volRatio: volRatio.toFixed(2), score });
    } catch (e) {
      // skip
    }
  }
  
  results.sort((a, b) => b.score - a.score);
  console.log('\n📊 ENTRY SCAN — Sorted by opportunity score:\n');
  console.log('Symbol       | Price       | RSI   | Dist SMA20 | Vol Ratio | Score');
  console.log('-------------|-------------|-------|------------|-----------|------');
  for (const r of results) {
    console.log(`${r.symbol.padEnd(13)}| $${String(r.price).padEnd(10)}| ${String(r.rsi).padEnd(6)}| ${String(r.distFromSMA20 + '%').padEnd(11)}| ${String(r.volRatio).padEnd(10)}| ${r.score}`);
  }
  console.log('\nTop candidates:', results.filter(r => r.score >= 2).map(r => r.symbol).join(', ') || 'None above threshold');
})();
