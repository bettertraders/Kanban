'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToastStack, type ToastItem } from '@/components/ToastStack';
import Link from 'next/link';

type CoinPulse = {
  pair: string;
  price: number;
  change24h: number;
};

type Bot = {
  id: number;
  name: string;
  status: string;
  return_pct?: number;
  strategy_style?: string;
  strategy_substyle?: string;
  performance?: {
    total_trades?: number;
    return_pct?: number;
    total_return?: number;
  };
  total_trades?: number;
};

type PortfolioStats = {
  summary?: {
    total_portfolio_value?: number;
    total_realized_pnl?: number;
    total_unrealized_pnl?: number;
    daily_pnl?: number;
    weekly_pnl?: number;
    paper_balance?: number;
    starting_balance?: number;
    win_rate?: number;
    active_positions?: number;
    total_trades?: number;
    closed_trades?: number;
  };
  byCoin?: Array<{ coin_pair: string; total_pnl: number; total_trades?: number; allocation_pct?: number }>;
  activeHoldings?: Array<{ coin_pair: string; position_size: number; entry_price: number; direction?: string }>;
};

type Board = {
  id: number;
  board_type: string;
};

type MarketSentiment = {
  value?: number;
  label?: string;
};

type MarketDetail = {
  overview?: {
    btc?: { price?: number; change24h?: number };
    eth?: { price?: number; change24h?: number };
    totalMarketCap?: number;
    btcDominance?: number;
    fearGreed?: { value?: number; label?: string };
  };
  movers?: {
    gainers?: Array<{ change24h?: number }>;
    losers?: Array<{ change24h?: number }>;
  };
};

type RiskLevel = 'safe' | 'balanced' | 'bold';
type Timeframe = '10' | '30' | '60' | '90' | 'unlimited';

const RISK_LEVELS: Record<RiskLevel, { label: string; icon: string; description: string }> = {
  safe: { label: 'Safe', icon: '🛡️', description: 'Investment-heavy. BTC & ETH core holdings.' },
  balanced: { label: 'Balanced', icon: '⚖️', description: 'Top 20 mix. Investment + active trading.' },
  bold: { label: 'Bold', icon: '🔥', description: 'Active trading. Momentum plays, shorts enabled.' },
};

const RISK_DESCRIPTIONS: Record<RiskLevel, string> = {
  safe: '60% investment, 20% active trading, 20% cash. No shorts. 24h cooldown.',
  balanced: '30% investment, 50% active trading, 20% cash. Shorts enabled. 8h cooldown.',
  bold: '10% investment, 70% active trading, 20% cash. Shorts enabled, momentum catches, 4h cooldown.',
};

type StrategyData = {
  id: string;
  name: string;
  direction: 'long' | 'short' | 'both';
  type: string;
  active?: boolean;
  tradeCount?: number;
  indicators?: string[];
  avgHoldTime?: string;
  conditions?: string;
};

type StrategiesResponse = {
  strategies: StrategyData[];
  allocation: { investment: number; activeTrading: number; cash: number };
  marketRegime: string;
  fearGreedIndex: number;
};

const TIMEFRAME_OPTIONS: { value: Timeframe; label: string }[] = [
  { value: '10', label: '10 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: 'unlimited', label: 'Unlimited' },
];

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCurrencyShort(value: number) {
  if (!Number.isFinite(value)) return '—';
  if (value === Math.floor(value)) return `$${value.toLocaleString()}`;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getBotQuote(pnlPct: number, _winRate: number, _activePositions: number, isEngineOn: boolean, totalTrades: number): { text: string; color: string } {
  const onFire = [
    "Penny is on fire today! 🔥",
    "Someone call the fire department! 🚒",
    "This is what a good day looks like 💰",
    "Penny's cooking! Don't disturb the chef 👨‍🍳",
    "Today's looking beautiful ☀️",
  ];
  const doingWell = [
    "Steady gains — this is the way 📈",
    "Slow and steady wins the race 🐢",
    "Nice work! The strategy is paying off 💪",
    "Green is my favorite color 💚",
    "Keep calm and let the bot trade 🧘",
  ];
  const flat = [
    "Flat market — watching for the next move 🎯",
    "Sometimes the best trade is no trade 🤔",
    "Sideways markets build character 💎",
    "Waiting for the right moment... 🎯",
    "Not every day is exciting — and that's okay ☕",
  ];
  const downBit = [
    "A small dip — nothing to worry about 🌊",
    "Every great trader has red days 📉",
    "This is normal! Stay the course 🧭",
    "Zoom out — one day doesn't define us 🔭",
    "Deep breaths. The bot's got this 💙",
  ];
  const roughDay = [
    "Tough day, but we'll bounce back 💪",
    "Even Warren Buffett has bad days 🎩",
    "This is why we paper trade first! 📝",
    "Learning from losses makes us stronger 🧠",
    "Rome wasn't built in a day — neither are profits 🏛️",
  ];
  const engineOff = [
    "Ready when you are! 🚀",
    "Flip the switch and let's go 🎮",
    "Standing by... 🤖",
  ];
  const noTrades = [
    "Let's make some trades 🎯",
    "Your first trade is just a toggle away ✨",
    '"The stock market is a device for transferring money from the impatient to the patient." — Warren Buffett',
    '"In investing, what is comfortable is rarely profitable." — Robert Arnott',
    '"The goal of a successful trader is to make the best trades. Money is secondary." — Alexander Elder',
    '"Risk comes from not knowing what you\'re doing." — Warren Buffett',
    '"Markets can remain irrational longer than you can remain solvent." — John Maynard Keynes',
  ];

  // Seeded random based on current hour so it changes hourly but not on re-render
  const seed = new Date().getFullYear() * 10000 + (new Date().getMonth() + 1) * 100 + new Date().getDate() * 24 + new Date().getHours();
  const pick = (arr: string[]) => arr[seed % arr.length];

  if (!isEngineOn) return { text: pick(engineOff), color: 'var(--muted)' };
  if (totalTrades === 0) return { text: pick(noTrades), color: '#4ade80' };
  if (pnlPct > 5) return { text: pick(onFire), color: '#4ade80' };
  if (pnlPct > 1) return { text: pick(doingWell), color: '#4ade80' };
  if (pnlPct >= -1) return { text: pick(flat), color: 'var(--muted)' };
  if (pnlPct >= -5) return { text: pick(downBit), color: '#f5b544' };
  return { text: pick(roughDay), color: '#f05b6f' };
}

type PennyUpdateData = {
  marketTrend: 'up' | 'down' | 'flat';
  btcChange: number;
  btcPrice: number;
  pnlToday: number;
  activePositions: number;
  engineOn: boolean;
  riskLevel: RiskLevel | null;
  dayOfTimeframe: number | null;
  timeframeDays: number | null;
  winRate: number;
  totalTrades: number;
  fearGreed: number;
  fearGreedLabel: string;
  tradeScore: number;
};

function generatePennyUpdate(data: PennyUpdateData): string {
  const { marketTrend, btcChange, btcPrice, pnlToday, activePositions, engineOn, riskLevel, dayOfTimeframe, timeframeDays, winRate, totalTrades, fearGreed, fearGreedLabel, tradeScore } = data;
  const rl = riskLevel ? RISK_LEVELS[riskLevel].label.toLowerCase() : 'balanced';
  const absChange = Math.abs(btcChange).toFixed(1);
  const absPnl = Math.abs(pnlToday).toFixed(1);
  const btcK = btcPrice > 0 ? `$${(btcPrice / 1000).toFixed(0)}K` : '';

  // Seed on hour so message stays stable within the hour
  const now = new Date();
  const seed = now.getFullYear() * 1000000 + (now.getMonth() + 1) * 10000 + now.getDate() * 100 + now.getHours();
  const pick = (arr: string[]) => arr[seed % arr.length];

  // Engine OFF — market-aware commentary
  if (!engineOn) {
    if (marketTrend === 'up' && tradeScore >= 60) {
      return pick([
        `Market conditions are heating up — BTC is up ${absChange}% and the vibe is ${fearGreedLabel.toLowerCase()}. Might be a good time to start trading! 🔥`,
        `Seeing some really strong setups forming. BTC pushing ${btcK} with solid momentum. If you're thinking about starting, now's not a bad time 🎯`,
        `Things are looking good out there! BTC at ${btcK}, trade score at ${tradeScore}. Flip the engine on and let's ride this 🚀`,
      ]);
    }
    if (marketTrend === 'down' && fearGreed < 30) {
      return pick([
        `Things are volatile right now — BTC dropped ${absChange}%. Smart to wait it out. I'll let you know when conditions improve ⏳`,
        `Markets are shaky with extreme fear in the air. I'm watching closely though — fear often creates the best opportunities 👀`,
        `Red across the board today. Not the best time to jump in, but I'm tracking support levels. Patience pays 🧘`,
      ]);
    }
    if (marketTrend === 'down') {
      return pick([
        `BTC is testing support around ${btcK} — could be a great entry point soon. I'm watching closely 👀`,
        `Markets pulled back ${absChange}% today. I'm monitoring for a bounce — these dips often set up nice entries 📉➡️📈`,
      ]);
    }
    if (marketTrend === 'flat') {
      return pick([
        `BTC hovering around ${btcK}. I'm scanning for breakout setups. Toggle the engine on when you're ready 🔍`,
        `Markets are consolidating. The Fear & Greed index sits at ${fearGreed} (${fearGreedLabel.toLowerCase()}). Could go either way from here 🤔`,
        `Not much action today, but I'm still watching. Sometimes the best moves come after the quiet periods ⏳`,
      ]);
    }
    // up but low score
    return pick([
      `BTC is up ${absChange}% but conditions are mixed — trade score is only ${tradeScore}. I'd wait for stronger confirmation before jumping in 🎯`,
      `Some green today! BTC at ${btcK}. Conditions are okay but not great. Ready to go when you are though! ✨`,
    ]);
  }

  // Engine ON — trading-aware messages
  if (totalTrades === 0 || (dayOfTimeframe !== null && dayOfTimeframe <= 2)) {
    const day = dayOfTimeframe ?? 1;
    const tf = timeframeDays ? `${timeframeDays}-day` : '';
    return pick([
      `Day ${day} of your ${tf} challenge! Still early — building positions carefully. No rush 🌱`,
      `Just getting started! I'm scanning the market and looking for the best entries. Patience pays off 🔍`,
      `Early days! I'm being selective with entries — quality over quantity. We've got this 💪`,
    ]);
  }

  if (winRate >= 65) {
    const msg = pick([
      `We're at a ${winRate.toFixed(0)}% win rate so far — that's solid! I'm keeping the same approach. If it ain't broke... 💪`,
      `${winRate.toFixed(0)}% win rate and counting! The ${rl} strategy is clicking nicely. Steady as she goes 🎯`,
    ]);
    if (seed % 3 !== 0) return msg;
  }

  if (marketTrend === 'down' && pnlToday < -0.5) {
    return pick([
      `Markets pulled back ${absChange}% today — pretty normal for crypto. I'm holding steady on our positions and watching for a bounce. No panic! 💙`,
      `Red day across the board. I've tightened stop losses just in case, but our ${rl} approach means we're built for days like this. Hang tight ☕`,
    ]);
  }

  if (marketTrend === 'down' && pnlToday >= -0.5) {
    return pick([
      `Markets are down ${absChange}% but we're actually holding up well! The ${rl} strategy is doing its job 🛡️`,
      `BTC dipped ${absChange}% but our positions are resilient. That's what smart risk management looks like 💎`,
    ]);
  }

  if (marketTrend === 'up' && pnlToday > 0.5) {
    return pick([
      `Great day! BTC is pushing higher and our positions are riding the wave. Up ${absPnl}% today — let's see if this momentum holds 🚀`,
      `Everything's green today. I'm watching for a good spot to take some profit. Solid day! ☀️`,
      `Nice momentum! We're up ${absPnl}% with ${activePositions} active position${activePositions !== 1 ? 's' : ''}. Riding this wave carefully 🌊`,
    ]);
  }

  return pick([
    "Quiet day in the markets. I'm scanning for setups but not forcing anything. Sometimes patience IS the strategy 🎯",
    `Sideways action today. I've got ${activePositions} position${activePositions !== 1 ? 's' : ''} working — watching closely for any breakout signals 👀`,
    "Not much happening in crypto today. I'm keeping our positions tight and waiting for the next move 🧘",
  ]);
}

function calculateTradeScore(market: MarketDetail | null, pulse: CoinPulse[]): { score: number; label: string; color: string; explanation: string } {
  if (!market?.overview) {
    // No CoinGecko data — calculate basic score from pulse (CCXT ticker) if available
    if (pulse.length > 0) {
      const upCoins = pulse.filter(c => c.change24h > 0).length;
      const breadth = upCoins / pulse.length;
      const btc = pulse.find(c => c.pair?.includes('BTC'));
      const btcChg = btc?.change24h ?? 0;
      let s = 50;
      if (btcChg > 1) s += 15; else if (btcChg < -1) s -= 10;
      if (breadth > 0.5) s += 10; else s -= 5;
      s = Math.min(100, Math.max(0, s));
      const lbl = s >= 60 ? 'Good' : s >= 40 ? 'Fair' : 'Poor';
      const clr = s >= 60 ? '#4ade80' : s >= 40 ? '#eab308' : '#f97316';
      const desc = btcChg > 0 ? `BTC up ${btcChg.toFixed(1)}%, ${upCoins}/${pulse.length} coins green 📊` : `BTC down ${Math.abs(btcChg).toFixed(1)}%, ${upCoins}/${pulse.length} coins green 📊`;
      return { score: s, label: lbl, color: clr, explanation: desc };
    }
    return { score: 50, label: 'Fair', color: '#9ca3af', explanation: '' };
  }

  let score = 0;
  const parts: string[] = [];

  // BTC trend (0-25 pts)
  const btcChange = market.overview.btc?.change24h ?? 0;
  if (btcChange > 3) { score += 25; parts.push('strong BTC momentum'); }
  else if (btcChange > 1) { score += 20; parts.push('BTC trending up'); }
  else if (btcChange > 0) { score += 15; parts.push('slight BTC uptrend'); }
  else if (btcChange > -1) { score += 5; parts.push('BTC flat'); }
  else { parts.push('BTC under pressure'); }

  // Fear & Greed (0-25 pts) — balanced is best, extreme fear = contrarian opportunity
  const fng = market.overview.fearGreed?.value ?? 50;
  if (fng >= 40 && fng <= 60) { score += 25; parts.push('balanced sentiment'); }
  else if (fng < 25) { score += 20; parts.push('contrarian opportunity'); }
  else if (fng < 40) { score += 15; parts.push('cautious sentiment'); }
  else if (fng <= 75) { score += 10; parts.push('greedy sentiment'); }
  else { score += 5; parts.push('extreme greed — risky'); }

  // Market breadth — gainers vs losers (0-25 pts)
  const gainers = market.movers?.gainers?.length ?? 0;
  const losers = market.movers?.losers?.length ?? 0;
  // Use pulse data for broader breadth check
  const upCoins = pulse.filter(c => c.change24h > 0).length;
  const totalCoins = pulse.length || 1;
  const breadthPct = upCoins / totalCoins;
  if (breadthPct > 0.65) { score += 25; parts.push('broad market strength'); }
  else if (breadthPct > 0.5) { score += 18; parts.push('more gainers than losers'); }
  else if (breadthPct > 0.35) { score += 10; parts.push('mixed market'); }
  else { score += 3; parts.push('mostly red'); }

  // Volume proxy — use absolute change magnitude as volume indicator (0-25 pts)
  const avgAbsChange = pulse.length > 0
    ? pulse.reduce((s, c) => s + Math.abs(c.change24h), 0) / pulse.length
    : 2;
  if (avgAbsChange > 4) { score += 25; parts.push('high volatility'); }
  else if (avgAbsChange > 2.5) { score += 20; parts.push('healthy activity'); }
  else if (avgAbsChange > 1.5) { score += 15; parts.push('moderate activity'); }
  else { score += 10; parts.push('low activity'); }

  score = Math.min(100, Math.max(0, score));

  let label: string, color: string;
  if (score >= 80) { label = 'Excellent'; color = '#22c55e'; }
  else if (score >= 60) { label = 'Good'; color = '#4ade80'; }
  else if (score >= 40) { label = 'Fair'; color = '#9ca3af'; }
  else if (score >= 20) { label = 'Poor'; color = '#f97316'; }
  else { label = 'Wait'; color = '#ef4444'; }

  // Build explanation from top 2 factors
  const explanation = parts.slice(0, 2).join(', ');
  const emoji = score >= 60 ? '📈' : score >= 40 ? '📊' : '⏳';
  return { score, label, color, explanation: `${explanation.charAt(0).toUpperCase() + explanation.slice(1)} ${emoji}` };
}


export default function TradingDashboardPage() {
  const [pulse, setPulse] = useState<CoinPulse[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioStats | null>(null);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [sentiment, setSentiment] = useState<MarketSentiment | null>(null);
  const [marketDetail, setMarketDetail] = useState<MarketDetail | null>(null);

  // Setup state (persisted to localStorage)
  const [riskLevel, setRiskLevel] = useState<RiskLevel | null>(null);
  const [riskValue, setRiskValue] = useState(50); // 0=safe, 50=balanced, 100=bold — continuous slider
  const [tradingAmount, setTradingAmount] = useState<number | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe | null>('10');
  const [timeframeStartDate, setTimeframeStartDate] = useState<string | null>(null);
  const [tboEnabled, setTboEnabled] = useState(true);
  const [engineOn, setEngineOn] = useState(false);
  const [scanningStatus, setScanningStatus] = useState<string | null>(null);

  // Strategy & allocation state
  const [strategies, setStrategies] = useState<StrategyData[]>([]);
  const [strategyAllocation, setStrategyAllocation] = useState<{ investment: number; activeTrading: number; cash: number } | null>(null);
  const [pieView, setPieView] = useState<'holdings' | 'allocation'>('allocation');

  // Dashboard mode (simple vs advanced)
  const [dashboardMode, setDashboardMode] = useState<'simple' | 'advanced'>('advanced');

  // Strategy expansion state (advanced mode)
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);

  // Session locking
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  const [simpleOverrideModalOpen, setSimpleOverrideModalOpen] = useState(false);

  // Modal state
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [amountModalOpen, setAmountModalOpen] = useState(false);
  const [amountInput, setAmountInput] = useState('500');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customAmountMode, setCustomAmountMode] = useState(false);
  const [customAmountInput, setCustomAmountInput] = useState('');
  const [customTimeframeMode, setCustomTimeframeMode] = useState(false);
  const [customTimeframeInput, setCustomTimeframeInput] = useState('');

  const toastIdRef = useRef(1);
  const toastTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Load settings — localStorage first (instant), then sync from DB if available
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load dashboard mode preference
    try {
      const mode = localStorage.getItem('clawdesk-dashboard-mode');
      if (mode === 'simple' || mode === 'advanced') setDashboardMode(mode);
    } catch {}

    // Always load localStorage first (fast, no network)
    try {
      const saved = JSON.parse(localStorage.getItem('clawdesk-trading-setup') || '{}');
      // Migrate old risk level names → new names
      const riskMigration: Record<string, RiskLevel> = { conservative: 'safe', moderate: 'balanced', aggressive: 'bold' };
      if (saved.riskLevel && riskMigration[saved.riskLevel]) {
        saved.riskLevel = riskMigration[saved.riskLevel];
        localStorage.setItem('clawdesk-trading-setup', JSON.stringify(saved));
      }
      if (saved.riskLevel) setRiskLevel(saved.riskLevel);
      if (saved.riskValue != null) setRiskValue(saved.riskValue);
      if (saved.tradingAmount) setTradingAmount(saved.tradingAmount);
      if (saved.timeframe) setTimeframe(saved.timeframe);
      // timeframeStartDate is now controlled by account.created_at — don't load from localStorage
      if (saved.tboEnabled !== undefined) setTboEnabled(saved.tboEnabled);
      if (saved.engineOn !== undefined) setEngineOn(saved.engineOn);
    } catch {}

    // Then try DB — only override if DB has actual data
    (async () => {
      try {
        const res = await fetch('/api/trading/settings?boardId=15');
        if (res.ok) {
          const { settings: saved } = await res.json();
          if (saved && Object.keys(saved).length > 0 && saved.riskLevel) {
            // Migrate old risk level names
            const riskMig: Record<string, string> = { conservative: 'safe', moderate: 'balanced', aggressive: 'bold' };
            if (riskMig[saved.riskLevel]) saved.riskLevel = riskMig[saved.riskLevel];
            setRiskLevel(saved.riskLevel);
            if (saved.tradingAmount) setTradingAmount(saved.tradingAmount);
            if (saved.timeframe) setTimeframe(saved.timeframe);
            // timeframeStartDate is now controlled by account.created_at — don't override from settings
            if (saved.tboEnabled !== undefined) setTboEnabled(saved.tboEnabled);
            if (saved.engineOn !== undefined) setEngineOn(saved.engineOn);
            // Also save to localStorage so it's cached
            localStorage.setItem('clawdesk-trading-setup', JSON.stringify(saved));
          }
        }
      } catch {}
    })();
  }, []);

  // Save settings to both DB and localStorage on any change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Skip saving if all values are still defaults (initial render before load)
    if (riskLevel === null && tradingAmount === null && !engineOn) return;
    const data = { riskLevel, riskValue, tradingAmount, timeframe, timeframeStartDate, tboEnabled, engineOn };
    localStorage.setItem('clawdesk-trading-setup', JSON.stringify(data));
    fetch('/api/trading/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boardId: 15, settings: data }),
    }).catch(() => {});
  }, [riskLevel, riskValue, tradingAmount, timeframe, timeframeStartDate, tboEnabled, engineOn]);

  const pushToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = toastIdRef.current++;
    setToasts(prev => [...prev, { id, message, type }]);
    toastTimersRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete toastTimersRef.current[id];
    }, 3000);
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const [coinsRes, botsRes, portfolioRes, boardsRes] = await Promise.allSettled([
        fetch('/api/v1/prices?top=25'),
        fetch('/api/v1/bots'),
        fetch('/api/v1/portfolio'),
        fetch('/api/v1/boards'),
      ]);

      if (coinsRes.status === 'fulfilled' && coinsRes.value.ok) {
        const j = await coinsRes.value.json();
        setPulse(Array.isArray(j?.coins) ? j.coins : []);
      }
      if (botsRes.status === 'fulfilled' && botsRes.value.ok) {
        const j = await botsRes.value.json();
        setBots(Array.isArray(j?.bots) ? j.bots : []);
      }
      if (portfolioRes.status === 'fulfilled' && portfolioRes.value.ok) {
        const j = await portfolioRes.value.json();
        setPortfolio(j || null);
      }
      // Use account created_at as challenge start date — but only if a challenge is active
      // After reset, localStorage.timeframeStartDate is explicitly null → don't override
      try {
        const acctBoardId = 15;
        const ls = JSON.parse(localStorage.getItem('clawdesk-trading-setup') || '{}');
        if (ls.timeframeStartDate !== null && ls.timeframeStartDate !== undefined) {
          const acctRes = await fetch(`/api/trading/account?boardId=${acctBoardId}`);
          if (acctRes.ok) {
            const acctData = await acctRes.json();
            if (acctData?.account?.created_at) {
              const acctDate = acctData.account.created_at;
              setTimeframeStartDate(acctDate);
              ls.timeframeStartDate = acctDate;
              localStorage.setItem('clawdesk-trading-setup', JSON.stringify(ls));
            }
          }
        }
      } catch {}

      if (boardsRes.status === 'fulfilled' && boardsRes.value.ok) {
        const j = await boardsRes.value.json();
        const boards = Array.isArray(j?.boards) ? j.boards : [];
        const tb = boards.find((b: Board) => b.board_type === 'trading');
        if (tb?.id) setBoardId(tb.id);
      }
    } catch {}
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  // Fetch market sentiment
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/market/sentiment');
        if (res.ok) {
          const data = await res.json();
          setSentiment(data);
        }
      } catch {}
    })();
  }, []);

  // Fetch detailed market data (for trade score + Penny insights)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/trading/market');
        if (res.ok) {
          const data = await res.json();
          setMarketDetail(data);
          // Also use fear & greed from this if sentiment endpoint failed
          if (!sentiment && data?.overview?.fearGreed) {
            setSentiment({ value: data.overview.fearGreed.value, label: data.overview.fearGreed.label });
          }
        }
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch strategies
  useEffect(() => {
    if (!boardId || !riskLevel) return;
    (async () => {
      try {
        const res = await fetch(`/api/trading/strategies?boardId=${boardId}&riskLevel=${riskLevel}`);
        if (res.ok) {
          const data: StrategiesResponse = await res.json();
          setStrategies(data.strategies || []);
          setStrategyAllocation(data.allocation || null);
        }
      } catch {}
    })();
  }, [boardId, riskLevel]);

  // Session locking: locked when engine is running (unless manually unlocked)
  const sessionLocked = engineOn && !settingsUnlocked;
  // Re-lock when engine starts
  useEffect(() => {
    if (engineOn) setSettingsUnlocked(false);
  }, [engineOn]);

  // Dashboard mode toggle
  const toggleDashboardMode = useCallback((mode: 'simple' | 'advanced') => {
    setDashboardMode(mode);
    if (typeof window !== 'undefined') localStorage.setItem('clawdesk-dashboard-mode', mode);
  }, []);

  const startingBalance = Number(portfolio?.summary?.paper_balance ?? portfolio?.summary?.starting_balance ?? 0);
  const realizedPnl = Number(portfolio?.summary?.total_realized_pnl ?? 0);
  // Fetch live P&L from the same price source as the board (CCXT/Binance)
  const [livePnl, setLivePnl] = useState<number | null>(null);
  useEffect(() => {
    const holdings = portfolio?.activeHoldings;
    if (!holdings || holdings.length === 0) return;
    const pairs = holdings.map(h => h.coin_pair).join(',');
    fetch(`/api/v1/prices?pairs=${encodeURIComponent(pairs)}`)
      .then(r => r.json())
      .then(data => {
        const prices = data?.prices || {};
        let total = 0;
        for (const h of holdings) {
          if (!h.entry_price || h.entry_price === 0) continue;
          const norm = h.coin_pair.replace(/\//g, '').toUpperCase();
          const live = prices[norm]?.price || prices[h.coin_pair]?.price;
          if (!live) continue;
          const qty = h.position_size / h.entry_price;
          total += (live - h.entry_price) * qty;
        }
        setLivePnl(total);
      })
      .catch(() => {});
  }, [portfolio]);
  const dailyPnl = livePnl ?? Number(portfolio?.summary?.daily_pnl ?? portfolio?.summary?.total_unrealized_pnl ?? 0);
  // Live balance = starting balance + realized P&L + unrealized P&L
  const paperBalance = startingBalance + realizedPnl + dailyPnl;
  const totalPnl = realizedPnl + dailyPnl;
  const totalPnlPct = startingBalance > 0 ? (totalPnl / startingBalance) * 100 : 0;
  const dailyPnlPct = startingBalance > 0 ? (dailyPnl / startingBalance) * 100 : 0;
  const winRate = Number(portfolio?.summary?.win_rate ?? 0);
  const activePositions = Number(portfolio?.summary?.active_positions ?? 0);
  const totalTrades = Number(portfolio?.summary?.total_trades ?? bots.reduce((sum, b) => sum + (b.total_trades ?? b.performance?.total_trades ?? 0), 0));
  const closedTrades = Number(portfolio?.summary?.closed_trades ?? 0);

  const botQuote = useMemo(() => getBotQuote(dailyPnlPct, winRate, activePositions, engineOn, totalTrades), [dailyPnlPct, winRate, activePositions, engineOn, totalTrades]);

  // Day X of Y calculation
  const dayProgress = useMemo(() => {
    if (!timeframeStartDate || !timeframe) return null;
    const start = new Date(timeframeStartDate);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const dayNum = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
    if (timeframe === 'unlimited') return { day: dayNum, total: null };
    const totalDays = parseInt(timeframe);
    return { day: Math.min(dayNum, totalDays), total: totalDays };
  }, [timeframe, timeframeStartDate]);

  const setupReady = riskLevel !== null && tradingAmount !== null;
  const allConfigured = setupReady && tboEnabled && engineOn;
  // When not in active challenge, show tradingAmount as balance (live update on amount change)
  const displayBalance = (!engineOn && !timeframeStartDate && tradingAmount) ? tradingAmount : paperBalance;

  const AMOUNT_PRESETS = [100, 500, 1000, 5000];

  const syncPaperBalance = useCallback(async (amount: number) => {
    // When paused mid-challenge, update paper account balance to match new amount
    if (!engineOn && timeframeStartDate && boardId) {
      try {
        await fetch('/api/trading/account', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boardId, balance: amount }),
        });
        loadDashboard();
      } catch (err) {
        console.error('Failed to sync paper balance:', err);
      }
    }
  }, [engineOn, timeframeStartDate, boardId, loadDashboard]);

  // When paused mid-challenge, can only increase amount (not decrease)
  const isMidChallenge = !engineOn && !!timeframeStartDate;

  const handleAmountPreset = (val: number) => {
    if (isMidChallenge && tradingAmount && val < tradingAmount) {
      pushToast('Can\'t reduce amount mid-challenge. Reset to start lower.', 'error');
      return;
    }
    setCustomAmountMode(false);
    setTradingAmount(val);
    syncPaperBalance(val);
    pushToast(`Amount set to ${formatCurrency(val)}`, 'success');
  };

  const handleCustomAmount = () => {
    const parsed = Number(customAmountInput.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) {
      if (isMidChallenge && tradingAmount && parsed < tradingAmount) {
        pushToast('Can\'t reduce amount mid-challenge. Reset to start lower.', 'error');
        return;
      }
      setTradingAmount(parsed);
      syncPaperBalance(parsed);
      pushToast(`Amount set to ${formatCurrency(parsed)}`, 'success');
    }
  };

  const handleCustomTimeframe = () => {
    const parsed = parseInt(customTimeframeInput);
    if (parsed > 0) {
      setTimeframe(String(parsed) as Timeframe);
      if (!timeframeStartDate) setTimeframeStartDate(new Date().toISOString());
      pushToast(`Timeframe set to ${parsed} days`, 'success');
    }
  };

  // Interpolated allocation based on continuous riskValue (0-100)
  // 0=conservative, 50=moderate, 100=aggressive — values in between blend smoothly
  const defaultAllocation = useMemo(() => {
    // Define allocations as arrays aligned by category
    // Categories: BTC, ETH, Top 10, Mid Caps, Small Caps, Stablecoins
    const CATS = [
      { label: 'BTC',         color: '#7b7dff' },
      { label: 'ETH',         color: '#4ade80' },
      { label: 'Top 10',      color: '#2dd4bf' },
      { label: 'Mid Caps',    color: '#a78bfa' },
      { label: 'Small Caps',  color: '#f05b6f' },
      { label: 'Stablecoins', color: '#f5b544' },
    ];
    //                          BTC  ETH  T10  Mid  Small Stable
    const conservative = [      45,  30,  15,   0,   0,   10 ];
    const moderate     = [      35,  25,  20,  15,   0,    5 ];
    const aggressive   = [      20,  15,  25,  25,  10,    5 ];

    const v = riskValue;
    let raw: number[];
    if (v <= 50) {
      const t = v / 50; // 0..1
      raw = conservative.map((c, i) => c + (moderate[i] - c) * t);
    } else {
      const t = (v - 50) / 50; // 0..1
      raw = moderate.map((m, i) => m + (aggressive[i] - m) * t);
    }

    // Round and ensure sum = 100
    const rounded = raw.map(r => Math.round(r));
    const diff = 100 - rounded.reduce((a, b) => a + b, 0);
    if (diff !== 0) rounded[0] += diff; // adjust BTC

    return CATS
      .map((cat, i) => ({ label: cat.label, pct: rounded[i], color: cat.color }))
      .filter(s => s.pct > 0);
  }, [riskValue]);

  const activeBots = bots.filter(b => b.status === 'running');
  // Count coins on the trading board (Analyzing + Active columns)
  const boardCoinCount = activeBots.length > 0 ? activeBots.length : pulse.length > 5 ? 5 : pulse.length;
  const engineStatusText = engineOn
    ? `Active — watching ${boardCoinCount} coins, ${activePositions} active trades`
    : 'Paused — all trading stopped';

  const btcCoin = pulse.find(c => c.pair?.includes('BTC'));
  const ethCoin = pulse.find(c => c.pair?.includes('ETH'));

  // Portfolio allocation: show only coins currently held (Active column)
  const hasActivePositions = activePositions > 0;
  const allocations = useMemo(() => {
    if (!hasActivePositions || !portfolio?.summary) return null;
    const holdings = portfolio?.activeHoldings;
    if (!holdings || holdings.length === 0) return null;

    const totalPositionValue = holdings.reduce((s, h) => s + (h.position_size || 0), 0);
    const cash = Math.max(0, paperBalance - totalPositionValue);
    const totalWithCash = totalPositionValue + cash;
    if (totalWithCash <= 0) return null;

    const coins = holdings.map(h => ({
      coin: h.coin_pair.replace(/\/?(USDT?)$/i, ''),
      pct: Math.round((h.position_size / totalWithCash) * 100),
    })).sort((a, b) => b.pct - a.pct);

    if (cash > 0) {
      coins.push({ coin: 'Cash', pct: Math.round((cash / totalWithCash) * 100) });
    }

    // Ensure sum = 100
    const sum = coins.reduce((s, c) => s + c.pct, 0);
    if (sum !== 100 && coins.length > 0) coins[0].pct += 100 - sum;

    return coins.length > 0 ? coins : null;
  }, [portfolio, hasActivePositions, paperBalance]);

  // Trade score: recalculate once per hour, not on every price tick
  const tradeScoreRef = useRef<{ score: number; label: string; color: string; explanation: string } | null>(null);
  const tradeScoreHourRef = useRef<string>('');
  const tradeScore = useMemo(() => {
    const now = new Date();
    const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
    if (tradeScoreRef.current && tradeScoreHourRef.current === hourKey) {
      return tradeScoreRef.current;
    }
    const result = calculateTradeScore(marketDetail, pulse);
    tradeScoreRef.current = result;
    tradeScoreHourRef.current = hourKey;
    return result;
  }, [marketDetail, pulse]);

  const pennyUpdate = useMemo(() => {
    const btcChange = btcCoin?.change24h ?? 0;
    const btcPrice = btcCoin?.price ?? 0;
    const marketTrend: 'up' | 'down' | 'flat' = btcChange > 1 ? 'up' : btcChange < -1 ? 'down' : 'flat';
    const fng = marketDetail?.overview?.fearGreed?.value ?? 50;
    const fngLabel = marketDetail?.overview?.fearGreed?.label ?? 'Neutral';
    return generatePennyUpdate({
      marketTrend,
      btcChange,
      btcPrice,
      pnlToday: dailyPnlPct,
      activePositions,
      engineOn,
      riskLevel,
      dayOfTimeframe: dayProgress?.day ?? null,
      timeframeDays: dayProgress?.total ?? null,
      winRate,
      totalTrades,
      fearGreed: fng,
      fearGreedLabel: fngLabel,
      tradeScore: tradeScore.score,
    });
  }, [btcCoin, dailyPnlPct, activePositions, engineOn, riskLevel, dayProgress, winRate, totalTrades, marketDetail, tradeScore]);

  const stepStatus = (done: boolean) => done ? '✓' : '⚠️';

  const handleTimeframeSelect = (tf: Timeframe) => {
    setTimeframe(tf);
    if (!timeframeStartDate) {
      setTimeframeStartDate(new Date().toISOString());
    }
    pushToast(`Timeframe set to ${tf === 'unlimited' ? 'Unlimited' : tf + ' days'}`, 'success');
  };

  const handleEngineToggle = useCallback(async () => {
    if (!setupReady) return;
    const next = !engineOn;
    setEngineOn(next);

    // Only set timeframe start date if not already set (first start)
    if (next && !timeframeStartDate) {
      setTimeframeStartDate(new Date().toISOString());
    }

    if (next && boardId) {
      try {
        // Create/update paper account with the configured trading amount
        if (tradingAmount) {
          await fetch('/api/trading/account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ boardId, initialBalance: tradingAmount }),
          });
        }

        for (const bot of bots) {
          if (bot.status !== 'running') {
            await fetch(`/api/v1/bots/${bot.id}/start`, { method: 'POST' });
          }
        }
        if (bots.length === 0) {
          const riskMap = { safe: 2, balanced: 5, bold: 8 };
          const stratMap = { safe: 'swing_mean_reversion', balanced: 'swing_momentum', bold: 'scalper_momentum' };
          await fetch('/api/v1/bots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `${RISK_LEVELS[riskLevel!].label} Bot`,
              strategy: stratMap[riskLevel!],
              risk_level: riskMap[riskLevel!],
              auto_trade: true,
              board_id: boardId,
            }),
          });
        }
        pushToast('Engine started! 🚀 Scanning for opportunities...', 'success');
        setScanningStatus('scanning');
        // Poll for scan results — Owen detects engine start within 60s
        let scanChecks = 0;
        const scanPoll = setInterval(async () => {
          scanChecks++;
          try {
            const scanRes = await fetch('/api/trading/scan-status');
            if (scanRes.ok) {
              const scanData = await scanRes.json();
              if (scanData?.message) {
                setScanningStatus(scanData.message);
              }
            }
          } catch {}
          if (scanChecks >= 12) { // Stop after 2 minutes
            clearInterval(scanPoll);
            setScanningStatus(null);
          }
        }, 10_000);
        await loadDashboard();
      } catch {
        pushToast('Failed to start engine', 'error');
      }
    } else if (!next) {
      // Confirm before pausing
      const confirmed = window.confirm('Pause engine? This will close all active positions at market price.');
      if (!confirmed) {
        setEngineOn(true); // revert toggle
        return;
      }
      try {
        // Close all active positions at current price
        if (boardId) {
          const tradesRes = await fetch(`/api/v1/trades?boardId=${boardId}&column_name=Active`);
          if (tradesRes.ok) {
            const tradesData = await tradesRes.json();
            const activeTrades = Array.isArray(tradesData) ? tradesData : (tradesData.trades || []);
            if (activeTrades.length > 0) {
              const pairs = activeTrades.map((t: { coin_pair?: string }) => t.coin_pair?.replace('/', '') || '').filter(Boolean).join(',');
              let prices: Record<string, number> = {};
              try {
                const priceRes = await fetch(`/api/v1/prices?pairs=${encodeURIComponent(pairs)}`);
                if (priceRes.ok) {
                  const priceData = await priceRes.json();
                  if (priceData?.prices) {
                    for (const [k, v] of Object.entries(priceData.prices)) {
                      prices[k] = Number(v);
                    }
                  }
                }
              } catch {}
              for (const trade of activeTrades) {
                const entry = Number(trade.entry_price) || 0;
                const pair = (trade.coin_pair || '').replace('/', '');
                const currentPrice = prices[pair] || prices[pair + 'USDT'] || entry;
                const isLong = (trade.direction || '').toUpperCase() !== 'SHORT';
                const pct = entry ? (isLong ? (currentPrice - entry) / entry : (entry - currentPrice) / entry) : 0;
                const posSize = Number(trade.position_size) || 200;
                const pnlDollar = posSize * pct;
                const outcome = pnlDollar >= 0 ? 'Won' : 'Lost';
                await fetch(`/api/v1/trades/${trade.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    column_name: outcome,
                    exit_price: currentPrice,
                    pnl_dollar: parseFloat(pnlDollar.toFixed(2)),
                    pnl_percent: parseFloat((pct * 100).toFixed(2)),
                    status: 'closed',
                    exited_at: new Date().toISOString(),
                    notes: `Engine paused — closed at market price $${currentPrice}`
                  }),
                });
              }
              pushToast(`Closed ${activeTrades.length} position${activeTrades.length > 1 ? 's' : ''} at market`, 'info');
            }
          }
        }
        // Stop bots
        for (const bot of bots) {
          if (bot.status === 'running') {
            await fetch(`/api/v1/bots/${bot.id}/stop`, { method: 'POST' });
          }
        }
        pushToast('Engine paused — all positions closed', 'warning');
        await loadDashboard();
      } catch {}
    }
  }, [engineOn, setupReady, boardId, bots, riskLevel, pushToast, loadDashboard, timeframeStartDate]);

  // Coin name mapping for simple mode
  const COIN_NAMES: Record<string, { name: string; icon: string; iconBg: string; iconColor: string }> = {
    BTC: { name: 'Bitcoin', icon: '₿', iconBg: '#f7931a22', iconColor: '#f7931a' },
    ETH: { name: 'Ethereum', icon: 'Ξ', iconBg: '#627eea22', iconColor: '#627eea' },
    SOL: { name: 'Solana', icon: 'S', iconBg: '#00e67622', iconColor: '#00e676' },
    BNB: { name: 'BNB', icon: 'B', iconBg: '#f3ba2f22', iconColor: '#f3ba2f' },
    XRP: { name: 'Ripple', icon: 'X', iconBg: '#23292f22', iconColor: '#23292f' },
    ADA: { name: 'Cardano', icon: 'A', iconBg: '#0033ad22', iconColor: '#0033ad' },
    DOGE: { name: 'Dogecoin', icon: 'D', iconBg: '#c2a63322', iconColor: '#c2a633' },
    AVAX: { name: 'Avalanche', icon: 'A', iconBg: '#e8414122', iconColor: '#e84141' },
    DOT: { name: 'Polkadot', icon: 'P', iconBg: '#e6007a22', iconColor: '#e6007a' },
    LINK: { name: 'Chainlink', icon: 'L', iconBg: '#2a5ada22', iconColor: '#2a5ada' },
    Cash: { name: 'Cash', icon: '$', iconBg: '#44444422', iconColor: '#888' },
  };

  const getCoinDisplay = (symbol: string) => COIN_NAMES[symbol] ?? { name: symbol, icon: symbol[0] ?? '?', iconBg: '#33333322', iconColor: '#888' };

  // Reset Challenge handler
  const handleResetChallenge = useCallback(async () => {
    const amt = tradingAmount || 1000;
    const confirmed = window.confirm(
      `Reset challenge? This will close all positions, clear trade history, and start fresh with $${amt.toLocaleString()} balance. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      // 1. Reset balance and created_at
      await fetch('/api/trading/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: 15, balance: amt }),
      });
      // 2. Fetch all trades
      const tradesRes = await fetch('/api/v1/trades?boardId=15');
      const tradesData = await tradesRes.json();
      const trades = tradesData.trades || tradesData || [];
      // 3. Delete each trade
      await Promise.all(trades.map((t: { id: number }) =>
        fetch(`/api/v1/trades/${t.id}`, { method: 'DELETE' })
      ));
      // 4. Reset timeframe + engine off — write directly to localStorage before reload
      const saved = JSON.parse(localStorage.getItem('clawdesk-trading-setup') || '{}');
      saved.timeframeStartDate = null;
      saved.engineOn = false;
      localStorage.setItem('clawdesk-trading-setup', JSON.stringify(saved));
      setTimeframeStartDate(null);
      setEngineOn(false);
      // 5. Reload
      window.location.reload();
    } catch (err) {
      console.error('Reset challenge failed:', err);
      alert('Failed to reset challenge. Check console for details.');
    }
  }, [tradingAmount, setTimeframeStartDate, setEngineOn]);

  // Simple mode handle start trading
  const handleSimpleStartTrading = useCallback(() => {
    if (engineOn) {
      // Already trading — show override modal
      setSimpleOverrideModalOpen(true);
    } else {
      handleEngineToggle();
    }
  }, [engineOn, handleEngineToggle]);

  // ─── SIMPLE MODE VIEW ───
  if (dashboardMode === 'simple') {
    // Determine direction badge from active holdings
    const simpleDirectionBadge = (() => {
      const holdings = portfolio?.activeHoldings ?? [];
      const hasLongs = holdings.some(h => (h.direction || 'long') === 'long');
      const hasShorts = holdings.some(h => h.direction === 'short');
      if (hasLongs && hasShorts) return { label: '↑↓ Long & Short', color: '#7b7dff', bg: '#7b7dff22' };
      if (hasShorts) return { label: '↓ Short', color: '#ff5252', bg: '#ff525222' };
      if (hasLongs) return { label: '↑ Long', color: '#00e676', bg: '#00e67622' };
      return { label: '—', color: '#888', bg: '#88822' };
    })();

    return (
      <>
        <div className="simple-container" style={{ maxWidth: '960px', margin: '0 auto', padding: '24px' }}>
          {/* Top bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Your Trading Co-Pilot, Penny</h1>
              <div style={{ fontSize: '13px', color: '#666' }}>It watches the market so you don&apos;t have to.</div>
            </div>
            <button onClick={() => toggleDashboardMode('advanced')} style={{ background: '#1a1a2e', border: '1px solid #2a2a4e', color: '#666', padding: '6px 12px', borderRadius: '16px', fontSize: '11px', cursor: 'pointer' }}>⚙️ Advanced Mode</button>
          </div>

          {/* Status Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', padding: '12px 16px', background: '#141428', borderRadius: '10px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: engineOn ? '#00e676' : '#888' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: engineOn ? '#00e676' : '#888', animation: engineOn ? 'pulse-glow-dot 2s infinite' : 'none' }} />
              {engineOn ? 'Bot is trading' : 'Paused'}
            </span>
            <div style={{ width: '1px', height: '20px', background: '#2a2a4e' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: totalPnl >= 0 ? '#4ade80' : 'var(--text)' }}>
              {totalPnl >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(totalPnl))} ({totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(1)}%)
            </span>
            <div style={{ width: '1px', height: '20px', background: '#2a2a4e' }} />
            <span style={{ fontSize: '13px', color: '#888' }}>
              {dayProgress ? (dayProgress.total ? `Day ${dayProgress.day} of ${dayProgress.total}` : `Day ${dayProgress.day}`) : `Day 1 of ${timeframe && timeframe !== 'unlimited' ? timeframe : '10'}`}
            </span>
            <div style={{ width: '1px', height: '20px', background: '#2a2a4e' }} />
            <span style={{ fontSize: '13px', color: '#888' }}>{closedTrades} closed · {activePositions} active</span>
            <div style={{ width: '1px', height: '20px', background: '#2a2a4e' }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: simpleDirectionBadge.bg, color: simpleDirectionBadge.color }}>{simpleDirectionBadge.label}</span>
            <div style={{ width: '1px', height: '20px', background: '#2a2a4e' }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: tboEnabled ? '#4ade80' : '#666' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: tboEnabled ? '#4ade80' : '#555', boxShadow: tboEnabled ? '0 0 6px #4ade80' : 'none' }} />
              TBO PRO
            </span>
          </div>

          {/* Two-column: Balance + Penny */}
          <div className="simple-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            {/* Money Card */}
            <div style={{ background: 'linear-gradient(135deg, #1a1a3e 0%, #141428 100%)', borderRadius: '16px', padding: '28px 24px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Your Balance</div>
              <div style={{ fontSize: '42px', fontWeight: 800, letterSpacing: '-1px', color: (displayBalance) >= startingBalance ? '#4ade80' : 'var(--text)' }}>{formatCurrency(displayBalance)}</div>
              <div style={{ fontSize: '16px', marginTop: '6px', fontWeight: 600, color: dailyPnl >= 0 ? '#00e676' : '#ff5252' }}>
                {dailyPnl >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(dailyPnl))} today
              </div>
              {dayProgress && (
                <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                  Started {dayProgress.day} day{dayProgress.day !== 1 ? 's' : ''} ago with {formatCurrencyShort(tradingAmount || startingBalance)}
                </div>
              )}
            </div>

            {/* Penny Card */}
            <div style={{ background: '#141428', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <img src="/icons/penny.png" alt="Penny" style={{ width: '52px', height: '52px', borderRadius: '50%', flexShrink: 0 }} />
                <span style={{ fontSize: '14px', color: '#7b7dff', fontWeight: 600 }}>Penny</span>
              </div>
              <div style={{ fontSize: '15px', lineHeight: 1.6, color: '#ddd' }}>{pennyUpdate}</div>
            </div>
          </div>

          {/* Four-column stats row */}
          <div className="simple-stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: '#141428', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Trades</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)' }}>{closedTrades} <span style={{ fontSize: '13px', fontWeight: 500, color: '#888' }}>closed</span></div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: activePositions > 0 ? '#7b7dff' : '#666', marginTop: '2px' }}>{activePositions} active</div>
            </div>
            <div style={{ background: '#141428', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Best Day</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#00e676' }}>{dailyPnl > 0 ? `+${formatCurrency(dailyPnl)}` : '—'}</div>
              <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>today</div>
            </div>
            <div style={{ background: '#141428', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Win Rate</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)' }}>{winRate.toFixed(0)}%</div>
              <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>more wins than losses</div>
            </div>
            <div style={{ background: '#141428', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Days Active</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)' }}>{dayProgress?.day ?? 0}</div>
              <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>{`of ${dayProgress?.total ?? (timeframe && timeframe !== 'unlimited' ? parseInt(timeframe) : 10)} day run`}</div>
            </div>
          </div>

          {/* Two-column: Holdings + How It Works */}
          <div className="simple-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            {/* What You Own — Pie + Legend */}
            <div style={{ background: '#141428', borderRadius: '16px', padding: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px', color: 'var(--text)' }}>What You Own Right Now</div>
              {(() => {
                const holdings = portfolio?.activeHoldings ?? [];
                const totalPositionValue = holdings.reduce((s, h) => s + (h.position_size || 0), 0);
                const cash = Math.max(0, displayBalance - totalPositionValue);
                const total = totalPositionValue + cash;
                const pieColors = ['#7b7dff', '#00e676', '#2dd4bf', '#a78bfa', '#ff5252', '#4ade80', '#f5b544'];
                const rows = holdings.map((h, i) => {
                  const sym = h.coin_pair.replace(/\/?(USDT?)$/i, '');
                  const coin = getCoinDisplay(sym);
                  const pulseCoin = pulse.find(c => c.pair?.includes(sym));
                  const change = pulseCoin?.change24h ?? 0;
                  const isShort = h.direction === 'short';
                  // For shorts, a negative price change = profit
                  const effectiveChange = isShort ? -change : change;
                  const pct = total > 0 ? (h.position_size / total) * 100 : 0;
                  const label = isShort ? `${coin.name} ↓S` : coin.name;
                  return { name: label, icon: coin.icon, iconBg: coin.iconBg, iconColor: coin.iconColor, value: h.position_size, change: effectiveChange, rawChange: change, isShort, pct, color: pieColors[i % pieColors.length] };
                });
                const cashPct = total > 0 ? (cash / total) * 100 : 100;
                rows.push({ name: 'Cash', icon: '$', iconBg: '#f5b54422', iconColor: '#f5b544', value: cash, change: 0, rawChange: 0, isShort: false, pct: cashPct, color: '#f5b544' });

                // Build pie chart
                let offset = 25;
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {/* Pie */}
                      <div style={{ flexShrink: 0 }}>
                        <svg viewBox="0 0 36 36" style={{ width: '210px', height: '210px' }}>
                          {rows.map((seg) => {
                            const el = <circle key={seg.name} r="15.9" cx="18" cy="18" fill="none" stroke={seg.color} strokeWidth="3.5" strokeDasharray={`${seg.pct} ${100 - seg.pct}`} strokeDashoffset={`${-offset + 25}`} style={{ transition: 'all 0.4s ease' }} />;
                            offset += seg.pct;
                            return el;
                          })}
                          <text x="18" y="16.5" textAnchor="middle" fill={displayBalance >= startingBalance ? '#4ade80' : 'var(--text)'} fontSize="4" fontWeight="700">{formatCurrency(displayBalance)}</text>
                          <text x="18" y="19.5" textAnchor="middle" fill="#888" fontSize="2">balance</text>
                          <text x="18" y="22" textAnchor="middle" fill={totalPnl >= 0 ? '#4ade80' : 'var(--text)'} fontSize="2" fontWeight="600">{totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)} P&amp;L</text>
                        </svg>
                      </div>
                      {/* Legend */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {rows.map(row => (
                          <div key={row.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #1a1a2e' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{row.name}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '12px', color: row.name === 'Cash' ? '#888' : row.change >= 0 ? '#00e676' : '#ff5252' }}>
                                {row.name === 'Cash' ? 'safe' : `${row.change >= 0 ? '▲' : '▼'}${Math.abs(row.change).toFixed(1)}%${(row as any).isShort ? '' : ''}`}
                              </span>
                              <span style={{ fontSize: '12px', color: '#888', minWidth: '32px', textAlign: 'right' }}>{row.pct.toFixed(0)}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* How It Works */}
            <div style={{ background: '#141428', borderRadius: '16px', padding: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text)' }}>How It Works</div>
              {[
                { num: '1', title: 'You set the amount', desc: "— pick how much to trade with. Start small if you like." },
                { num: '2', title: 'The bot does the rest', desc: "— watches 24/7, buys low, sells high." },
                { num: '3', title: 'You check in whenever', desc: '— no charts to read. Just watch your balance grow.' },
              ].map(step => (
                <div key={step.num} style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'flex-start' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#7b7dff22', color: '#7b7dff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>{step.num}</div>
                  <div style={{ fontSize: '13px', lineHeight: 1.4, color: '#999' }}><strong style={{ color: '#ddd' }}>{step.title}</strong> {step.desc}</div>
                </div>
              ))}
              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #1a1a2e' }}>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>🛡️ Paper trading — practice money, zero risk</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Uses proven strategies trusted by 25,000+ traders</div>
              </div>
            </div>
          </div>

          {/* Bottom bar: Amount pills + CTA */}
          <div className="simple-bottom-bar" style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
            {!engineOn ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                {AMOUNT_PRESETS.map(val => {
                  const frozen = isMidChallenge && tradingAmount != null && val < tradingAmount;
                  return (
                  <button key={val} onClick={() => handleAmountPreset(val)} disabled={frozen} style={{
                    padding: '8px 16px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                    cursor: frozen ? 'not-allowed' : 'pointer', opacity: frozen ? 0.35 : 1,
                    border: `1px solid ${tradingAmount === val ? '#7b7dff' : '#2a2a4e'}`,
                    background: tradingAmount === val ? '#7b7dff22' : '#141428',
                    color: tradingAmount === val ? '#7b7dff' : '#e0e0e0',
                  }}>${val.toLocaleString()}</button>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '10px', background: '#141428', border: '1px solid #2a2a4e' }}>
                <span style={{ fontSize: '13px', color: '#888' }}>Trading with</span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#7b7dff' }}>{formatCurrencyShort(tradingAmount || startingBalance)}</span>
                <span style={{ fontSize: '11px', color: '#555' }}>🔒</span>
              </div>
            )}
            <button
              onClick={handleSimpleStartTrading}
              disabled={!setupReady && !engineOn}
              style={{
                flex: 1, padding: '14px 24px', borderRadius: '12px', border: 'none',
                fontSize: '16px', fontWeight: 700, cursor: (setupReady || engineOn) ? 'pointer' : 'not-allowed',
                background: engineOn ? '#00e676' : 'linear-gradient(135deg, #7b7dff 0%, #5b5ddf 100%)',
                color: engineOn ? '#0d0d1a' : 'white',
              }}
            >
              {engineOn ? '✨ Bot is Running — Tap to Pause' : (timeframeStartDate ? '▶ Resume Trading' : '▶ Start Trading')}
            </button>
          </div>
          {/* TBO status removed from here — shown in status bar instead */}
          <div style={{ textAlign: 'center', fontSize: '11px', color: '#444', marginTop: '8px' }}>
            Powered by the TBO Trading Engine · A product of The Better Traders
          </div>
          {scanningStatus && (
            <div style={{
              textAlign: 'center', marginTop: '10px', padding: '10px 16px',
              background: 'rgba(123,125,255,0.08)', border: '1px solid rgba(123,125,255,0.2)',
              borderRadius: '10px', fontSize: '13px', color: '#7b7dff', fontWeight: 500,
              animation: 'pulse-glow-dot 2s infinite',
            }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#7b7dff', marginRight: '8px', animation: 'pulse-glow-dot 1.5s infinite' }} />
              {scanningStatus === 'scanning' ? '🔍 Scanning watchlist for opportunities...' : scanningStatus}
            </div>
          )}
          {!engineOn && (
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button onClick={handleResetChallenge} style={{ background: 'none', border: '1px solid #f05b6f44', color: '#f05b6f', fontSize: '13px', cursor: 'pointer', padding: '8px 20px', borderRadius: '8px' }}>
                🔄 Reset &amp; Start New Challenge
              </button>
            </div>
          )}
        </div>

        {/* Simple Mode Override Modal */}
        {simpleOverrideModalOpen && (
          <div onClick={e => { if (e.target === e.currentTarget) setSimpleOverrideModalOpen(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,15,0.78)', display: 'grid', placeItems: 'center', zIndex: 90 }}>
            <div style={{ width: 'min(420px, 92vw)', background: '#1a1a2e', border: '1px solid #2a2a4e', borderRadius: '18px', padding: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: 'var(--text)' }}>You&apos;re already trading!</div>
              <div style={{ fontSize: '14px', color: '#888', lineHeight: 1.6, marginBottom: '20px' }}>
                {dayProgress ? `Day ${dayProgress.day} of ${dayProgress.total ?? '∞'}` : 'Active run'}, {formatCurrency(paperBalance)} balance.
                Your bot is watching {activePositions} position{activePositions !== 1 ? 's' : ''}. Want to keep going or start fresh?
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setSimpleOverrideModalOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #2a2a4e', background: 'transparent', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>Keep Going</button>
                <button onClick={() => { setSimpleOverrideModalOpen(false); handleEngineToggle(); setSettingsUnlocked(true); toggleDashboardMode('advanced'); }} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: '#7b7dff', color: '#0d0d1a', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>Start Fresh</button>
              </div>
            </div>
          </div>
        )}

        <ToastStack toasts={toasts} onDismiss={(id) => { if (toastTimersRef.current[id]) { clearTimeout(toastTimersRef.current[id]); delete toastTimersRef.current[id]; } setToasts(prev => prev.filter(t => t.id !== id)); }} />

        <style jsx global>{`
          @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 20px rgba(123,125,255,0.25); } 50% { box-shadow: 0 0 35px rgba(123,125,255,0.5); } }
          @keyframes pulse-glow-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
          @media (max-width: 768px) {
            .simple-grid-2 { grid-template-columns: 1fr !important; }
            .simple-stats-row { grid-template-columns: 1fr 1fr !important; }
            .simple-bottom-bar { flex-direction: column !important; }
            .simple-container { padding: 24px 20px !important; }
          }
        `}</style>
      </>
    );
  }

  // ─── ADVANCED MODE VIEW ───
  return (
    <>
      <div style={{ padding: '0 clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>

        {/* Mode toggle in top-right */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', marginBottom: '-8px' }}>
          <button onClick={() => toggleDashboardMode('simple')} style={{ background: '#1a1a2e', border: '1px solid #2a2a4e', color: '#666', padding: '6px 12px', borderRadius: '16px', fontSize: '11px', cursor: 'pointer' }}>🧘 Simple Mode</button>
        </div>

        {/* Unlock Settings Modal */}
        {unlockModalOpen && (
          <div onClick={e => { if (e.target === e.currentTarget) setUnlockModalOpen(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,15,0.78)', display: 'grid', placeItems: 'center', zIndex: 90 }}>
            <div style={{ width: 'min(420px, 92vw)', background: '#1a1a2e', border: '1px solid #2a2a4e', borderRadius: '18px', padding: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: 'var(--text)' }}>Change Trading Strategy?</div>
              <div style={{ fontSize: '14px', color: '#888', lineHeight: 1.6, marginBottom: '20px' }}>
                You&apos;re on {dayProgress ? `Day ${dayProgress.day} of ${dayProgress.total ?? '∞'}` : 'an active run'}. Changing your strategy mid-run may affect performance. Current open trades will continue with their existing strategy.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setUnlockModalOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #2a2a4e', background: 'transparent', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>Keep Current Strategy</button>
                <button onClick={() => { setUnlockModalOpen(false); setSettingsUnlocked(true); pushToast('Settings unlocked — make your changes', 'warning'); }} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: '#f5b544', color: '#0d0d1a', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>Unlock Settings</button>
              </div>
            </div>
          </div>
        )}

        {/* Penny's Update — copilot message */}
        <section style={{ marginTop: '20px', marginBottom: '16px' }}>
          <div style={{
            background: 'rgba(123,125,255,0.05)',
            borderLeft: '3px solid rgba(123,125,255,0.5)',
            borderRadius: '12px',
            padding: '14px 18px',
            display: 'flex',
            gap: '14px',
            alignItems: 'flex-start',
          }}>
            <img src="/icons/penny.png" alt="Penny" style={{ width: '72px', height: '72px', borderRadius: '50%', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', marginBottom: '6px', fontWeight: 600 }}>
                Penny&apos;s Update
              </div>
              <div style={{ fontSize: '17px', lineHeight: 1.6, color: 'var(--text)', fontWeight: 500 }}>
                {pennyUpdate}
              </div>
              <div style={{ fontSize: '14px', fontStyle: 'italic', fontWeight: 500, color: botQuote.color, marginTop: '8px' }}>
                {botQuote.text}
              </div>
            </div>
          </div>
        </section>

        {/* Market Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          background: '#1a1a2e', border: '1px solid #2a2a4e', borderRadius: '999px',
          padding: '6px 14px', fontSize: '11px', color: 'var(--muted)', marginBottom: '8px',
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00e676', flexShrink: 0 }} />
          Binance · Crypto / USDT Pairs · {pulse.length} coins tracked · TBO Trading Engine v1.0
        </div>

        {/* 1. Market Summary (compact one-liner) */}
        <section style={{ marginTop: '24px', marginBottom: '16px' }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '14px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text)' }}>
              {(sentiment?.label || marketDetail?.overview?.fearGreed?.label) ? `Market: ${sentiment?.label ?? marketDetail?.overview?.fearGreed?.label} (${sentiment?.value ?? marketDetail?.overview?.fearGreed?.value ?? ''})` : 'Market'}
              {btcCoin && <> · BTC {formatCurrency(btcCoin.price)} <span style={{ color: btcCoin.change24h >= 0 ? '#4ade80' : '#f05b6f' }}>{btcCoin.change24h >= 0 ? '▲' : '▼'}{Math.abs(btcCoin.change24h).toFixed(1)}%</span></>}
              {ethCoin && <> · ETH {formatCurrency(ethCoin.price)} <span style={{ color: ethCoin.change24h >= 0 ? '#4ade80' : '#f05b6f' }}>{ethCoin.change24h >= 0 ? '▲' : '▼'}{Math.abs(ethCoin.change24h).toFixed(1)}%</span></>}
              {tradeScore && <> · <span style={{ color: tradeScore.color, fontWeight: 600 }}>Trade Conditions: {tradeScore.label} ({tradeScore.score}/100)</span></>}
              {(() => {
                const fng = sentiment?.value ?? marketDetail?.overview?.fearGreed?.value;
                if (fng == null) return null;
                const label = fng < 30 ? 'Bearish' : fng < 45 ? 'Cautious' : fng <= 55 ? 'Neutral' : fng <= 70 ? 'Bullish' : 'Very Bullish';
                const color = fng < 30 ? '#f05b6f' : fng < 45 ? '#9ca3af' : fng <= 55 ? '#9ca3af' : fng <= 70 ? '#4ade80' : '#22c55e';
                return <> · <span style={{ color, fontWeight: 600 }}>Market: {label}</span></>;
              })()}
            </div>
            <Link href="/trading/market" style={{ fontSize: '12px', color: 'var(--accent)', textDecoration: 'none' }}>
              See full market →
            </Link>
          </div>
        </section>

        {/* 2. Status at a Glance */}
        <section style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: '10px' }}>
            Status at a Glance
          </div>
          <div className="stats-row" style={{ display: 'flex', flexWrap: 'nowrap', gap: '10px' }}>
            {[
              { label: 'Bot Status', value: engineOn ? '● Active' : '● Paused', color: engineOn ? '#22c55e' : '#ef4444' },
              { label: 'Balance', value: formatCurrency(displayBalance), color: displayBalance >= startingBalance ? '#4ade80' : '#f05b6f' },
              { label: 'Trading With', value: formatCurrencyShort(tradingAmount || startingBalance), color: '#7b7dff' },
              { label: "Today's P&L", value: `${dailyPnl >= 0 ? '+' : ''}${formatCurrency(dailyPnl)} (${dailyPnlPct >= 0 ? '+' : ''}${dailyPnlPct.toFixed(1)}%)`, color: dailyPnl >= 0 ? '#4ade80' : '#f05b6f' },
              { label: 'Win Rate', value: `${winRate.toFixed(0)}%`, color: winRate >= 50 ? '#4ade80' : winRate > 0 ? '#f05b6f' : undefined },
              { label: 'Active Positions', value: String(activePositions), subtitle: (() => { const h = portfolio?.activeHoldings || []; const longs = h.filter(p => (p.direction || 'long') === 'long').length; const shorts = h.filter(p => p.direction === 'short').length; return longs > 0 || shorts > 0 ? `${longs}L / ${shorts}S` : undefined; })() },
              { label: 'Closed Trades', value: String(closedTrades) },
              {
                label: 'Progress',
                value: dayProgress
                  ? dayProgress.total
                    ? `Day ${dayProgress.day} of ${dayProgress.total}`
                    : `Day ${dayProgress.day}`
                  : `Day 1 of ${timeframe && timeframe !== 'unlimited' ? timeframe : '10'}`,
                color: dayProgress?.total && dayProgress.day >= dayProgress.total ? '#f5b544' : undefined,
              },
            ].map((stat: { label: string; value: string; color?: string; subtitle?: string }) => {
              const wide = stat.label === "Today's P&L" || stat.label === 'Progress';
              return (
                <div key={stat.label} style={{ flex: wide ? '1.6 1 0' : '1 1 0', minWidth: 0, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '14px 12px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stat.label}</div>
                  <div style={{ marginTop: '8px', fontSize: wide ? '16px' : '18px', fontWeight: 700, color: stat.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stat.value}</div>
                  {stat.subtitle && <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{stat.subtitle}</div>}
                </div>
              );
            })}
          </div>
        </section>

        {/* Active Strategies section removed — too complex for beginner traders */}

        {/* Two-column: Portfolio Mix + Trading Setup */}
        <section className="portfolio-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

          {/* LEFT — Portfolio Mix (pie big, legend compact right) */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '18px', padding: '16px 20px' }}>
            {/* Toggle: Holdings ↔ Allocation */}
            <div style={{ display: 'flex', marginBottom: '12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              {(['holdings', 'allocation'] as const).map(v => (
                <button key={v} onClick={() => setPieView(v)} style={{
                  flex: 1, padding: '6px 0', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize',
                  border: 'none', cursor: 'pointer',
                  background: pieView === v ? 'rgba(123,125,255,0.15)' : 'transparent',
                  color: pieView === v ? 'var(--accent)' : 'var(--muted)',
                }}>{v}</button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            {/* Donut chart */}
            <div style={{ flexShrink: 0 }}>
              {(() => {
                const isAllocationView = pieView === 'allocation';
                const displayAlloc = isAllocationView
                  ? defaultAllocation
                  : (allocations && allocations.length > 0)
                    ? allocations.map((a, i) => ({ label: a.coin, pct: a.pct, color: ['#7b7dff', '#4ade80', '#2dd4bf', '#a78bfa', '#f05b6f', '#f5b544'][i % 6] }))
                    : [{ label: 'Cash', pct: 100, color: '#f5b544' }];
                let offset = 25;
                return (
                  <svg viewBox="0 0 36 36" style={{ width: '240px', height: '240px' }}>
                    {displayAlloc.map((seg) => {
                      const el = <circle key={seg.label} r="15.9" cx="18" cy="18" fill="none" stroke={seg.color} strokeWidth="4" strokeDasharray={`${seg.pct} ${100 - seg.pct}`} strokeDashoffset={`${-offset + 25}`} style={{ transition: 'stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease' }} />;
                      offset += seg.pct;
                      return el;
                    })}
                    <text x="18" y="15.5" textAnchor="middle" fill={(paperBalance || startingBalance) >= startingBalance ? '#4ade80' : 'var(--text)'} fontSize="4.5" fontWeight="700">{formatCurrency(isAllocationView ? (tradingAmount || paperBalance || startingBalance) : (paperBalance || startingBalance))}</text>
                    <text x="18" y="19" textAnchor="middle" fill="var(--muted)" fontSize="2">{isAllocationView ? 'target allocation' : 'balance'}</text>
                    <text x="18" y="22" textAnchor="middle" fill={totalPnl >= 0 ? '#4ade80' : '#f05b6f'} fontSize="2" fontWeight="600">{totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)} P&amp;L</text>
                  </svg>
                );
              })()}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0, flexShrink: 1 }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', fontWeight: 600, marginBottom: '1px' }}>{pieView === 'allocation' ? 'Target Allocation' : 'Current Holdings'}</div>
              {(() => {
                const isAllocationView = pieView === 'allocation';
                const displayAlloc = isAllocationView
                  ? defaultAllocation
                  : (allocations && allocations.length > 0)
                    ? allocations.map((a, i) => ({ label: a.coin, pct: a.pct, color: ['#7b7dff', '#4ade80', '#2dd4bf', '#a78bfa', '#f05b6f', '#f5b544'][i % 6] }))
                    : [{ label: 'Cash', pct: 100, color: '#f5b544' }];
                return displayAlloc.map((seg) => (
                  <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap' }}>{seg.label}</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '13px', transition: 'all 0.3s' }}>{seg.pct}%</span>
                  </div>
                ));
              })()}
              {pieView === 'allocation' && riskLevel && (
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontStyle: 'italic' }}>
                  {RISK_LEVELS[riskLevel].description}
                </div>
              )}

              {/* TBO badge */}
              <button
                onClick={() => setTboEnabled(prev => !prev)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '4px 10px', borderRadius: '999px', alignSelf: 'flex-start', marginTop: '4px',
                  background: tboEnabled ? 'rgba(74,222,128,0.06)' : 'rgba(123,125,255,0.08)',
                  border: `1px solid ${tboEnabled ? 'rgba(74,222,128,0.3)' : 'rgba(123,125,255,0.2)'}`,
                  fontSize: '10px', color: tboEnabled ? '#4ade80' : 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: tboEnabled ? '#4ade80' : 'var(--muted)' }} />
                TBO PRO
                <ToggleSwitch on={tboEnabled} onChange={() => setTboEnabled(prev => !prev)} />
              </button>
            </div>
            </div>
          </div>

          {/* RIGHT — Trading Setup */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '18px', padding: '20px 24px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', fontWeight: 600 }}>Trading Setup</div>
              {sessionLocked && (
                <button onClick={() => setUnlockModalOpen(true)} style={{ background: '#1a1a2e', border: '1px solid #2a2a4e', borderRadius: '8px', padding: '4px 10px', fontSize: '11px', color: '#f5b544', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  🔒 Locked — Click to unlock
                </button>
              )}
            </div>
            {sessionLocked && <div style={{ position: 'absolute', inset: 0, borderRadius: '18px', zIndex: 5 }} />}

            {/* Risk Slider — continuous */}
            <div style={sessionLocked ? { opacity: 0.5, pointerEvents: 'none', position: 'relative' } : {}}>
            {sessionLocked && <div style={{ position: 'absolute', top: 8, right: 8, background: '#1a1a2e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4, zIndex: 10 }}>🔒 Strategy locked during active run. Pause trading to change.</div>}
            {(() => {
              const RISK_LABELS = [
                { key: 'safe' as RiskLevel, label: 'Safe', desc: 'BTC & ETH heavy', pos: 0, color: '#6366f1' },
                { key: 'balanced' as RiskLevel, label: 'Balanced', desc: 'Top 20 mix', pos: 50, color: '#7b7dff' },
                { key: 'bold' as RiskLevel, label: 'Bold', desc: 'Momentum plays', pos: 100, color: '#a855f7' },
              ];
              // Interpolate color based on riskValue
              const lerpColor = (a: string, b: string, t: number) => {
                const pa = [parseInt(a.slice(1,3),16), parseInt(a.slice(3,5),16), parseInt(a.slice(5,7),16)];
                const pb = [parseInt(b.slice(1,3),16), parseInt(b.slice(3,5),16), parseInt(b.slice(5,7),16)];
                const r = pa.map((c, i) => Math.round(c + (pb[i] - c) * t));
                return `rgb(${r[0]},${r[1]},${r[2]})`;
              };
              const thumbColor = riskValue <= 50
                ? lerpColor('#6366f1', '#7b7dff', riskValue / 50)
                : lerpColor('#7b7dff', '#a855f7', (riskValue - 50) / 50);

              // Which label is closest
              const closestIdx = riskValue < 25 ? 0 : riskValue < 75 ? 1 : 2;

              const handleSliderInteraction = (clientX: number, rect: DOMRect) => {
                const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
                setRiskValue(Math.round(pct));
                // Also set discrete riskLevel for engine/API
                const rl: RiskLevel = pct < 25 ? 'safe' : pct < 75 ? 'balanced' : 'bold';
                setRiskLevel(rl);
              };

              return (
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: '10px' }}>Risk Level</div>
                  {/* Labels */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    {RISK_LABELS.map((r, i) => (
                      <div key={r.key} onClick={() => { setRiskValue(r.pos); setRiskLevel(r.key); pushToast(`Risk set to ${r.label}`, 'success'); }} style={{ cursor: 'pointer', textAlign: i === 0 ? 'left' : i === 2 ? 'right' : 'center', transition: 'all 0.2s' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: i === closestIdx ? r.color : 'var(--muted)', opacity: i === closestIdx ? 1 : 0.5, transition: 'all 0.25s' }}>{r.label}</div>
                        <div style={{ fontSize: '10px', color: 'var(--muted)', opacity: i === closestIdx ? 0.8 : 0.4, transition: 'all 0.25s' }}>{r.desc}</div>
                      </div>
                    ))}
                  </div>
                  {/* Track */}
                  <div
                    ref={(el) => {
                      if (!el) return;
                      // Click
                      el.onclick = (e) => handleSliderInteraction(e.clientX, el.getBoundingClientRect());
                      // Drag
                      el.onmousedown = (e) => {
                        e.preventDefault();
                        const move = (ev: MouseEvent) => handleSliderInteraction(ev.clientX, el.getBoundingClientRect());
                        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                        window.addEventListener('mousemove', move);
                        window.addEventListener('mouseup', up);
                      };
                      // Touch
                      el.ontouchstart = (e) => {
                        const move = (ev: TouchEvent) => handleSliderInteraction(ev.touches[0].clientX, el.getBoundingClientRect());
                        const end = () => { window.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); };
                        window.addEventListener('touchmove', move);
                        window.addEventListener('touchend', end);
                      };
                    }}
                    style={{ position: 'relative', height: '8px', borderRadius: '99px', cursor: 'pointer', background: 'linear-gradient(90deg, #6366f1, #7b7dff, #a855f7)', touchAction: 'none' }}
                  >
                    <div style={{
                      position: 'absolute', top: '50%', left: `${riskValue}%`,
                      width: '22px', height: '22px', borderRadius: '50%',
                      border: '3px solid #fff', background: thumbColor,
                      transform: 'translate(-50%, -50%)',
                      boxShadow: `0 0 12px ${thumbColor}`,
                      transition: 'background 0.1s',
                      pointerEvents: 'none',
                    }} />
                  </div>
                </div>
              );
            })()}

            {/* Risk Description */}
            {riskLevel && (
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '10px', padding: '8px 10px', background: 'rgba(123,125,255,0.06)', borderRadius: '8px' }}>
                {RISK_DESCRIPTIONS[riskLevel]}
              </div>
            )}

            </div>

            {/* Trading Amount */}
            <div style={sessionLocked ? { opacity: 0.5, pointerEvents: 'none', position: 'relative', marginTop: '16px' } : { marginTop: '16px' }}>
            {sessionLocked && <div style={{ position: 'absolute', top: 8, right: 8, background: '#1a1a2e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4, zIndex: 10 }}>🔒 Amount locked during active run.</div>}
              <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: '8px' }}>Trading Amount</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {AMOUNT_PRESETS.map(val => {
                  const isActive = !customAmountMode && tradingAmount === val;
                  const frozen = isMidChallenge && tradingAmount != null && val < tradingAmount;
                  return (
                    <button key={val} onClick={() => handleAmountPreset(val)} disabled={frozen} style={{
                      flex: 1, padding: '10px 0', borderRadius: '12px', textAlign: 'center',
                      border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                      background: isActive ? 'rgba(123,125,255,0.15)' : 'var(--panel-2)',
                      color: isActive ? 'var(--accent)' : 'var(--text)',
                      fontSize: '14px', fontWeight: 600, cursor: frozen ? 'not-allowed' : 'pointer',
                      opacity: frozen ? 0.35 : 1, transition: 'all 0.15s',
                    }}>
                      ${val.toLocaleString()}
                    </button>
                  );
                })}
                <button onClick={() => { setCustomAmountMode(true); setCustomAmountInput(String(tradingAmount ?? '')); }} style={{
                  flex: 1, padding: '10px 0', borderRadius: '12px', textAlign: 'center',
                  border: `1px solid ${customAmountMode ? 'var(--accent)' : 'var(--border)'}`,
                  background: customAmountMode ? 'rgba(123,125,255,0.15)' : 'var(--panel-2)',
                  color: customAmountMode ? 'var(--accent)' : 'var(--muted)',
                  fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  Custom
                </button>
              </div>
              {customAmountMode && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={customAmountInput}
                    onChange={e => setCustomAmountInput(e.target.value)}
                    placeholder="Enter amount..."
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleCustomAmount()}
                    style={{ flex: 1, background: 'var(--panel-2)', border: '1px solid var(--accent)', color: 'var(--text)', padding: '10px 14px', borderRadius: '12px', fontSize: '16px', fontWeight: 600, outline: 'none' }}
                  />
                  <button onClick={handleCustomAmount} style={{ padding: '10px 16px', borderRadius: '12px', border: 'none', background: 'var(--accent)', color: '#0d0d1f', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>Set</button>
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>Paper trading — no real money at risk</div>
            </div>

            {/* Duration */}
            <div style={sessionLocked ? { opacity: 0.5, pointerEvents: 'none', position: 'relative', marginTop: '16px' } : { marginTop: '16px' }}>
            {sessionLocked && <div style={{ position: 'absolute', top: 8, right: 8, background: '#1a1a2e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4, zIndex: 10 }}>🔒 Duration locked during active run.</div>}
              <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: '8px' }}>Duration</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {TIMEFRAME_OPTIONS.map(tf => {
                  const isActive = !customTimeframeMode && timeframe === tf.value;
                  const shortLabel = tf.value === 'unlimited' ? '∞' : tf.value + 'd';
                  return (
                    <button key={tf.value} onClick={() => { setCustomTimeframeMode(false); handleTimeframeSelect(tf.value); }} style={{
                      flex: 1, padding: '8px 0', borderRadius: '10px', textAlign: 'center',
                      border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                      background: isActive ? 'rgba(123,125,255,0.15)' : 'var(--panel-2)',
                      color: isActive ? 'var(--accent)' : 'var(--text)',
                      fontSize: '12px', fontWeight: isActive ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      {shortLabel}
                    </button>
                  );
                })}
                <button onClick={() => { setCustomTimeframeMode(true); setCustomTimeframeInput(''); }} style={{
                  flex: 1, padding: '8px 0', borderRadius: '10px', textAlign: 'center',
                  border: `1px solid ${customTimeframeMode ? 'var(--accent)' : 'var(--border)'}`,
                  background: customTimeframeMode ? 'rgba(123,125,255,0.15)' : 'var(--panel-2)',
                  color: customTimeframeMode ? 'var(--accent)' : 'var(--muted)',
                  fontSize: '11px', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  Custom
                </button>
              </div>
              {customTimeframeMode && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={customTimeframeInput}
                    onChange={e => setCustomTimeframeInput(e.target.value)}
                    placeholder="45"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleCustomTimeframe()}
                    style={{ width: '80px', background: 'var(--panel-2)', border: '1px solid var(--accent)', color: 'var(--text)', padding: '8px 12px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, outline: 'none', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>days</span>
                  <button onClick={handleCustomTimeframe} style={{ padding: '8px 14px', borderRadius: '10px', border: 'none', background: 'var(--accent)', color: '#0d0d1f', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>Set</button>
                </div>
              )}
            </div>

            {/* Market Selector */}
            <div style={sessionLocked ? { opacity: 0.5, pointerEvents: 'none', position: 'relative', marginTop: '16px' } : { marginTop: '16px' }}>
            {sessionLocked && <div style={{ position: 'absolute', top: 8, right: 8, background: '#1a1a2e', border: '1px solid #2a2a4e', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4, zIndex: 10 }}>🔒 Market locked during active run.</div>}
              <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: '8px' }}>Market</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { label: '🪙 Crypto (Binance)', selected: true, available: true },
                  { label: '🔮 Polymarket', selected: false, available: true },
                  { label: '📈 Stocks (coming soon)', selected: false, available: false },
                  { label: '💱 Forex (coming soon)', selected: false, available: false },
                ].map(m => (
                  <button key={m.label} style={{
                    padding: '8px 12px', borderRadius: '10px', fontSize: '11px', fontWeight: m.selected ? 700 : 400,
                    border: `1px solid ${m.selected ? 'var(--accent)' : 'var(--border)'}`,
                    background: m.selected ? 'rgba(123,125,255,0.15)' : 'var(--panel-2)',
                    color: m.selected ? 'var(--accent)' : 'var(--text)',
                    opacity: m.available ? 1 : 0.4,
                    cursor: m.available ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s',
                  }}>{m.label}</button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Start Trading Bar — matches simple mode style */}
        <section style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '10px' }}>
            {engineOn ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '12px', background: '#141428', border: '1px solid #2a2a4e' }}>
                <span style={{ fontSize: '13px', color: '#888' }}>Trading with</span>
                <span style={{ fontSize: '17px', fontWeight: 700, color: '#7b7dff' }}>{formatCurrencyShort(tradingAmount || startingBalance)}</span>
                <span style={{ fontSize: '11px', color: '#555' }}>🔒</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '12px', background: '#141428', border: '1px solid #2a2a4e' }}>
                <span style={{ fontSize: '13px', color: '#888' }}>Trading with</span>
                <span style={{ fontSize: '17px', fontWeight: 700, color: '#7b7dff' }}>{formatCurrencyShort(tradingAmount || startingBalance)}</span>
              </div>
            )}
            <button
              onClick={handleEngineToggle}
              disabled={!setupReady && !engineOn}
              style={{
                flex: 1, padding: '14px 24px', borderRadius: '12px', border: 'none',
                fontSize: '16px', fontWeight: 700,
                cursor: (setupReady || engineOn) ? 'pointer' : 'not-allowed',
                background: engineOn ? '#00e676' : setupReady ? 'linear-gradient(135deg, #7b7dff 0%, #5b5ddf 100%)' : 'var(--panel-2)',
                color: engineOn ? '#0d0d1a' : setupReady ? 'white' : 'var(--muted)',
                transition: 'all 0.2s',
              }}
            >
              {engineOn ? '✨ Bot is Running — Tap to Pause' : (timeframeStartDate ? '▶ Resume Trading' : '▶ Start Trading')}
            </button>
          </div>
          {scanningStatus && (
            <div style={{
              textAlign: 'center', marginTop: '10px', padding: '10px 16px',
              background: 'rgba(123,125,255,0.08)', border: '1px solid rgba(123,125,255,0.2)',
              borderRadius: '10px', fontSize: '13px', color: '#7b7dff', fontWeight: 500,
            }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#7b7dff', marginRight: '8px', animation: 'pulse-glow-dot 1.5s infinite' }} />
              {scanningStatus === 'scanning' ? '🔍 Scanning watchlist for opportunities...' : scanningStatus}
            </div>
          )}
          <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--muted)' }}>
            {engineOn
              ? boardId
                ? <Link href={`/trading/${boardId}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>Watch your trades on the Board →</Link>
                : 'TBO Trading Engine is managing your portfolio'
              : setupReady
                ? 'TBO Trading Engine handles everything. You can pause anytime.'
                : 'Choose a risk level and amount to get started'}
          </div>
          {!engineOn && (
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button onClick={handleResetChallenge} style={{ background: 'none', border: '1px solid #f05b6f44', color: '#f05b6f', fontSize: '13px', cursor: 'pointer', padding: '8px 20px', borderRadius: '8px' }}>
                🔄 Reset &amp; Start New Challenge
              </button>
            </div>
          )}
        </section>

        {/* Advanced Settings */}
        <section style={{ marginBottom: '24px' }}>
          <button
            onClick={() => setAdvancedOpen(prev => !prev)}
            style={{
              background: 'var(--panel)', border: '1px solid var(--border)',
              borderRadius: advancedOpen ? '14px 14px 0 0' : '14px',
              padding: '12px 16px', width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer', color: 'var(--text)', fontSize: '13px', fontWeight: 600,
            }}
          >
            <span>⚙️ Advanced Settings — Coming Soon</span>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{advancedOpen ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {advancedOpen && (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '16px', display: 'grid', gap: '16px' }}>
              <AdvancedRow label="Manual Trade" description="Pick a specific coin and enter a trade manually" />
              <AdvancedRow label="Strategy Override" description="Choose a specific strategy instead of auto" />
              <AdvancedRow label="Stop Loss / Take Profit" description="Customize SL/TP for all new trades" />
              <AdvancedRow label="Position Sizing" description="Set rules for how much to allocate per trade" />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Compounding</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Reinvest profits into new trades</div>
                </div>
                <ToggleSwitch on={true} onChange={() => {}} />
              </div>
            </div>
          )}</section>

        {/* Risk modal removed — slider on dashboard is the control */}

        {/* Amount Modal */}
        {amountModalOpen && (
          <div onClick={e => { if (e.target === e.currentTarget) setAmountModalOpen(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,15,0.78)', display: 'grid', placeItems: 'center', zIndex: 90 }}>
            <div style={{ width: 'min(420px, 92vw)', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '18px', padding: '24px', boxShadow: 'var(--shadow)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>Set Trading Amount</div>
                <button onClick={() => setAmountModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="number"
                  value={amountInput}
                  onChange={e => setAmountInput(e.target.value)}
                  placeholder="500"
                  style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '12px 14px', borderRadius: '12px', fontSize: '18px', fontWeight: 600, outline: 'none' }}
                  autoFocus
                />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px', padding: '8px 12px', background: 'rgba(123,125,255,0.08)', borderRadius: '8px' }}>
                📝 Paper trading — no real money. This sets the virtual balance for your trading bot.
              </div>
              <button
                onClick={() => {
                  const parsed = Number(amountInput);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setTradingAmount(parsed);
                    setAmountModalOpen(false);
                    pushToast(`Amount set to ${formatCurrency(parsed)}`, 'success');
                  }
                }}
                style={{ width: '100%', background: 'linear-gradient(135deg, var(--accent), #9a9cff)', color: '#0d0d1f', border: 'none', padding: '12px', borderRadius: '999px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        <ToastStack
          toasts={toasts}
          onDismiss={(id) => {
            if (toastTimersRef.current[id]) { clearTimeout(toastTimersRef.current[id]); delete toastTimersRef.current[id]; }
            setToasts(prev => prev.filter(t => t.id !== id));
          }}
        />

        <style jsx global>{`
          @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 20px rgba(123,125,255,0.25); }
            50% { box-shadow: 0 0 35px rgba(123,125,255,0.5); }
          }
          @media (max-width: 768px) {
            .stats-row { flex-wrap: wrap !important; }
            .stats-row > div { min-width: calc(50% - 6px) !important; flex: 1 1 calc(50% - 6px) !important; }
            .portfolio-grid { grid-template-columns: 1fr !important; }
            .coin-pulse-row { flex-wrap: wrap !important; }
          }
          @media (max-width: 480px) {
            .stats-row > div { min-width: 100% !important; flex: 1 1 100% !important; }
          }
        `}</style>
      </div>
    </>
  );
}

/* ── Subcomponents ── */

function StepHeader({ step, total, label, done }: { step: number; total: number; label: string; done: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '12px' }}>
      <span style={{
        fontSize: '11px',
        fontWeight: 700,
        color: done ? '#4ade80' : 'var(--accent)',
        background: done ? 'rgba(74,222,128,0.12)' : 'rgba(123,125,255,0.12)',
        padding: '3px 10px',
        borderRadius: '999px',
        whiteSpace: 'nowrap',
      }}>
        {done ? '✓' : `Step ${step} of ${total}`}
      </span>
      <span style={{ fontSize: '13px', fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function SetupRow({ isSet, value, onSet }: { isSet: boolean; value: React.ReactNode; onSet: () => void }) {
  return (
    <div style={{ padding: '8px 0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ fontSize: '13px' }}>{value}</div>
        <button
          onClick={onSet}
          style={{
            background: isSet ? 'transparent' : 'linear-gradient(135deg, var(--accent), #9a9cff)',
            color: isSet ? 'var(--accent)' : '#0d0d1f',
            border: isSet ? '1px solid var(--border)' : 'none',
            padding: '6px 14px',
            borderRadius: '999px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '12px',
            whiteSpace: 'nowrap',
          }}
        >
          {isSet ? 'Change' : 'Set'}
        </button>
      </div>
    </div>
  );
}

function SubtlePrompt({ text }: { text?: string }) {
  return (
    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', fontStyle: 'italic' }}>
      {text ?? 'Set this to start trading ↑'}
    </div>
  );
}

function Divider() {
  return <div style={{ height: '1px', background: 'var(--border)' }} />;
}

function ToggleSwitch({ on, onChange, disabled, big, glow }: { on: boolean; onChange: () => void; disabled?: boolean; big?: boolean; glow?: boolean }) {
  const w = big ? 56 : 44;
  const h = big ? 30 : 24;
  const dot = big ? 22 : 16;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      style={{
        width: `${w}px`,
        height: `${h}px`,
        borderRadius: '999px',
        border: `1px solid ${on ? '#4ade80' : 'var(--border)'}`,
        background: on ? '#4ade80' : 'var(--panel-2)',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        boxShadow: glow ? '0 0 16px rgba(74,222,128,0.5)' : 'none',
        transition: 'all 0.2s',
      }}
    >
      <span style={{
        position: 'absolute',
        top: `${(h - dot) / 2 - 1}px`,
        left: on ? `${w - dot - 4}px` : '3px',
        width: `${dot}px`,
        height: `${dot}px`,
        borderRadius: '999px',
        background: '#0d0d1f',
        transition: 'left 160ms ease',
      }} />
    </button>
  );
}

function AdvancedRow({ label, description }: { label: string; description: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{description}</div>
      </div>
      <button style={{ padding: '6px 14px', borderRadius: '999px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: '12px', cursor: 'pointer' }}>
        Configure
      </button>
    </div>
  );
}
