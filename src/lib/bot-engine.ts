import {
  createTrade,
  enterTrade,
  exitTrade,
  getBot,
  getPaperAccount,
  getTradesForBoard,
  logBotExecution,
  pool,
  savePortfolioSnapshot
} from './database';
import { getStrategy } from './strategies';
import { getBatchPrices, getPrice, getTopCoins } from './price-service';
import {
  calculateDrift,
  calculateRebalanceTrades,
  getTargetAllocation,
  needsRebalance
} from './rebalancer';
import { COIN_CATEGORIES, DEFAULT_WATCHLIST, scanCoins } from './coin-scanner';

interface BotContext {
  bot: any;
  balance: number;
  activeTrades: any[];
  prices: Map<string, number>;
}

type EntrySignal = {
  coin_pair: string;
  direction: string;
  confidence: number;
  reason: string;
  position_size?: number;
};

function normalizePair(pair: string): string {
  return pair.replace(/-/g, '/').toUpperCase();
}

function toNumber(value: unknown, fallback: number = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildSyntheticSeries(currentPrice: number, change24h: number, points: number = 20): number[] {
  const length = Math.max(2, points);
  const startPrice = currentPrice / (1 + change24h / 100 || 1);
  const series: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const t = i / (length - 1);
    series.push(startPrice + (currentPrice - startPrice) * t);
  }
  return series;
}

function buildSyntheticVolumes(volume24h: number, change24h: number, points: number = 20): number[] {
  const length = Math.max(2, points);
  const base = volume24h / length;
  const spike = Math.min(3, Math.abs(change24h) / 5);
  const series: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const t = i / (length - 1);
    series.push(base * (1 + spike * t * 0.2));
  }
  return series;
}

function findCategory(pair: string): keyof typeof COIN_CATEGORIES {
  const normalized = normalizePair(pair);
  if (COIN_CATEGORIES.bitcoin.includes(normalized)) return 'bitcoin';
  if (COIN_CATEGORIES.largeCapAlts.includes(normalized)) return 'largeCapAlts';
  if (COIN_CATEGORIES.midCapAlts.includes(normalized)) return 'midCapAlts';
  if (COIN_CATEGORIES.smallCapAlts.includes(normalized)) return 'smallCapAlts';
  return 'stablecoins';
}

async function loadActiveTrades(bot: any): Promise<any[]> {
  const trades = await getTradesForBoard(bot.board_id);
  return trades.filter((trade) =>
    Number(trade.bot_id) === Number(bot.id) &&
    (trade.status === 'active' || trade.column_name === 'Active')
  );
}

async function buildPriceMap(pairs: string[]): Promise<Map<string, number>> {
  if (!pairs.length) return new Map();
  const prices = await getBatchPrices(pairs);
  const map = new Map<string, number>();
  for (const pair of pairs) {
    const snapshot = prices[normalizePair(pair)];
    if (!snapshot) continue;
    map.set(normalizePair(pair), toNumber(snapshot.price, 0));
  }
  return map;
}

async function getPriceForPair(context: BotContext, pair: string) {
  const normalized = normalizePair(pair);
  const cached = context.prices.get(normalized);
  if (cached !== undefined) return cached;
  const snapshot = await getPrice(normalized);
  const price = toNumber(snapshot.price, 0);
  context.prices.set(normalized, price);
  return price;
}

// Main execution function — called by cron or API trigger
export async function executeBotCycle(botId: number): Promise<{ actions: string[]; errors: string[] }> {
  const actions: string[] = [];
  const errors: string[] = [];

  try {
    const bot = await getBot(botId);
    if (!bot) {
      errors.push('Bot not found');
      return { actions, errors };
    }

    const strategy = getStrategy(bot.strategy_style, bot.strategy_substyle);
    if (!strategy) {
      errors.push('Strategy not found');
      await logBotExecution(botId, 'error', { message: 'Strategy not found' });
      return { actions, errors };
    }

    const account = await getPaperAccount(bot.board_id, bot.user_id, 10000);
    const balance = toNumber(account?.current_balance, 0);
    const activeTrades = await loadActiveTrades(bot);
    const priceMap = await buildPriceMap(activeTrades.map((trade) => trade.coin_pair));

    const context: BotContext = {
      bot,
      balance,
      activeTrades,
      prices: priceMap
    };

    const exits = await checkExits(context);
    if (exits.length) {
      actions.push(...exits.map((exit) => `exit:${exit.tradeId}`));
    }

    const refreshedAccount = await getPaperAccount(bot.board_id, bot.user_id, 10000);
    context.balance = toNumber(refreshedAccount?.current_balance, context.balance);
    context.activeTrades = await loadActiveTrades(bot);
    context.prices = await buildPriceMap(context.activeTrades.map((trade) => trade.coin_pair));

    const entries = await scanForEntries(context);
    for (const entry of entries) {
      if (context.balance <= 0) break;
      const executed = await executeEntry(context, entry);
      if (executed) {
        actions.push(`entry:${entry.coin_pair}`);
      }
      const updatedAccount = await getPaperAccount(bot.board_id, bot.user_id, 10000);
      context.balance = toNumber(updatedAccount?.current_balance, context.balance);
    }

    if (bot.rebalancer_enabled) {
      const rebalanceResult = await checkRebalance(context);
      if (rebalanceResult?.action) {
        actions.push(`rebalance:${rebalanceResult.action}`);
      }
    }

    await logBotExecution(botId, 'cycle', { actions, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    try {
      await logBotExecution(botId, 'error', { message });
    } catch {
      // ignore logging errors
    }
  }

  return { actions, errors };
}

// Step-by-step implementation:

export async function checkExits(context: BotContext): Promise<{ tradeId: number; reason: string }[]> {
  const exits: { tradeId: number; reason: string }[] = [];
  const strategy = getStrategy(context.bot.strategy_style, context.bot.strategy_substyle);
  if (!strategy) return exits;
  const config = { ...strategy.defaultConfig, ...(context.bot.strategy_config ?? {}) };

  for (const trade of context.activeTrades) {
    try {
      const pair = trade.coin_pair;
      const snapshot = await getPrice(normalizePair(pair));
      const currentPrice = toNumber(snapshot.price, 0);
      const enrichedTrade = {
        ...trade,
        current_price: currentPrice,
        high24h: snapshot.high24h,
        low24h: snapshot.low24h,
        change24h: snapshot.change24h,
        volume24h: snapshot.volume24h,
        price_history: buildSyntheticSeries(currentPrice, snapshot.change24h),
        volume_history: buildSyntheticVolumes(snapshot.volume24h, snapshot.change24h)
      };
      const decision = strategy.shouldExit(enrichedTrade, currentPrice, config);
      if (decision.exit) {
        await executeExit(context, Number(trade.id), decision.reason || 'Strategy exit');
        exits.push({ tradeId: Number(trade.id), reason: decision.reason || 'Strategy exit' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logBotExecution(context.bot.id, 'exit_error', { tradeId: trade.id, message });
    }
  }

  return exits;
}

export async function scanForEntries(context: BotContext): Promise<EntrySignal[]> {
  const strategy = getStrategy(context.bot.strategy_style, context.bot.strategy_substyle);
  if (!strategy) return [];
  const config = { ...strategy.defaultConfig, ...(context.bot.strategy_config ?? {}) };

  const activePairs = new Set(context.activeTrades.map((trade) => normalizePair(trade.coin_pair)));
  if (context.activeTrades.length >= config.maxPositions) return [];

  let coins = await scanCoins(Array.isArray(config.watchlist) ? config.watchlist : DEFAULT_WATCHLIST);
  if (!coins.length) {
    const top = await getTopCoins(config.maxPositions * 3);
    coins = top.map((coin) => ({
      pair: coin.pair,
      price: toNumber(coin.price, 0),
      volume24h: toNumber(coin.volume24h, 0),
      change24h: toNumber(coin.change24h, 0),
      high24h: toNumber((coin as any).high24h ?? coin.price, 0),
      low24h: toNumber((coin as any).low24h ?? coin.price, 0),
      category: findCategory(coin.pair)
    }));
  }

  const avgVolume = coins.length
    ? coins.reduce((sum, coin) => sum + coin.volume24h, 0) / coins.length
    : 0;

  const enrichedCoins = coins.map((coin) => {
    const prices = buildSyntheticSeries(coin.price, coin.change24h);
    const volumes = buildSyntheticVolumes(coin.volume24h, coin.change24h);
    return {
      ...coin,
      coin_pair: coin.pair,
      current_price: coin.price,
      price_history: prices,
      volume_history: volumes,
      prices,
      volumes,
      avg_volume_global: avgVolume
    };
  });

  const signals = await strategy.generateSignals(enrichedCoins);
  const ranked: EntrySignal[] = [];

  for (const signal of signals) {
    if (signal.action !== 'buy') continue;
    const normalized = normalizePair(signal.coin_pair);
    if (activePairs.has(normalized)) continue;
    const coin = enrichedCoins.find((item) => normalizePair(item.pair) === normalized);
    if (!coin) continue;
    const currentPrice = toNumber(coin.price, 0);
    if (!strategy.shouldEnter(coin, currentPrice, config)) continue;

    ranked.push({
      coin_pair: normalized,
      direction: 'long',
      confidence: signal.confidence,
      reason: signal.reason
    });
  }

  const availableSlots = Math.max(0, config.maxPositions - context.activeTrades.length);
  if (!availableSlots) return [];

  const positionSize = context.balance * (config.positionSizePercent / 100);
  if (!Number.isFinite(positionSize) || positionSize <= 0 || positionSize > context.balance) return [];

  return ranked
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, availableSlots);
}

export async function executeEntry(context: BotContext, signal: EntrySignal): Promise<any> {
  const strategy = getStrategy(context.bot.strategy_style, context.bot.strategy_substyle);
  if (!strategy) return null;
  const config = { ...strategy.defaultConfig, ...(context.bot.strategy_config ?? {}) };

  const snapshot = await getPrice(signal.coin_pair);
  const currentPrice = toNumber(snapshot.price, 0);
  const positionSize = signal.position_size ?? context.balance * (config.positionSizePercent / 100);

  if (!Number.isFinite(positionSize) || positionSize <= 0 || positionSize > context.balance) {
    await logBotExecution(context.bot.id, 'entry_skipped', { reason: 'Insufficient balance', signal });
    return null;
  }

  const trade = await createTrade(context.bot.board_id, context.bot.user_id, {
    coin_pair: signal.coin_pair,
    direction: signal.direction,
    current_price: currentPrice,
    position_size: positionSize,
    stop_loss: currentPrice * (1 - config.stopLossPercent / 100),
    take_profit: currentPrice * (1 + config.takeProfitPercent / 100),
    confidence_score: Math.round(signal.confidence),
    bot_id: context.bot.id,
    notes: signal.reason,
    status: 'watching',
    column_name: 'Watchlist'
  });

  const entered = await enterTrade(trade.id, currentPrice, context.bot.user_id);
  await logBotExecution(context.bot.id, 'trade_entry', {
    tradeId: trade.id,
    pair: signal.coin_pair,
    price: currentPrice,
    position_size: positionSize,
    reason: signal.reason
  });

  return entered;
}

export async function executeExit(context: BotContext, tradeId: number, reason: string): Promise<any> {
  const trade = context.activeTrades.find((item) => Number(item.id) === tradeId);
  const pair = trade?.coin_pair ?? '';
  const snapshot = pair ? await getPrice(pair) : null;
  const currentPrice = snapshot ? toNumber(snapshot.price, 0) : (pair ? await getPriceForPair(context, pair) : 0);

  const exited = await exitTrade(tradeId, currentPrice, reason, context.bot.user_id);
  await logBotExecution(context.bot.id, 'trade_exit', {
    tradeId,
    pair,
    price: currentPrice,
    reason
  });
  return exited;
}

export async function checkRebalance(context: BotContext): Promise<any> {
  const bot = context.bot;
  const config = bot.rebalancer_config ?? {};
  const riskLevel = Number(config.riskLevel ?? bot.strategy_config?.riskLevel ?? 5);
  const threshold = Number(config.rebalanceThreshold ?? 5);

  const allocations: Record<string, { coin: string; value: number; category: string }[]> = {
    stablecoins: [],
    bitcoin: [],
    largeCapAlts: [],
    midCapAlts: [],
    smallCapAlts: []
  };

  let totalValue = 0;
  for (const trade of context.activeTrades) {
    const pair = normalizePair(trade.coin_pair);
    const snapshot = await getPrice(pair);
    const currentPrice = toNumber(snapshot.price, 0);
    const entryPrice = toNumber(trade.entry_price, currentPrice || 1);
    const positionSize = toNumber(trade.position_size, 0);
    const direction = String(trade.direction || 'long').toLowerCase();

    let value = positionSize;
    if (entryPrice > 0 && positionSize > 0) {
      const change = (currentPrice - entryPrice) / entryPrice;
      value = positionSize + positionSize * (direction === 'short' ? -change : change);
    }

    const category = findCategory(pair);
    allocations[category].push({ coin: pair, value, category });
    totalValue += value;
  }

  if (context.balance > 0) {
    allocations.stablecoins.push({ coin: 'CASH', value: context.balance, category: 'stablecoins' });
    totalValue += context.balance;
  }

  if (totalValue <= 0) return { action: 'skipped', reason: 'No holdings' };

  const currentAllocation: Record<string, number> = {};
  for (const [category, holdings] of Object.entries(allocations)) {
    const value = holdings.reduce((sum, holding) => sum + Number(holding.value || 0), 0);
    currentAllocation[category] = (value / totalValue) * 100;
  }

  const target = getTargetAllocation(riskLevel);
  const drift = calculateDrift(currentAllocation, target);
  if (!needsRebalance(drift, threshold)) {
    await savePortfolioSnapshot(bot.id, currentAllocation, totalValue);
    return { action: 'none', drift };
  }

  const { sell, buy } = calculateRebalanceTrades(allocations as any, target, totalValue);

  const sellResults: any[] = [];
  for (const sellOrder of sell) {
    const trade = context.activeTrades.find((t) => normalizePair(t.coin_pair) === normalizePair(sellOrder.coin));
    if (!trade) continue;
    const exited = await executeExit(context, Number(trade.id), 'Rebalance sell');
    sellResults.push({ tradeId: trade.id, coin: trade.coin_pair, result: exited });
  }

  const buyResults: any[] = [];
  for (const buyOrder of buy) {
    if (String(buyOrder.coin).endsWith('_BASKET') || buyOrder.coin === 'CASH') continue;
    const positionSize = Math.min(buyOrder.amount, context.balance);
    if (!Number.isFinite(positionSize) || positionSize <= 0) continue;
    const entry = await executeEntry(context, {
      coin_pair: buyOrder.coin,
      direction: 'long',
      confidence: 55,
      reason: 'Rebalance buy',
      position_size: positionSize
    });
    buyResults.push({ coin: buyOrder.coin, result: entry });
    const updatedAccount = await getPaperAccount(bot.board_id, bot.user_id, 10000);
    context.balance = toNumber(updatedAccount?.current_balance, context.balance);
  }

  await savePortfolioSnapshot(bot.id, currentAllocation, totalValue);
  await logBotExecution(bot.id, 'rebalance', { drift, sell: sellResults, buy: buyResults });

  return { action: 'rebalance', drift, sell: sellResults, buy: buyResults };
}

// Run all active bots — called by cron
export async function runAllActiveBots(): Promise<{ botId: number; actions: string[]; errors: string[] }[]> {
  const results: { botId: number; actions: string[]; errors: string[] }[] = [];
  const query = await pool.query(`SELECT id FROM trading_bots WHERE status = 'running'`);

  for (const row of query.rows) {
    const botId = Number(row.id);
    if (!Number.isFinite(botId)) continue;
    try {
      const result = await executeBotCycle(botId);
      results.push({ botId, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ botId, actions: [], errors: [message] });
    }
  }

  return results;
}
