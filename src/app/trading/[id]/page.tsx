'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { UserMenu } from '@/components/UserMenu';
import TradingChart from '@/components/TradingChart';
import { ToastStack, type ToastItem } from '@/components/ToastStack';
import { AlertsPanel } from '@/components/AlertsPanel';
import { TboToggle } from '@/components/TboToggle';

interface Trade {
  id: number;
  board_id: number;
  column_name: string;
  coin_pair: string;
  direction?: string;
  entry_price?: number | string | null;
  current_price?: number | string | null;
  exit_price?: number | string | null;
  stop_loss?: number | string | null;
  take_profit?: number | string | null;
  position_size?: number | string | null;
  tbo_signal?: string | null;
  rsi_value?: number | string | null;
  confidence_score?: number | string | null;
  pnl_dollar?: number | string | null;
  pnl_percent?: number | string | null;
  notes?: string | null;
  status?: string | null;
  created_at?: string;
  updated_at?: string;
  entered_at?: string | null;
  exited_at?: string | null;
  created_by_name?: string;
  pause_reason?: string | null;
  lesson_tag?: string | null;
  trade_settings?: Record<string, unknown> | null;
  metadata?: string | Record<string, unknown> | null;
  priority?: string | null;
}

interface EquityPoint {
  date: string;
  pnl: number;
  cumulative: number;
  coin_pair: string;
}

interface TradingStats {
  total_trades: number;
  active_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_pnl: number;
  avg_win: number;
  avg_loss: number;
  best_trade: number;
  worst_trade: number;
  by_coin: Array<{
    coin_pair: string;
    total_trades: number;
    wins: number;
    losses: number;
    win_rate: number;
    total_pnl: number;
    avg_win: number;
    avg_loss: number;
  }>;
  recent_trades: Trade[];
  equityCurve?: EquityPoint[];
}

interface Board {
  id: number;
  name: string;
  description?: string;
  team_name?: string;
  team_slug?: string;
  team_id?: number | null;
  is_personal: boolean;
  board_type?: string;
  visibility?: string;
  user_role?: string;
}

interface Comment {
  id: number;
  content: string;
  user_name?: string;
  user_avatar?: string;
  created_at: string;
}

interface ActivityItem {
  id: number;
  action: string;
  from_column?: string | null;
  to_column?: string | null;
  actor_name?: string | null;
  created_at: string;
  details?: any;
}

interface BotActivityItem {
  id: number;
  action: string;
  created_at: string;
  coin_pair?: string | null;
  confidence_score?: number | string | null;
}

interface JournalEntry {
  id: number;
  entry_type: string;
  content: string;
  mood?: string | null;
  created_at: string;
  created_by_name?: string | null;
}

interface PaperAccount {
  id: number;
  board_id: number;
  user_id: number;
  starting_balance: number | string;
  current_balance: number | string;
  created_at: string;
  updated_at: string;
}

interface TeamMember {
  id: number;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  role: string;
  joined_at: string;
}

const columns = [
  { name: 'Watchlist', color: '#6f7db8' },
  { name: 'Analyzing', color: '#8aa5ff' },
  { name: 'Active', color: '#f5b544' },
  { name: 'Parked', color: '#9ca3af' },
  { name: 'Closed', color: '#7b7dff' },
];

const BOT_STYLE_MAP: Record<string, { icon: string; substyles: Record<string, string> }> = {
  'Swing Trading': {
    icon: '🏄',
    substyles: {
      Momentum: 'Ride stronger trends using volume + breakout confirmation.',
      'Mean Reversion': 'Fade exhausted moves back toward the mean.',
      Breakout: 'Trade volatility expansions after tight ranges.'
    }
  },
  'Day Trading': {
    icon: '⚡️',
    substyles: {
      Momentum: 'Trade intraday trend bursts with tight risk.',
      Range: 'Buy support, sell resistance inside ranges.'
    }
  },
  Scalper: {
    icon: '🧵',
    substyles: {
      Grid: 'Layer micro orders around a tight midline.',
      Momentum: 'Hit quick bursts, exit fast.'
    }
  },
  Fundamental: {
    icon: '📚',
    substyles: {
      Value: 'Buy discounted narratives with risk buffers.',
      Narrative: 'Trade stories before they hit the crowd.'
    }
  },
  'Long-Term Investor': {
    icon: '🛰️',
    substyles: {
      DCA: 'Accumulate steadily with strict allocation rules.',
      'Dip Buyer': 'Deploy cash on drawdown signals.'
    }
  }
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--panel-2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '10px 12px',
  borderRadius: '10px',
  outline: 'none',
  fontSize: '13px',
};

const primaryBtnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--accent), #9a9cff)',
  color: '#0d0d1f',
  border: 'none',
  padding: '10px 16px',
  borderRadius: '999px',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '13px',
};

const secondaryBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  padding: '10px 14px',
  borderRadius: '999px',
  cursor: 'pointer',
  fontSize: '13px',
};

function normalizePair(pair: string) {
  return pair.replace(/-/g, '/').toUpperCase();
}

function toApiPair(pair: string) {
  return pair.replace(/\//g, '-').toUpperCase();
}

function formatCurrency(value: number | null, forceDecimals?: number) {
  if (value === null || !Number.isFinite(value)) return '—';
  const decimals = forceDecimals ?? 2;
  return `$${value.toFixed(decimals)}`;
}

function formatPrice(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return value.toFixed(decimals);
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}%`;
}

function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function computePnl(trade: Trade, livePrice?: number | null) {
  const entry = toNumber(trade.entry_price);
  const current = toNumber(livePrice ?? trade.current_price ?? trade.exit_price);
  const size = toNumber(trade.position_size);
  if (entry === null || current === null) return null;

  const isShort = String(trade.direction || '').toLowerCase() === 'short';
  const perUnit = isShort ? entry - current : current - entry;
  // size is in dollars, not quantity — divide by entry to get quantity first
  const pnlDollar = size !== null && entry !== 0 ? (perUnit / entry) * size : null;
  const pnlPercent = entry !== 0 ? (perUnit / entry) * 100 : 0;
  return { pnlDollar, pnlPercent };
}

function signalBadge(signal?: string | null) {
  const normalized = String(signal || '').toUpperCase();
  if (normalized === 'BUY') return { label: 'BUY', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.18)' };
  if (normalized === 'SELL') return { label: 'SELL', color: '#f05b6f', bg: 'rgba(240, 91, 111, 0.18)' };
  if (normalized === 'HOLD') return { label: 'HOLD', color: '#f5b544', bg: 'rgba(245, 181, 68, 0.18)' };
  if (normalized) return { label: normalized, color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.18)' };
  return { label: 'NEUTRAL', color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.18)' };
}

function getBotDisplayName(name?: string | null) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('penny')) return 'Penny';
  if (lower.includes('owen')) return 'Owen';
  if (lower.includes('betty')) return 'Betty';
  return null;
}

function confidenceColor(score: number | null) {
  if (score === null || !Number.isFinite(score)) return '#9ca3af';
  if (score >= 80) return '#4ade80';
  if (score >= 60) return '#a3e635';
  if (score >= 40) return '#f5b544';
  if (score >= 20) return '#f59e0b';
  return '#f05b6f';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deriveSentiment(trade: any): { label: string; color: string; bg: string } {
  const rsi = Number(trade.rsi_value);
  const confidence = Number(trade.confidence_score);
  const change = Number(trade.pnl_percent ?? 0);
  const notes = String(trade.notes ?? '').toLowerCase();

  // Check notes for explicit signals from the trading engine
  const notesBullish = notes.includes('bullish') || notes.includes('uptrend') || notes.includes('bounce') || notes.includes('breakout');
  const notesBearish = notes.includes('bearish') || notes.includes('downtrend') || notes.includes('breakdown') || notes.includes('selling');

  // RSI-based
  const rsiBullish = Number.isFinite(rsi) && rsi < 40;
  const rsiBearish = Number.isFinite(rsi) && rsi > 65;

  // Confidence-based
  const confBullish = Number.isFinite(confidence) && confidence >= 65;
  const confBearish = Number.isFinite(confidence) && confidence < 35;

  // Score: positive = bullish, negative = bearish
  let score = 0;
  if (notesBullish) score += 2;
  if (notesBearish) score -= 2;
  if (rsiBullish) score += 1; // Oversold = buying opportunity
  if (rsiBearish) score -= 1; // Overbought = caution
  if (confBullish) score += 1;
  if (confBearish) score -= 1;
  if (change > 2) score += 1;
  if (change < -2) score -= 1;

  if (score >= 2) return { label: 'Bullish', color: '#4ade80', bg: 'rgba(74,222,128,0.15)' };
  if (score <= -2) return { label: 'Bearish', color: '#f05b6f', bg: 'rgba(240,91,111,0.15)' };
  return { label: 'Neutral', color: 'var(--accent)', bg: 'rgba(123,125,255,0.15)' };
}

export default function TradingBoardPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id as string;

  const [board, setBoard] = useState<Board | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [boardLoading, setBoardLoading] = useState(true);
  const [tradesLoading, setTradesLoading] = useState(true);
  const [dragTradeId, setDragTradeId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [priceMap, setPriceMap] = useState<Record<string, { price: number; volume24h: number; change24h: number; high24h?: number; low24h?: number }>>({});
  const [priceFlashMap, setPriceFlashMap] = useState<Record<string, { direction: 'up' | 'down'; token: number }>>({});
  const [exitPrompt, setExitPrompt] = useState<{ trade: Trade; target: string } | null>(null);
  const [stats, setStats] = useState<TradingStats | null>(null);
  const [statsExpanded, setStatsExpanded] = useState(true);
  const [statsInitialized, setStatsInitialized] = useState(false);
  const [chartPair, setChartPair] = useState<string | null>(null);
  const [activeIndicators, setActiveIndicators] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(window.localStorage.getItem('clawdesk-indicators') || '[]');
    } catch {
      return [];
    }
  });
  const [tboEnabled, setTboEnabled] = useState(() => { try { return typeof window !== 'undefined' && JSON.parse(localStorage.getItem('clawdesk-tbo-enabled') || 'false'); } catch { return false; } });
  const [tboSignal, setTboSignal] = useState<any>(null);
  const [tboLoading, setTboLoading] = useState(false);

  // Fetch TBO signals when enabled
  useEffect(() => {
    if (!tboEnabled || !chartPair) { setTboSignal(null); return; }
    let cancelled = false;
    const fetchTbo = async () => {
      setTboLoading(true);
      try {
        const symbol = chartPair.replace(/[/-]/g, '').toUpperCase();
        const res = await fetch(`/api/trading/tbo-signals?symbol=${symbol}`);
        if (!cancelled && res.ok) setTboSignal(await res.json());
      } catch { if (!cancelled) setTboSignal(null); }
      if (!cancelled) setTboLoading(false);
    };
    fetchTbo();
    const iv = setInterval(fetchTbo, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [tboEnabled, chartPair]);

  // Compute effective indicators (add EMAs when TBO active)
  const effectiveIndicators = useMemo(() => {
    if (!tboEnabled) return activeIndicators;
    const extras = ['EMA20', 'EMA50'];
    return [...new Set([...activeIndicators, ...extras])];
  }, [activeIndicators, tboEnabled]);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [tradeStreamConnected, setTradeStreamConnected] = useState(false);
  const [priceStreamConnected, setPriceStreamConnected] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [newTradeOpen, setNewTradeOpen] = useState(false);
  const [actionMenu, setActionMenu] = useState<{ trade: Trade; x: number; y: number } | null>(null);
  const [botActivity, setBotActivity] = useState<BotActivityItem[]>([]);
  const [botActivityLoading, setBotActivityLoading] = useState(true);
  const [botScansExpanded, setBotScansExpanded] = useState(true);
  const [boardBots, setBoardBots] = useState<any[]>([]);
  const [boardBotsLoading, setBoardBotsLoading] = useState(true);
  const [autoTradeOpen, setAutoTradeOpen] = useState(false);
  const [autoTradeStyle, setAutoTradeStyle] = useState('Swing Trading');
  const [autoTradeSubstyle, setAutoTradeSubstyle] = useState('Momentum');
  const [autoTradeBalance, setAutoTradeBalance] = useState(100);
  const [autoTradeCreating, setAutoTradeCreating] = useState(false);
  const [watchlistSidebarOpen, setWatchlistSidebarOpen] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});
  // Start a Trade removed — trades configured from dashboard
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertBadgeCount, setAlertBadgeCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [isTeamAdmin, setIsTeamAdmin] = useState(false);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: number; name: string; email: string; role?: string }>>([]);
  const [showBoardSettings, setShowBoardSettings] = useState(false);
  const [paperAccount, setPaperAccount] = useState<{ starting_balance: number; current_balance: number } | null>(null);
  const [paperLoading, setPaperLoading] = useState(false);
  const [watchlistCoins, setWatchlistCoins] = useState<Array<{ id: number; coin_pair: string; tbo_signal?: string | null }>>([]);

  const priceMapRef = useRef<Record<string, { price: number; volume24h: number; change24h: number; high24h?: number; low24h?: number }>>({});
  const tradesRef = useRef<Trade[]>([]);
  const toastIdRef = useRef(1);
  const toastTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const reconnectRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const priceAlertRef = useRef<Record<string, { tp?: boolean; sl?: boolean }>>({});
  const alertCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('clawdesk-indicators', JSON.stringify(activeIndicators));
  }, [activeIndicators]);

  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/boards');
      if (!res.ok) { router.push('/'); return; }
      const data = await res.json();
      const b = data.boards?.find((item: Board) => item.id === parseInt(boardId));
      if (!b) { router.push('/'); return; }
      if (b.board_type !== 'trading') {
        router.push(`/board/${boardId}`);
        return;
      }
      setBoard(b);
    } catch {
      router.push('/');
    } finally {
      setBoardLoading(false);
    }
  }, [boardId, router]);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/boards/${boardId}/trades`);
      if (res.ok) {
        const data = await res.json();
        const nextTrades = data.trades || [];
        tradesRef.current = nextTrades;
        setTrades(nextTrades);
      }
    } catch {
      // silent
    }
    setTradesLoading(false);
  }, [boardId]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/boards/${boardId}/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats || null);
      }
    } catch {
      // silent
    }
  }, [boardId]);

  const fetchBotActivity = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/boards/${boardId}/bot-activity?limit=12`);
      if (res.ok) {
        const data = await res.json();
        setBotActivity(data.activity || []);
      }
    } catch {
      // silent
    }
    setBotActivityLoading(false);
  }, [boardId]);

  const fetchBoardBots = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/bots?boardId=${boardId}`);
      if (res.ok) {
        const data = await res.json();
        setBoardBots(data.bots || []);
      }
    } catch {
      // silent
    }
    setBoardBotsLoading(false);
  }, [boardId]);

  const refreshAlertCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/alerts?boardId=${boardId}`);
      if (res.ok) {
        const data = await res.json();
        const count = (data.alerts || []).filter((alert: { triggered?: boolean }) => !alert.triggered).length;
        setAlertBadgeCount(count);
      }
    } catch {
      // silent
    }
  }, [boardId]);

  const pushToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = toastIdRef.current++;
    setToasts(prev => [...prev, { id, message, type }]);
    if (toastTimersRef.current[id]) {
      clearTimeout(toastTimersRef.current[id]);
    }
    toastTimersRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete toastTimersRef.current[id];
    }, 3000);
  }, []);

  useEffect(() => {
    const wl = trades.filter(t => t.column_name === 'Watchlist');
    setWatchlistCoins(wl.map(t => ({ id: t.id, coin_pair: t.coin_pair, tbo_signal: t.tbo_signal })));
  }, [trades]);

  useEffect(() => {
    fetchBoard();
    fetchTrades();
    fetchStats();
    fetchBotActivity();
    fetchBoardBots();
    refreshAlertCount();
  }, [fetchBoard, fetchBotActivity, fetchBoardBots, fetchStats, fetchTrades, refreshAlertCount]);

  useEffect(() => {
    const nextSubstyle = Object.keys(BOT_STYLE_MAP[autoTradeStyle]?.substyles ?? {})[0];
    if (nextSubstyle) setAutoTradeSubstyle(nextSubstyle);
  }, [autoTradeStyle]);

  useEffect(() => {
    if (!stats || statsInitialized) return;
    const hasClosedTrades = (stats.equityCurve?.length || 0) > 0;
    setStatsExpanded(hasClosedTrades);
    setStatsInitialized(true);
  }, [stats, statsInitialized]);

  const pairList = useMemo(() => {
    const pairs = new Set<string>();
    trades.forEach((trade) => {
      if (trade.coin_pair) {
        pairs.add(normalizePair(trade.coin_pair));
      }
    });
    return Array.from(pairs);
  }, [trades]);

  const refreshPrices = useCallback(async () => {
    if (!pairList.length) return;
    const pairsParam = pairList.map((pair) => pair.replace('/', '-')).join(',');
    try {
      const res = await fetch(`/api/v1/prices?pairs=${encodeURIComponent(pairsParam)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.prices) {
          priceMapRef.current = data.prices;
          setPriceMap(data.prices);
          pushToast('Prices refreshed', 'info');
        }
      }
    } catch {
      pushToast('Price refresh failed', 'error');
    }
  }, [pairList, pushToast]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'Escape') {
        if (showShortcuts) {
          setShowShortcuts(false);
        } else if (actionMenu) {
          setActionMenu(null);
        } else if (editingTrade) {
          setEditingTrade(null);
        } else if (exitPrompt) {
          setExitPrompt(null);
        } else if (newTradeOpen) {
          setNewTradeOpen(false);
        } else if (chartPair) {
          setChartPair(null);
        }
        return;
      }
      if (event.key === 'N' || event.key === 'n') {
        event.preventDefault();
        setNewTradeOpen(true);
      }
      if (event.key === 'R' || event.key === 'r') {
        event.preventDefault();
        refreshPrices();
      }
      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault();
        setShowShortcuts((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [actionMenu, chartPair, editingTrade, exitPrompt, newTradeOpen, refreshPrices, showShortcuts]);

  useEffect(() => {
    if (!pairList.length) return;
    const pairsParam = pairList.map((pair) => pair.replace('/', '-')).join(',');
    const url = `/api/v1/prices/stream?pairs=${encodeURIComponent(pairsParam)}`;
    let source: EventSource | null = null;
    let retry = 0;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      source = new EventSource(url);
      source.onopen = () => {
        retry = 0;
        setPriceStreamConnected(true);
      };
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.prices) {
            const nextPrices = payload.prices as Record<string, { price: number; volume24h: number; change24h: number; high24h?: number; low24h?: number }>;
            const prevPrices = priceMapRef.current;
            priceMapRef.current = nextPrices;
            setPriceMap(nextPrices);

            Object.entries(nextPrices).forEach(([pair, data]) => {
              const prev = prevPrices[pair]?.price;
              if (prev !== undefined && data.price !== prev) {
                const direction = data.price > prev ? 'up' : 'down';
                setPriceFlashMap((current) => ({
                  ...current,
                  [pair]: { direction, token: (current[pair]?.token ?? 0) + 1 },
                }));
              }
            });
          }
        } catch {
          // ignore parse errors
        }
      };
      source.onerror = () => {
        if (stopped) return;
        setPriceStreamConnected(false);
        pushToast('Prices stream disconnected', 'warning');
        source?.close();
        retry += 1;
        const delay = Math.min(15000, 1000 * Math.pow(2, retry));
        reconnectRef.current.prices = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      stopped = true;
      source?.close();
      if (reconnectRef.current.prices) {
        clearTimeout(reconnectRef.current.prices);
      }
    };
  }, [pairList, pushToast]);

  useEffect(() => {
    const url = `/api/v1/trades/stream?boardId=${encodeURIComponent(boardId)}`;
    let source: EventSource | null = null;
    let retry = 0;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      source = new EventSource(url);
      source.onopen = () => {
        retry = 0;
        setTradeStreamConnected(true);
      };
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.trades) {
            const nextTrades = payload.trades as Trade[];
            const prevTrades = tradesRef.current;
            const prevMap = new Map(prevTrades.map(t => [t.id, t]));
            let botUpdate = false;

            nextTrades.forEach((trade) => {
              const prev = prevMap.get(trade.id);
              if (prev) {
                if (prev.column_name !== trade.column_name) {
                  pushToast(`${normalizePair(trade.coin_pair)} moved to ${trade.column_name}`, 'info');
                }
                if (prev.status !== trade.status) {
                  const status = String(trade.status || '').toLowerCase();
                  if (status === 'active') {
                    pushToast(`${normalizePair(trade.coin_pair)} entered`, 'success');
                  }
                  if (status === 'closed' || status === 'won' || status === 'lost') {
                    pushToast(`${normalizePair(trade.coin_pair)} exited`, 'success');
                  }
                }
              } else {
                const botName = getBotDisplayName(trade.created_by_name);
                if (botName) {
                  pushToast(`🤖 ${botName} added ${normalizePair(trade.coin_pair)} to ${trade.column_name || 'Watchlist'}`, 'success');
                  botUpdate = true;
                } else {
                  pushToast(`New trade: ${normalizePair(trade.coin_pair)}`, 'success');
                }
              }
            });

            tradesRef.current = nextTrades;
            setTrades(nextTrades);
            setTradesLoading(false);
            fetchStats();
            if (botUpdate) {
              fetchBotActivity();
            }
          }
        } catch {
          // ignore
        }
      };
      source.onerror = () => {
        if (stopped) return;
        setTradeStreamConnected(false);
        pushToast('Trades stream disconnected', 'warning');
        source?.close();
        retry += 1;
        const delay = Math.min(15000, 1000 * Math.pow(2, retry));
        reconnectRef.current.trades = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      stopped = true;
      source?.close();
      if (reconnectRef.current.trades) {
        clearTimeout(reconnectRef.current.trades);
      }
    };
  }, [boardId, fetchBotActivity, fetchStats, pushToast]);

  useEffect(() => {
    trades.forEach((trade) => {
      const pair = normalizePair(trade.coin_pair);
      const livePrice = priceMap[pair]?.price;
      if (!Number.isFinite(livePrice)) return;

      const tp = toNumber(trade.take_profit);
      const sl = toNumber(trade.stop_loss);
      const direction = String(trade.direction || '').toLowerCase();
      const key = String(trade.id);
      const flags = priceAlertRef.current[key] || {};

      if (tp !== null && !flags.tp) {
        const hit = direction === 'short' ? livePrice <= tp : livePrice >= tp;
        if (hit) {
          priceAlertRef.current[key] = { ...flags, tp: true };
          pushToast(`${normalizePair(trade.coin_pair)} hit take profit`, 'success');
        }
      }

      if (sl !== null && !flags.sl) {
        const hit = direction === 'short' ? livePrice >= sl : livePrice <= sl;
        if (hit) {
          priceAlertRef.current[key] = { ...priceAlertRef.current[key], sl: true };
          pushToast(`${normalizePair(trade.coin_pair)} hit stop loss`, 'error');
        }
      }
    });
  }, [priceMap, trades, pushToast]);

  useEffect(() => {
    if (!Object.keys(priceMap).length) return;
    if (alertCheckRef.current) {
      clearTimeout(alertCheckRef.current);
    }
    alertCheckRef.current = setTimeout(async () => {
      try {
        const payloadPrices = Object.fromEntries(
          Object.entries(priceMap).map(([pair, data]) => [pair, data.price])
        );
        const res = await fetch('/api/v1/alerts/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boardId: Number(boardId), prices: payloadPrices }),
        });
        if (res.ok) {
          const data = await res.json();
          const triggered = data.triggered || [];
          if (triggered.length) {
            triggered.forEach((alert: { coin_pair?: string | null; alert_type?: string }) => {
              const pair = alert.coin_pair ? normalizePair(alert.coin_pair) : 'Board';
              pushToast(`🔔 Alert triggered: ${pair}`, 'warning');
            });
            refreshAlertCount();
          }
        }
      } catch {
        // silent
      }
    }, 4000);

    return () => {
      if (alertCheckRef.current) {
        clearTimeout(alertCheckRef.current);
      }
    };
  }, [boardId, priceMap, pushToast, refreshAlertCount]);

  useEffect(() => {
    if (!actionMenu) return;
    const handleClick = () => setActionMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [actionMenu]);

  useEffect(() => {
    tradesRef.current = trades;
  }, [trades]);

  const handleDragStart = (tradeId: number) => {
    setDragTradeId(tradeId);
  };

  const handleDragOver = (e: React.DragEvent, col: string) => {
    e.preventDefault();
    setDragOverCol(col);
  };

  const handleDragLeave = () => setDragOverCol(null);

  const handleDrop = async (e: React.DragEvent, col: string) => {
    e.preventDefault();
    setDragOverCol(null);
    if (dragTradeId === null) return;

    const trade = trades.find(t => t.id === dragTradeId);
    if (!trade || trade.column_name === col) return;

    if (col === 'Closed') {
      // If trade already has exit_price and pnl (e.g. from Parked), skip the exit prompt
      const alreadyClosed = trade.exit_price && trade.pnl_dollar !== null && trade.pnl_dollar !== undefined;
      if (alreadyClosed) {
        setTrades(prev => prev.map(t => t.id === dragTradeId ? { ...t, column_name: col } : t));
        try {
          await fetch(`/api/trading/trades`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trade_id: trade.id, column_name: 'Closed' }),
          });
        } catch {}
        setDragTradeId(null);
        return;
      }
      setExitPrompt({ trade, target: col });
      setDragTradeId(null);
      return;
    }

    setTrades(prev => prev.map(t => t.id === dragTradeId ? { ...t, column_name: col } : t));

    try {
      await fetch(`/api/v1/trades/${dragTradeId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: col }),
      });
    } catch {
      fetchTrades();
    }
    setDragTradeId(null);
  };

  const moveTradeTo = useCallback(async (tradeId: number, col: string) => {
    setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, column_name: col } : t));
    try {
      await fetch(`/api/v1/trades/${tradeId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: col }),
      });
    } catch {
      fetchTrades();
    }
  }, [fetchTrades]);

  const enterTradeQuick = useCallback(async (trade: Trade) => {
    try {
      const res = await fetch(`/api/v1/trades/${trade.id}/enter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_price: null }),
      });
      if (res.ok) {
        pushToast(`${normalizePair(trade.coin_pair)} entered`, 'success');
        fetchTrades();
      }
    } catch {
      pushToast('Failed to enter trade', 'error');
    }
  }, [fetchTrades, pushToast]);

  const exitTradeQuick = useCallback(async (trade: Trade) => {
    const pair = normalizePair(trade.coin_pair);
    const livePrice = priceMap[pair]?.price ?? toNumber(trade.current_price);
    if (!Number.isFinite(livePrice)) {
      setExitPrompt({ trade, target: trade.column_name });
      return;
    }
    try {
      const res = await fetch(`/api/v1/trades/${trade.id}/exit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exit_price: livePrice }),
      });
      if (res.ok) {
        pushToast(`${normalizePair(trade.coin_pair)} exited`, 'success');
        fetchTrades();
      }
    } catch {
      pushToast('Failed to exit trade', 'error');
    }
  }, [fetchTrades, priceMap, pushToast]);

  const deleteTradeQuick = useCallback(async (trade: Trade) => {
    try {
      const res = await fetch(`/api/v1/trades/${trade.id}`, { method: 'DELETE' });
      if (res.ok) {
        pushToast(`${normalizePair(trade.coin_pair)} deleted`, 'warning');
        fetchTrades();
      }
    } catch {
      pushToast('Failed to delete trade', 'error');
    }
  }, [fetchTrades, pushToast]);

  const columnTotals = useMemo(() => {
    const totals: Record<string, { count: number; pnl: number }> = {};
    columns.forEach((col) => { totals[col.name] = { count: 0, pnl: 0 }; });
    trades.forEach((trade) => {
      const live = priceMap[normalizePair(trade.coin_pair)]?.price ?? null;
      const computed = computePnl(trade, live);
      const pnl = toNumber(trade.pnl_dollar) ?? computed?.pnlDollar ?? 0;
      if (!totals[trade.column_name]) {
        totals[trade.column_name] = { count: 0, pnl: 0 };
      }
      totals[trade.column_name].count += 1;
      totals[trade.column_name].pnl += pnl || 0;
    });
    return totals;
  }, [trades, priceMap]);

  const bestWorstTrades = useMemo(() => {
    const closedTrades = trades.filter((trade) => {
      const status = String(trade.status || '').toLowerCase();
      return trade.column_name === 'Closed' || trade.column_name === 'Wins' || trade.column_name === 'Losses' || ['closed', 'won', 'lost'].includes(status);
    });

    const withPnl = closedTrades.map((trade) => {
      const exitPrice = toNumber(trade.exit_price);
      const computed = computePnl(trade, exitPrice);
      const pnl = toNumber(trade.pnl_dollar) ?? computed?.pnlDollar ?? null;
      return pnl === null ? null : { trade, pnl };
    }).filter(Boolean) as Array<{ trade: Trade; pnl: number }>;

    if (!withPnl.length) {
      return { best: null, worst: null };
    }

    let best = withPnl[0];
    let worst = withPnl[0];
    withPnl.forEach((item) => {
      if (item.pnl > best.pnl) best = item;
      if (item.pnl < worst.pnl) worst = item;
    });
    return { best, worst };
  }, [trades]);

  const equityChart = useMemo(() => {
    const points = stats?.equityCurve ?? [];
    if (!points.length) return null;

    const w = 800;
    const h = 110;
    const pad = 18;
    const chartW = w - pad * 2;
    const chartH = h - pad * 2;
    const values = points.map(p => p.cumulative);
    const minVal = Math.min(...values, 0);
    const maxVal = Math.max(...values, 0);
    const range = maxVal - minVal || 1;

    const toPoint = (value: number, index: number) => {
      const x = pad + (points.length === 1 ? 0 : (index / (points.length - 1)) * chartW);
      const y = pad + chartH - ((value - minVal) / range) * chartH;
      return { x, y };
    };

    const linePoints = points.map((p, i) => {
      const { x, y } = toPoint(p.cumulative, i);
      return `${x},${y}`;
    }).join(' ');

    const lastValue = values[values.length - 1] || 0;
    const lineColor = lastValue >= 0 ? '#4ade80' : '#f05b6f';

    return { w, h, pad, chartW, chartH, linePoints, lineColor, toPoint };
  }, [stats]);

  const glassCard: React.CSSProperties = {
    background: 'rgba(20, 20, 40, 0.6)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '16px',
  };

  const winRateValue = stats ? stats.win_rate : null;
  const winRateColor = winRateValue === null ? 'var(--muted)' : winRateValue >= 50 ? '#4ade80' : '#f05b6f';
  const totalPnlValue = stats ? stats.total_pnl : null;
  const totalPnlColor = totalPnlValue === null ? 'var(--muted)' : totalPnlValue >= 0 ? '#4ade80' : '#f05b6f';
  const bestTradeColor = bestWorstTrades.best ? (bestWorstTrades.best.pnl >= 0 ? '#4ade80' : '#f05b6f') : 'var(--muted)';
  const worstTradeColor = bestWorstTrades.worst ? (bestWorstTrades.worst.pnl >= 0 ? '#4ade80' : '#f05b6f') : 'var(--muted)';
  const sseConnected = priceStreamConnected && tradeStreamConnected;
  const selectedPair = chartPair ? normalizePair(chartPair) : null;
  const selectedPrice = selectedPair ? priceMap[selectedPair]?.price ?? null : null;
  const indicatorOptions = [
    { key: 'RSI', label: 'RSI' },
    { key: 'MACD', label: 'MACD' },
    { key: 'BB', label: 'Bollinger Bands' },
    { key: 'EMA20', label: 'EMA 20' },
    { key: 'EMA50', label: 'EMA 50' },
    { key: 'EMA200', label: 'EMA 200' },
    { key: 'Volume', label: 'Volume' },
    { key: 'StochRSI', label: 'Stochastic RSI' },
  ];

  const handleAutoTradeCreate = async () => {
    if (!boardId) return;
    setAutoTradeCreating(true);
    try {
      const res = await fetch('/api/v1/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${autoTradeStyle} ${autoTradeSubstyle} Bot`,
          board_id: Number(boardId),
          strategy_style: autoTradeStyle,
          strategy_substyle: autoTradeSubstyle,
          strategy_config: { startingBalance: autoTradeBalance, riskLevel: 5 },
          auto_trade: true,
          rebalancer_enabled: false,
          rebalancer_config: {}
        })
      });
      if (res.ok) {
        const data = await res.json();
        const botId = data?.bot?.id;
        if (botId) {
          await fetch(`/api/v1/bots/${botId}/start`, { method: 'POST' });
        }
        await fetchBoardBots();
        setAutoTradeOpen(false);
      }
    } finally {
      setAutoTradeCreating(false);
    }
  };

  // Start a Trade logic removed — configured from dashboard

  if (boardLoading && !board) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ color: 'var(--muted)', fontSize: '16px' }}>Loading trading board...</div>
      </div>
    );
  }

  if (!board) return null;

  return (
    <>
    <div style={{ padding: '0 clamp(20px, 3vw, 32px) 40px', maxWidth: '1720px', margin: '0 auto' }}>

      {/* Penny's Trades Update */}
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
              Penny&apos;s Trades Update
            </div>
            <div style={{ fontSize: '17px', lineHeight: 1.6, color: 'var(--text)', fontWeight: 500 }}>
              {(() => {
                const analyzing = trades.filter(t => t.column_name === 'Analyzing');
                const active = trades.filter(t => t.column_name === 'Active');
                const wins = trades.filter(t => (t.column_name === 'Closed' || t.column_name === 'Wins') && Number(t.pnl_dollar) > 0);
                const losses = trades.filter(t => (t.column_name === 'Closed' || t.column_name === 'Losses') && Number(t.pnl_dollar) <= 0);

                const quotes = [
                  { text: 'The stock market is a device for transferring money from the impatient to the patient.', author: 'Warren Buffett' },
                  { text: 'It\'s not about being right or wrong, but about how much money you make when you\'re right.', author: 'George Soros' },
                  { text: 'The goal of a successful trader is to make the best trades. Money is secondary.', author: 'Alexander Elder' },
                  { text: 'Patience is the key to success in trading. Wait for the fat pitch.', author: 'Warren Buffett' },
                  { text: 'In trading, the impossible happens about twice a year.', author: 'Henri M. Simoes' },
                  { text: 'The market can stay irrational longer than you can stay solvent.', author: 'John Maynard Keynes' },
                  { text: 'Risk comes from not knowing what you\'re doing.', author: 'Warren Buffett' },
                  { text: 'Plan your trade and trade your plan.', author: 'Trading Proverb' },
                ];
                const quote = quotes[new Date().getDate() % quotes.length];

                let update = '';
                if (active.length > 0) {
                  const pairs = active.map(t => normalizePair(t.coin_pair).split('/')[0]).join(', ');
                  update = `Currently in ${active.length} active trade${active.length > 1 ? 's' : ''}: ${pairs}. Watching exit signals closely — RSI overbought or hitting our take profit targets. `;
                } else if (analyzing.length > 0) {
                  const pairs = analyzing.map(t => normalizePair(t.coin_pair).split('/')[0]).join(', ');
                  update = `Watching ${analyzing.length} coin${analyzing.length > 1 ? 's' : ''} in the Analyzing zone: ${pairs}. Waiting for RSI to dip below 35 with volume confirmation before entering. No rush — the setup needs to come to us. `;
                } else {
                  update = 'All quiet on the trading front. Scanning the market for setups but nothing meets our entry criteria yet. ';
                }
                if (wins.length > 0 || losses.length > 0) {
                  update += `Record so far: ${wins.length}W / ${losses.length}L. `;
                }

                return (
                  <>
                    {update}
                    <div style={{ marginTop: '10px', fontSize: '14px', fontStyle: 'italic', color: '#4ade80', lineHeight: 1.5 }}>
                      &ldquo;{quote.text}&rdquo; — {quote.author}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard settings status bar */}
      <DashboardStatusBar livePnl={null} />

      {/* Board action bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ color: 'var(--muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
          {board.team_name || 'Personal Board'} · {trades.filter(t => ['Closed','Wins','Losses','Parked'].includes(t.column_name)).length} closed trades · {trades.filter(t => t.column_name === 'Active').length} active
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '999px', background: 'var(--panel-2)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--muted)' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: sseConnected ? '#4ade80' : '#f05b6f', boxShadow: sseConnected ? '0 0 8px rgba(74,222,128,0.7)' : '0 0 8px rgba(240,91,111,0.7)' }} />
            SSE {sseConnected ? 'connected' : 'disconnected'}
          </div>
          {!boardBotsLoading && boardBots.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '999px', background: 'var(--panel-2)', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--muted)' }}>
              {boardBots.slice(0, 3).map((bot) => {
                const status = String(bot.status || 'stopped');
                const color = status === 'running' ? '#4ade80' : status === 'paused' ? '#f5b544' : '#9ca3af';
                return (
                  <span key={bot.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: color, boxShadow: status === 'running' ? '0 0 8px rgba(74,222,128,0.5)' : 'none' }} />
                    {bot.name}
                  </span>
                );
              })}
              {boardBots.length > 3 && (
                <span style={{ color: 'var(--muted)' }}>+{boardBots.length - 3}</span>
              )}
            </div>
          )}
          <button
            onClick={() => setAlertsOpen(true)}
            style={{
              position: 'relative',
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              padding: '8px 12px',
              borderRadius: '999px',
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            aria-label="Open alerts panel"
          >
            🔔 Alerts
            {alertBadgeCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                minWidth: '18px',
                height: '18px',
                borderRadius: '999px',
                background: '#f05b6f',
                color: '#fff',
                fontSize: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 5px',
                boxShadow: '0 0 10px rgba(240,91,111,0.5)'
              }}>
                {alertBadgeCount}
              </span>
            )}
          </button>
          {/* Start a Trade button removed — configure from Dashboard */}
          <button
            onClick={() => setNewTradeOpen(true)}
            style={{ ...primaryBtnStyle, padding: '8px 14px', fontSize: '12px' }}
          >
            + Add to Watchlist
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderRadius: '999px', background: 'var(--panel-2)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--muted)' }}>
            Live prices via SSE · Press ? for shortcuts
          </div>
          <UserMenu />
        </div>
      </div>

      <section
        className="chart-panel"
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '18px',
          padding: chartPair ? '16px' : '0 16px',
          marginBottom: chartPair ? '24px' : '0',
          maxHeight: chartPair ? '520px' : '0px',
          opacity: chartPair ? 1 : 0,
          transform: chartPair ? 'translateY(0)' : 'translateY(-8px)',
          transition: 'max-height 0.4s ease, opacity 0.3s ease, transform 0.35s ease, padding 0.3s ease',
          overflow: 'hidden',
        }}
      >
        {chartPair && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)' }}>Chart Panel</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{selectedPair}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Current: {formatPrice(selectedPrice)}</div>
              </div>
              <button
                onClick={() => setChartPair(null)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '999px', padding: '6px 10px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              {indicatorOptions.map((indicator) => {
                const active = activeIndicators.includes(indicator.key);
                return (
                  <button
                    key={indicator.key}
                    onClick={() => {
                      setActiveIndicators((prev) => (
                        prev.includes(indicator.key)
                          ? prev.filter((item) => item !== indicator.key)
                          : [...prev, indicator.key]
                      ));
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '6px 12px',
                      borderRadius: '999px',
                      border: `1px solid ${active ? '#7b7dff' : 'var(--border)'}`,
                      background: active ? 'rgba(123,125,255,0.16)' : 'var(--panel-2)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    <span>{indicator.label}</span>
                    <span
                      style={{
                        position: 'relative',
                        width: '34px',
                        height: '18px',
                        borderRadius: '999px',
                        background: active ? '#7b7dff' : 'rgba(255,255,255,0.12)',
                        border: `1px solid ${active ? '#7b7dff' : 'var(--border)'}`,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: '2px',
                          left: active ? '18px' : '2px',
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          background: '#0d0d1f',
                          boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                          transition: 'all 0.2s ease',
                        }}
                      />
                    </span>
                  </button>
                );
              })}
              <button
                onClick={() => { const next = !tboEnabled; setTboEnabled(next); localStorage.setItem('clawdesk-tbo-enabled', JSON.stringify(next)); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '6px 12px',
                  borderRadius: '999px',
                  border: `1px solid ${tboEnabled ? '#7b7dff' : 'var(--border)'}`,
                  background: tboEnabled ? 'rgba(123,125,255,0.16)' : 'var(--panel-2)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: tboSignal?.signal === 'open_long' ? '#4ade80' : tboSignal?.signal === 'open_short' || tboSignal?.signal === 'close_long' ? '#f05b6f' : '#888', boxShadow: tboEnabled ? `0 0 6px ${tboSignal?.signal === 'open_long' ? '#4ade80' : '#888'}` : 'none' }} />
                <span>TBO PRO</span>
                <span
                  style={{
                    position: 'relative',
                    width: '34px',
                    height: '18px',
                    borderRadius: '999px',
                    background: tboEnabled ? '#7b7dff' : 'rgba(255,255,255,0.12)',
                    border: `1px solid ${tboEnabled ? '#7b7dff' : 'var(--border)'}`,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: tboEnabled ? '18px' : '2px',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: '#0d0d1f',
                      boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                      transition: 'all 0.2s ease',
                    }}
                  />
                </span>
              </button>
            </div>
            <TradingChart pair={chartPair} boardId={Number(boardId)} indicators={effectiveIndicators} tboSignals={tboEnabled ? tboSignal : null} />

            {/* TBO PRO Signal Panel */}
            {tboEnabled && chartPair && (() => {
              const sig = tboSignal;
              const symbol = chartPair.replace(/[/-]/g, '').toUpperCase();
              const pairLabel = chartPair.replace('USDT', '/USDT');
              const fmt = (v: number | null | undefined) => v != null ? `$${v.toLocaleString()}` : '—';
              const signalLabel = sig?.signal === 'open_long' ? 'BUY' : sig?.signal === 'open_short' || sig?.signal === 'close_long' ? 'SELL' : 'NEUTRAL';
              const signalColor = sig?.signal === 'open_long' ? '#4ade80' : sig?.signal === 'open_short' || sig?.signal === 'close_long' ? '#f05b6f' : '#888';
              const strengthColor = (sig?.strength ?? 0) > 60 ? '#4ade80' : (sig?.strength ?? 0) >= 40 ? '#eab308' : '#f05b6f';
              const trendArrow = (t: string | undefined) => t === 'bullish' ? <span style={{ color: '#4ade80' }}>▲</span> : <span style={{ color: '#f05b6f' }}>▼</span>;

              if (tboLoading && !sig) return (
                <div style={{ background: 'rgba(123,125,255,0.08)', border: '1px solid rgba(123,125,255,0.25)', borderRadius: 12, padding: '20px', marginTop: 12, textAlign: 'center', animation: 'pulse 2s infinite' }}>
                  <span style={{ color: '#7b7dff' }}>Waiting for signal...</span>
                </div>
              );

              if (!sig || (sig.strength === 0 && !sig.indicators)) return (
                <div style={{ background: 'rgba(123,125,255,0.08)', border: '1px solid rgba(123,125,255,0.25)', borderRadius: 12, padding: '16px 20px', marginTop: 12, color: '#888', fontSize: 13 }}>
                  TBO PRO not available for this pair
                </div>
              );

              return (
                <div style={{ background: 'rgba(123,125,255,0.08)', border: '1px solid rgba(123,125,255,0.25)', borderRadius: 12, padding: '16px 20px', marginTop: 12, animation: 'fadeIn 0.3s ease' }}>
                  <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } } @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#7b7dff' }}>TBO PRO</span>
                    <span style={{ fontSize: 12, color: '#888' }}>·</span>
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{pairLabel}</span>
                    <span style={{ marginLeft: 'auto', padding: '4px 14px', borderRadius: 999, background: signalColor, color: '#000', fontWeight: 700, fontSize: 13 }}>{signalLabel}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: '#888' }}>Strength:</span>
                    <div style={{ flex: 1, maxWidth: 160, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <div style={{ width: `${sig.strength}%`, height: '100%', borderRadius: 4, background: strengthColor, transition: 'width 0.5s ease' }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: strengthColor }}>{sig.strength}%</span>
                  </div>
                  {sig.trend && (
                    <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 12 }}>
                      <span style={{ color: '#888' }}>Trends:</span>
                      <span>Fast {trendArrow(sig.trend.fast)}</span>
                      <span>Mid {trendArrow(sig.trend.mid)}</span>
                      <span>Slow {trendArrow(sig.trend.slow)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 8, fontSize: 12 }}>
                    <span><span style={{ color: '#888' }}>TP: </span><span style={{ color: '#4ade80' }}>{fmt(sig.tp)}</span></span>
                    <span><span style={{ color: '#888' }}>SL: </span><span style={{ color: '#f05b6f' }}>{fmt(sig.sl)}</span></span>
                    <span><span style={{ color: '#888' }}>Support: </span>{fmt(sig.support)}</span>
                    <span><span style={{ color: '#888' }}>Resistance: </span>{fmt(sig.resistance)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#888' }}>
                    <span>⚡ Squeeze: <span style={{ color: sig.squeeze ? '#4ade80' : '#555', fontWeight: 600 }}>{sig.squeeze ? 'Yes' : 'No'}</span></span>
                    <span>📊 Vol Spike: <span style={{ color: sig.volumeSpike ? '#4ade80' : '#555', fontWeight: 600 }}>{sig.volumeSpike ? 'Yes' : 'No'}</span></span>
                    {sig.indicators && <>
                      <span>RSI: <span style={{ color: 'var(--text)' }}>{sig.indicators.rsi14}</span></span>
                      <span>EMA20: <span style={{ color: 'var(--text)' }}>{fmt(sig.indicators.ema20)}</span></span>
                      <span>SMA50: <span style={{ color: 'var(--text)' }}>{fmt(sig.indicators.sma50)}</span></span>
                    </>}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </section>

      <div style={{ display: 'flex', gap: '16px', alignItems: 'start', paddingBottom: '16px' }}>
        {/* Collapsible Watchlist Sidebar */}
        {!watchlistSidebarOpen ? (
          <div
            onClick={() => setWatchlistSidebarOpen(true)}
            style={{
              flexShrink: 0,
              width: '44px',
              minHeight: '60vh',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '16px 0',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              transition: 'all 0.3s ease',
            }}
          >
            <span style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              transition: 'color 0.3s ease',
            }}>
              WATCHLIST
            </span>
            <span style={{
              background: 'var(--panel-3)',
              border: '1px solid var(--border)',
              borderRadius: '999px',
              padding: '3px 7px',
              fontSize: '11px',
              color: 'var(--text)',
              fontWeight: 600,
            }}>
              {trades.filter(t => t.column_name === 'Watchlist').length}
            </span>
          </div>
        ) : (
        <div style={{ flex: '0 0 260px', transition: 'flex 0.2s ease', minHeight: '420px' }}>
          <button
            onClick={() => setWatchlistSidebarOpen(false)}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '18px 18px 0 0',
              padding: '10px 14px',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              color: '#6f7db8',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            <span style={{ transform: 'rotate(90deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
            ⭐ Watchlist <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 400 }}>{trades.filter(t => t.column_name === 'Watchlist').length}</span>
          </button>
          {watchlistSidebarOpen && (
            <div
              onDragOver={(e) => handleDragOver(e, 'Watchlist')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'Watchlist')}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderTop: 'none',
                borderRadius: '0 0 18px 18px',
                padding: '14px',
                minHeight: '360px',
                overflowY: 'auto',
                maxHeight: '70vh',
              }}
            >
              {(() => {
                const colTrades = trades.filter(t => t.column_name === 'Watchlist');
                return colTrades.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '6px 4px', textAlign: 'center' }}>
                    No coins on watchlist yet. Click &apos;Add to Watchlist&apos; to add one.
                  </div>
                ) : colTrades.map((trade) => {
                  const pair = normalizePair(trade.coin_pair);
                  const live = priceMap[pair];
                  const signal = signalBadge(trade.tbo_signal);
                  return (
                    <div
                      key={trade.id}
                      draggable
                      onDragStart={() => handleDragStart(trade.id)}
                      onClick={() => setChartPair(toApiPair(pair))}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '12px',
                        background: 'rgba(20, 20, 40, 0.6)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        cursor: 'pointer',
                        marginBottom: '8px',
                        transition: 'border-color 0.2s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ fontWeight: 700, fontSize: '13px' }}>{pair}</div>
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); setActionMenu({ trade, x: event.clientX, y: event.clientY }); }}
                          style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}
                        >⋯</button>
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
                        {live ? `$${formatPrice(live.price)}` : '—'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                        {live && (
                          <span style={{ color: live.change24h >= 0 ? '#4ade80' : '#f05b6f', fontWeight: 600 }}>
                            {live.change24h >= 0 ? '+' : ''}{live.change24h.toFixed(2)}%
                          </span>
                        )}
                        <span style={{ padding: '1px 6px', borderRadius: '999px', background: signal.bg, color: signal.color, fontSize: '10px', fontWeight: 600 }}>
                          {signal.label}
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
        )}

        {/* Main Kanban Columns (excluding Watchlist) */}
        <div className="trading-columns" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(200px, 1fr))', gap: '16px', alignItems: 'start', overflowX: 'auto' }}>
        {columns.filter(col => col.name !== 'Watchlist').map((col) => {
          let colTrades = trades.filter(t => t.column_name === col.name)
            .sort((a, b) => {
              const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
              const pa = priorityOrder[a.priority || 'medium'] ?? 1;
              const pb = priorityOrder[b.priority || 'medium'] ?? 1;
              if (pa !== pb) return pa - pb;
              return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
            });
          // Closed column: also include legacy Wins/Losses, show last 10 only
          if (col.name === 'Closed') {
            colTrades = trades.filter(t => t.column_name === 'Closed' || t.column_name === 'Wins' || t.column_name === 'Losses')
              .sort((a, b) => {
                // High priority (core coins) always first
                const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
                const pa = priorityOrder[a.priority || 'medium'] ?? 1;
                const pb = priorityOrder[b.priority || 'medium'] ?? 1;
                if (pa !== pb) return pa - pb;
                return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
              })
              .slice(0, 10);
          }
          const totals = columnTotals[col.name] || { count: 0, pnl: 0 };
          const pnlColor = totals.pnl >= 0 ? '#4ade80' : '#f05b6f';

          return (
            <section
              key={col.name}
              onDragOver={(e) => handleDragOver(e, col.name)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.name)}
              style={{
                background: 'var(--panel)',
                border: `1px solid ${dragOverCol === col.name ? col.color : 'var(--border)'}`,
                borderRadius: '18px',
                padding: '14px',
                minHeight: '420px',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                boxShadow: dragOverCol === col.name ? `0 0 0 1px ${col.color}, 0 10px 30px rgba(0,0,0,0.35)` : 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: col.color }}>{col.name}</div>
                  <div style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                    {totals.count}
                  </div>
                </div>
                {col.name === 'Active' && totals.pnl !== 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)' }}>P&amp;L</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: pnlColor }}>{formatCurrency(totals.pnl)}</div>
                </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {tradesLoading ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <div
                      key={`skeleton-${col.name}-${idx}`}
                      style={{
                        height: '140px',
                        borderRadius: '14px',
                        background: 'linear-gradient(120deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04))',
                        border: '1px solid var(--border)',
                        animation: 'pulse 1.4s ease-in-out infinite',
                      }}
                    />
                  ))
                ) : (
                  <>
                    {colTrades.map((trade) => {
                      const pair = normalizePair(trade.coin_pair);
                      const livePrice = priceMap[pair]?.price ?? toNumber(trade.current_price);
                      const pnl = computePnl(trade, livePrice);
                      const pnlDollar = toNumber(trade.pnl_dollar) ?? pnl?.pnlDollar ?? null;
                      const pnlPercent = toNumber(trade.pnl_percent) ?? pnl?.pnlPercent ?? null;
                      const pnlTone = pnlDollar !== null && pnlDollar < 0 ? '#f05b6f' : '#4ade80';
                      const signal = signalBadge(trade.tbo_signal);
                      const confidence = toNumber(trade.confidence_score);
                      const confidenceTone = confidenceColor(confidence);
                      const sentiment = deriveSentiment(trade);
                      const isExpanded = expandedCards[trade.id] ?? false;

                      return (
                        <article
                          key={trade.id}
                          draggable
                          onDragStart={() => handleDragStart(trade.id)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setActionMenu({ trade, x: event.clientX, y: event.clientY });
                          }}
                          className="trade-card"
                          style={{
                            background: 'var(--panel-2)',
                            border: '1px solid var(--border)',
                            borderLeft: col.name === 'Closed' ? `3px solid ${(toNumber(trade.pnl_dollar) ?? 0) >= 0 ? '#4ade80' : '#f05b6f'}` : undefined,
                            borderRadius: '14px',
                            padding: '8px 10px',
                            cursor: 'pointer',
                            boxShadow: '0 10px 20px rgba(0,0,0,0.18)',
                            transition: 'transform 0.2s ease, border-color 0.2s ease',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = col.color; }}
                          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                        >
                          {/* Row 1: Pair + Sentiment badge + actions */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); setChartPair(toApiPair(pair)); }}
                                style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.02em', background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}
                                title="Open chart"
                              >
                                {pair}
                              </button>
                              {col.name === 'Closed' && String(trade.notes || '').toLowerCase().includes('parked') && (
                                <span title="Previously parked" style={{ fontSize: '11px' }}>📦</span>
                              )}
                              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '999px', background: String(trade.direction || '').toLowerCase() === 'short' ? 'rgba(240,91,111,0.15)' : 'rgba(74,222,128,0.15)', color: String(trade.direction || '').toLowerCase() === 'short' ? '#f05b6f' : '#4ade80', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {String(trade.direction || '').toLowerCase() === 'short' ? '↓ Short' : '↑ Long'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); setExpandedCards(prev => ({ ...prev, [trade.id]: !prev[trade.id] })); }}
                                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '10px', padding: '2px 3px', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                aria-label="Expand card"
                              >▼</button>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); setActionMenu({ trade, x: event.clientX, y: event.clientY }); }}
                                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: '6px', padding: '1px 5px', cursor: 'pointer', fontSize: '11px' }}
                                aria-label="Quick actions"
                              >⋯</button>
                            </div>
                          </div>

                          {/* Row 2: Price + context */}
                          {(trade.column_name === 'Watchlist' || trade.column_name === 'Analyzing') ? (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <div
                                  key={priceFlashMap[pair]?.token ?? 0}
                                  style={{
                                    fontSize: '13px', fontWeight: 600,
                                    animation: priceFlashMap[pair]?.direction === 'up' ? 'priceUp 0.6s ease' : priceFlashMap[pair]?.direction === 'down' ? 'priceDown 0.6s ease' : undefined,
                                  }}
                                >
                                  {priceMap[pair] ? formatPrice(livePrice) : <span style={{ color: 'var(--muted)', fontSize: '11px' }}>No price data</span>}
                                </div>
                                {priceMap[pair] ? (
                                  <div style={{ fontSize: '12px', fontWeight: 700, color: (priceMap[pair]?.change24h ?? 0) >= 0 ? '#4ade80' : '#f05b6f' }}>
                                    {(priceMap[pair]?.change24h ?? 0) >= 0 ? '+' : ''}{(priceMap[pair]?.change24h ?? 0).toFixed(2)}%
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>—</div>
                                )}
                              </div>
                              {priceMap[pair] && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted)', marginBottom: '2px' }}>
                                  <span>Vol {formatCompactNumber(priceMap[pair]?.volume24h)}</span>
                                  <span>H {priceMap[pair]?.high24h ? formatPrice(priceMap[pair].high24h!) : '—'}</span>
                                  <span>L {priceMap[pair]?.low24h ? formatPrice(priceMap[pair].low24h!) : '—'}</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <div
                                  key={priceFlashMap[pair]?.token ?? 0}
                                  style={{
                                    fontSize: '13px', fontWeight: 600,
                                    animation: priceFlashMap[pair]?.direction === 'up' ? 'priceUp 0.6s ease' : priceFlashMap[pair]?.direction === 'down' ? 'priceDown 0.6s ease' : undefined,
                                  }}
                                >
                                  {formatPrice(livePrice)}
                                </div>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: pnlTone }}>
                                  {formatPercent(pnlPercent)}
                                </div>
                              </div>
                              {(col.name === 'Active' || col.name === 'Analyzing') && (toNumber(trade.stop_loss) || toNumber(trade.take_profit)) && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted)', marginBottom: '2px' }}>
                                  {toNumber(trade.stop_loss) ? <span style={{ color: '#f05b6f' }}>SL {formatPrice(toNumber(trade.stop_loss))}</span> : <span />}
                                  {toNumber(trade.take_profit) ? <span style={{ color: '#4ade80' }}>TP {formatPrice(toNumber(trade.take_profit))}</span> : <span />}
                                </div>
                              )}
                            </>
                          )}

                          {/* Confidence bar */}
                          <div style={{ height: '3px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, confidence ?? 0))}%`, background: confidenceTone, borderRadius: '999px', transition: 'width 0.3s' }} />
                          </div>

                          {/* Expanded details */}
                          {isExpanded && (() => {
                            const meta = typeof trade.metadata === 'string' ? (() => { try { return JSON.parse(trade.metadata || '{}'); } catch { return {}; } })() : (trade.metadata || {});
                            const strategyName = meta.strategy || meta.entry_reason || null;
                            const strategyLabels: Record<string, string> = {
                              oversold_bounce: '📈 Oversold Bounce', golden_cross: '✨ Golden Cross', deeply_oversold: '🔻 Deeply Oversold',
                              momentum_catch: '🚀 Momentum Catch', overbought_reject: '📉 Overbought Reject', death_cross: '💀 Death Cross',
                              bearish_breakdown: '🐻 Bearish Breakdown', buy_hold_core: '💎 Buy & Hold Core', bollinger_bounce: '🎯 Bollinger Bounce',
                              range_breakout: '💥 Range Breakout', vwap_reversion: '📊 VWAP Reversion', trend_surfer: '🏄 Trend Surfer',
                              correlation_hedge: '🛡️ Correlation Hedge', qfl_bounce: '🏗️ QFL Bounce', trend_reversal_flip: '🔄 Trend Reversal Flip',
                            };
                            const trailingStage = meta.trailingStopStage ?? 0;
                            const trailingPrice = meta.trailingStopPrice ?? null;
                            const stageLabels = ['No trailing stop', '🟢 Stage 1 — Breakeven', '🟡 Stage 2 — Trailing 1× ATR', '🟠 Stage 3 — Tight trail 0.75× ATR'];
                            const stageColors = ['var(--muted)', '#4ade80', '#facc15', '#fb923c'];
                            const entryPrice = toNumber(trade.entry_price);
                            const slPrice = toNumber(trade.stop_loss);
                            const tpPrice = toNumber(trade.take_profit);
                            const slPct = entryPrice && slPrice ? Math.abs((slPrice - entryPrice) / entryPrice * 100) : null;
                            const tpPct = entryPrice && tpPrice ? Math.abs((tpPrice - entryPrice) / entryPrice * 100) : null;
                            // Visual SL/TP range bar
                            const rangeMin = slPrice && tpPrice ? Math.min(slPrice, tpPrice) : 0;
                            const rangeMax = slPrice && tpPrice ? Math.max(slPrice, tpPrice) : 0;
                            const rangeSpan = rangeMax - rangeMin;
                            const pricePos = rangeSpan > 0 && livePrice ? Math.max(0, Math.min(100, ((livePrice - rangeMin) / rangeSpan) * 100)) : 50;
                            const entryPos = rangeSpan > 0 && entryPrice ? Math.max(0, Math.min(100, ((entryPrice - rangeMin) / rangeSpan) * 100)) : 50;
                            const trailingPos = rangeSpan > 0 && trailingPrice ? Math.max(0, Math.min(100, ((trailingPrice - rangeMin) / rangeSpan) * 100)) : null;
                            const isShort = (trade.direction || '').toUpperCase() === 'SHORT';

                            return (
                            <div style={{ marginTop: '10px' }}>
                              {/* Strategy Badge */}
                              {strategyName && (
                                <div style={{ marginBottom: '8px', padding: '4px 8px', borderRadius: '8px', background: 'rgba(123,125,255,0.15)', border: '1px solid rgba(123,125,255,0.3)', fontSize: '11px', fontWeight: 600, color: '#a5a6ff' }}>
                                  {strategyLabels[strategyName] || `🤖 ${strategyName}`}
                                </div>
                              )}

                              {/* Expanded content differs for Watchlist/Analyzing vs Active */}
                              {(trade.column_name === 'Watchlist' || trade.column_name === 'Analyzing') ? (
                                <>
                                  {/* Full price details for watchlist/analyzing */}
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', marginBottom: '10px' }}>
                                    <div>
                                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>24h Volume</div>
                                      <div style={{ fontSize: '12px' }}>{formatCompactNumber(priceMap[pair]?.volume24h)}</div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>24h Change</div>
                                      <div style={{ fontSize: '12px', color: (priceMap[pair]?.change24h ?? 0) >= 0 ? '#4ade80' : '#f05b6f' }}>
                                        {priceMap[pair] ? `${(priceMap[pair]?.change24h ?? 0) >= 0 ? '+' : ''}${(priceMap[pair]?.change24h ?? 0).toFixed(2)}%` : '—'}
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>24h High</div>
                                      <div style={{ fontSize: '12px' }}>{priceMap[pair]?.high24h ? formatPrice(priceMap[pair].high24h!) : '—'}</div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>24h Low</div>
                                      <div style={{ fontSize: '12px' }}>{priceMap[pair]?.low24h ? formatPrice(priceMap[pair].low24h!) : '—'}</div>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  {/* Price + P&L */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                                    <div>
                                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Current</div>
                                      <div style={{ fontSize: '15px', fontWeight: 600 }}>{formatPrice(livePrice)}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>P&L</div>
                                      <div style={{ fontSize: '14px', fontWeight: 700, color: pnlTone }}>{formatCurrency(pnlDollar)}</div>
                                      <div style={{ fontSize: '11px', color: pnlTone }}>{formatPercent(pnlPercent)}</div>
                                    </div>
                                  </div>

                                  {/* Visual SL — Price — TP Range Bar */}
                                  {slPrice && tpPrice && (col.name === 'Active') && (
                                    <div style={{ marginBottom: '10px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--muted)', marginBottom: '2px' }}>
                                        <span style={{ color: isShort ? '#4ade80' : '#f05b6f' }}>{isShort ? 'TP' : 'SL'} {formatPrice(Math.min(slPrice, tpPrice))}</span>
                                        <span style={{ color: isShort ? '#f05b6f' : '#4ade80' }}>{isShort ? 'SL' : 'TP'} {formatPrice(Math.max(slPrice, tpPrice))}</span>
                                      </div>
                                      <div style={{ position: 'relative', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', overflow: 'visible' }}>
                                        <div style={{ position: 'absolute', left: isShort ? `${Math.max(slPrice, tpPrice) === rangeMax ? 100 - ((rangeMax - Math.max(slPrice, tpPrice)) / rangeSpan * 100) : 0}%` : '0%', width: isShort ? undefined : `${entryPos}%`, right: isShort ? '0%' : undefined, height: '100%', borderRadius: '4px 0 0 4px', background: 'rgba(240,91,111,0.2)' }} />
                                        <div style={{ position: 'absolute', left: isShort ? '0%' : `${entryPos}%`, right: isShort ? `${100 - entryPos}%` : '0%', height: '100%', borderRadius: '0 4px 4px 0', background: 'rgba(74,222,128,0.2)' }} />
                                        <div style={{ position: 'absolute', left: `${entryPos}%`, top: '-2px', width: '2px', height: '12px', background: 'var(--muted)', borderRadius: '1px', transform: 'translateX(-1px)' }} title={`Entry: ${formatPrice(entryPrice)}`} />
                                        <div style={{ position: 'absolute', left: `${pricePos}%`, top: '-3px', width: '6px', height: '14px', background: pnlTone, borderRadius: '3px', transform: 'translateX(-3px)', boxShadow: `0 0 6px ${pnlTone}80`, transition: 'left 0.5s ease' }} title={`Now: ${formatPrice(livePrice)}`} />
                                        {trailingPos !== null && trailingStage > 0 && (
                                          <div style={{ position: 'absolute', left: `${trailingPos}%`, top: '-2px', width: '0', height: '0', borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `6px solid ${stageColors[trailingStage] || '#facc15'}`, transform: 'translateX(-4px)' }} title={`Trailing SL: ${formatPrice(trailingPrice)}`} />
                                        )}
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginTop: '2px' }}>
                                        <span style={{ color: '#f05b6f' }}>-{slPct?.toFixed(1)}%</span>
                                        <span style={{ fontSize: '8px', color: 'var(--muted)' }}>▲ entry</span>
                                        <span style={{ color: '#4ade80' }}>+{tpPct?.toFixed(1)}%</span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Trailing Stop Status */}
                                  {col.name === 'Active' && (
                                    <div style={{ marginBottom: '8px', padding: '4px 8px', borderRadius: '6px', background: trailingStage > 0 ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${trailingStage > 0 ? stageColors[trailingStage] + '33' : 'transparent'}`, fontSize: '10px' }}>
                                      <div style={{ color: stageColors[trailingStage] || 'var(--muted)', fontWeight: 600, marginBottom: trailingStage > 0 ? '2px' : '0' }}>
                                        {stageLabels[trailingStage] || stageLabels[0]}
                                      </div>
                                      {trailingStage > 0 && trailingPrice && (
                                        <div style={{ color: 'var(--muted)' }}>
                                          Trailing SL @ {formatPrice(trailingPrice)}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Grid: Entry, Size, SL, TP */}
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', marginBottom: '10px' }}>
                                    <div>
                                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Entry</div>
                                      <div style={{ fontSize: '12px' }}>{formatPrice(entryPrice)}</div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Size</div>
                                      <div style={{ fontSize: '12px' }}>${toNumber(trade.position_size)?.toFixed(0) ?? '—'}</div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Stop Loss</div>
                                      <div style={{ fontSize: '12px', color: '#f05b6f' }}>{formatPrice(slPrice)} <span style={{ fontSize: '9px' }}>({slPct?.toFixed(1)}%)</span></div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Take Profit</div>
                                      <div style={{ fontSize: '12px', color: '#4ade80' }}>{formatPrice(tpPrice)} <span style={{ fontSize: '9px' }}>({tpPct?.toFixed(1)}%)</span></div>
                                    </div>
                                  </div>
                                </>
                              )}

                              {/* Why — Entry Reason */}
                              {meta.description && (
                                <div style={{ marginBottom: '8px', padding: '6px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', borderLeft: '3px solid rgba(123,125,255,0.5)' }}>
                                  <div style={{ fontSize: '9px', color: 'var(--muted)', marginBottom: '2px', fontWeight: 600 }}>WHY THIS TRADE</div>
                                  <div style={{ fontSize: '11px', color: 'var(--text)', lineHeight: '1.4' }}>{meta.description}</div>
                                </div>
                              )}

                              {/* Indicators at entry */}
                              {(meta.atr || meta.slPercent) && (
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                  {meta.atr && <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', color: 'var(--muted)' }}>ATR: {typeof meta.atr === 'number' ? meta.atr.toFixed(meta.atr > 10 ? 2 : 6) : meta.atr}</span>}
                                  {meta.slPercent && <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '999px', background: 'rgba(240,91,111,0.15)', color: '#f05b6f' }}>SL: {meta.slPercent}%</span>}
                                  {meta.tpPercent && <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '999px', background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>TP: {meta.tpPercent}%</span>}
                                  {meta.fees?.entryFee && <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', color: 'var(--muted)' }}>Fee: ${meta.fees.entryFee.toFixed(2)}</span>}
                                </div>
                              )}

                              {/* Signal + Confidence + RSI */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                <div style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: signal.bg, color: signal.color, border: `1px solid ${signal.color}44`, fontWeight: 600 }}>
                                  {signal.label}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '4px' }}>Confidence</div>
                                  <div style={{ height: '6px', borderRadius: '999px', background: 'var(--panel-3)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, confidence ?? 0))}%`, background: confidenceTone }} />
                                  </div>
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--muted)', minWidth: '38px', textAlign: 'right' }}>RSI {toNumber(trade.rsi_value) ?? '—'}</div>
                              </div>

                              {/* Execution timestamp */}
                              {meta.execution?.signalTime && (
                                <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '6px' }}>
                                  Entered: {new Date(meta.execution.signalTime).toLocaleString()}
                                </div>
                              )}

                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px', color: 'var(--muted)', fontSize: '12px' }}>
                                <span style={{ cursor: 'grab' }}>⠿</span>
                              </div>
                            </div>
                            );
                          })()}
                        </article>
                      );
                    })}
                    {colTrades.length === 0 && (
                      <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '6px 4px', textAlign: 'center' }}>
                        No trades here yet. Drag a card or click &apos;Add Trade&apos;
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          );
        })}
        </div>
      </div>

      {actionMenu && (
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            position: 'fixed',
            left: actionMenu.x,
            top: actionMenu.y,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '10px',
            zIndex: 80,
            minWidth: '180px',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--muted)', marginBottom: '8px' }}>Move to</div>
          <div style={{ display: 'grid', gap: '6px', marginBottom: '10px' }}>
            {columns.map((col) => (
              <button
                key={`move-${col.name}`}
                type="button"
                onClick={() => {
                  moveTradeTo(actionMenu.trade.id, col.name);
                  setActionMenu(null);
                }}
                style={{ ...secondaryBtnStyle, fontSize: '11px', padding: '6px 10px', textAlign: 'left' }}
              >
                {col.name}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: '6px' }}>
            {['Watchlist', 'Analyzing'].includes(actionMenu.trade.column_name) && (
              <button
                type="button"
                onClick={() => {
                  enterTradeQuick(actionMenu.trade);
                  setActionMenu(null);
                }}
                style={{ ...primaryBtnStyle, fontSize: '11px', padding: '6px 10px' }}
              >
                Enter Trade
              </button>
            )}
            {actionMenu.trade.column_name === 'Active' && (
              <button
                type="button"
                onClick={() => {
                  exitTradeQuick(actionMenu.trade);
                  setActionMenu(null);
                }}
                style={{ ...secondaryBtnStyle, fontSize: '11px', padding: '6px 10px' }}
              >
                Exit Trade
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                deleteTradeQuick(actionMenu.trade);
                setActionMenu(null);
              }}
              style={{ ...secondaryBtnStyle, fontSize: '11px', padding: '6px 10px', color: '#f05b6f', borderColor: 'rgba(240,91,111,0.5)' }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <AlertsPanel
        boardId={Number(boardId)}
        trades={trades}
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        onCountChange={(count) => setAlertBadgeCount(count)}
      />

      {editingTrade && (
        <TradeDetailModal
          trade={editingTrade}
          boardId={Number(boardId)}
          livePrice={priceMap[normalizePair(editingTrade.coin_pair)]?.price ?? null}
          onClose={() => setEditingTrade(null)}
          onSaved={() => { setEditingTrade(null); fetchTrades(); }}
        />
      )}

      {exitPrompt && (
        <ExitPromptModal
          trade={exitPrompt.trade}
          onClose={() => setExitPrompt(null)}
          onConfirm={async (exitPrice) => {
            try {
              const res = await fetch(`/api/v1/trades/${exitPrompt.trade.id}/exit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exit_price: exitPrice }),
              });
              if (res.ok) {
                const data = await res.json();
                const updated = data.trade;
                setTrades(prev => prev.map(t => t.id === updated.id ? updated : t));
              } else {
                fetchTrades();
              }
            } catch {
              fetchTrades();
            }
            setExitPrompt(null);
          }}
        />
      )}

      {autoTradeOpen && (
        <div
          onClick={(event) => { if (event.target === event.currentTarget) setAutoTradeOpen(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,15,0.78)', display: 'grid', placeItems: 'center', zIndex: 90 }}
        >
          <div style={{ width: 'min(640px, 92vw)', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '18px', padding: '20px', boxShadow: 'var(--shadow)', display: 'grid', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>Auto-Trade Quick Setup</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Pick a strategy, set balance, launch a bot.</div>
              </div>
              <button onClick={() => setAutoTradeOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '18px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
                Strategy style
                <select value={autoTradeStyle} onChange={(event) => setAutoTradeStyle(event.target.value)} style={inputStyle}>
                  {Object.keys(BOT_STYLE_MAP).map((style) => (
                    <option key={style} value={style}>{style}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
                Sub-style
                <select value={autoTradeSubstyle} onChange={(event) => setAutoTradeSubstyle(event.target.value)} style={inputStyle}>
                  {Object.keys(BOT_STYLE_MAP[autoTradeStyle]?.substyles ?? {}).map((sub) => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ background: 'rgba(123,125,255,0.12)', border: '1px solid rgba(123,125,255,0.3)', borderRadius: '12px', padding: '12px', fontSize: '12px', color: 'var(--text)' }}>
              {BOT_STYLE_MAP[autoTradeStyle]?.substyles?.[autoTradeSubstyle]}
            </div>
            <label style={{ display: 'grid', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
              Starting balance
              <input type="number" min={0} value={autoTradeBalance} onChange={(event) => setAutoTradeBalance(Number(event.target.value))} style={inputStyle} />
            </label>
            <button
              onClick={handleAutoTradeCreate}
              style={{ ...primaryBtnStyle, opacity: autoTradeCreating ? 0.7 : 1 }}
              disabled={autoTradeCreating}
            >
              {autoTradeCreating ? 'Launching...' : 'Start Bot'}
            </button>
          </div>
        </div>
      )}

      {/* StartTradeModal removed — trades configured from dashboard */}

      {newTradeOpen && (
        <NewTradeModal
          boardId={Number(boardId)}
          onClose={() => setNewTradeOpen(false)}
          onCreated={(trade) => {
            setTrades((prev) => [trade, ...prev]);
            setNewTradeOpen(false);
            pushToast(`Trade added: ${normalizePair(trade.coin_pair)}`, 'success');
            fetchStats();
          }}
        />
      )}

      {showShortcuts && (
        <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />
      )}

      {/* Toasts hidden — too noisy for board view */}

      <style jsx global>{`
        @keyframes floatIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes priceUp {
          0% { background: rgba(74, 222, 128, 0.0); }
          40% { background: rgba(74, 222, 128, 0.3); }
          100% { background: rgba(74, 222, 128, 0.0); }
        }
        @keyframes priceDown {
          0% { background: rgba(240, 91, 111, 0.0); }
          40% { background: rgba(240, 91, 111, 0.3); }
          100% { background: rgba(240, 91, 111, 0.0); }
        }
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(123,125,255,0.25); }
          50% { box-shadow: 0 0 35px rgba(123,125,255,0.5); }
        }
        select option {
          background: #1a1a2e;
          color: #eef0ff;
        }
        @media (max-width: 768px) {
          .trading-columns {
            grid-template-columns: repeat(1, minmax(0, 1fr)) !important;
          }
          .trade-card {
            padding: 10px !important;
          }
          .stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .chart-panel {
            max-height: 320px !important;
          }
          .chart-panel .tv-chart-container {
            height: 250px !important;
          }
        }
      `}</style>
    </div>
    </>
  );
}

function ExitPromptModal({ trade, onClose, onConfirm }: { trade: Trade; onClose: () => void; onConfirm: (exitPrice: number) => void; }) {
  const [exitPrice, setExitPrice] = useState('');

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(5, 5, 15, 0.7)',
        display: 'grid', placeItems: 'center', padding: '20px', zIndex: 60,
      }}
    >
      <div style={{
        width: 'min(420px, 100%)', background: 'var(--panel)',
        border: '1px solid var(--border)', borderRadius: '18px',
        padding: '22px', boxShadow: 'var(--shadow)',
        animation: 'floatIn 0.3s ease',
      }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>Exit {normalizePair(trade.coin_pair)}</h2>
        <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '12px' }}>Provide an exit price to close the trade.</p>
        <input
          value={exitPrice}
          onChange={e => setExitPrice(e.target.value)}
          placeholder="Exit price"
          style={inputStyle}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          <button type="button" onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
          <button
            type="button"
            onClick={() => {
              const parsed = parseFloat(exitPrice);
              if (Number.isFinite(parsed)) onConfirm(parsed);
            }}
            style={primaryBtnStyle}
          >
            Exit Trade
          </button>
        </div>
      </div>
    </div>
  );
}

function TradeDetailModal({ trade, boardId, livePrice, onClose, onSaved }: { trade: Trade; boardId: number; livePrice: number | null; onClose: () => void; onSaved: () => void; }) {
  const [entryPrice, setEntryPrice] = useState(String(trade.entry_price ?? ''));
  const [stopLoss, setStopLoss] = useState(String(trade.stop_loss ?? ''));
  const [takeProfit, setTakeProfit] = useState(String(trade.take_profit ?? ''));
  const [positionSize, setPositionSize] = useState(String(trade.position_size ?? ''));
  const [direction, setDirection] = useState(String(trade.direction || 'long').toLowerCase());
  const [notes, setNotes] = useState(String(trade.notes ?? ''));
  const tradeSettings = (trade.trade_settings ?? {}) as Record<string, unknown>;
  const [entryZoneLow, setEntryZoneLow] = useState(String(tradeSettings.entry_zone_low ?? ''));
  const [entryZoneHigh, setEntryZoneHigh] = useState(String(tradeSettings.entry_zone_high ?? ''));
  const [settingsStopLoss, setSettingsStopLoss] = useState(String(tradeSettings.stop_loss ?? trade.stop_loss ?? ''));
  const [takeProfit1, setTakeProfit1] = useState(String(tradeSettings.take_profit_1 ?? trade.take_profit ?? ''));
  const [takeProfit2, setTakeProfit2] = useState(String(tradeSettings.take_profit_2 ?? ''));
  const [takeProfit3, setTakeProfit3] = useState(String(tradeSettings.take_profit_3 ?? ''));
  const [positionSizePct, setPositionSizePct] = useState(String(tradeSettings.position_size_pct ?? ''));
  const [tradeSettingsOpen, setTradeSettingsOpen] = useState(true);
  const [exitPrice, setExitPrice] = useState('');
  const [pauseReason, setPauseReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'journal'>('details');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalLoading, setJournalLoading] = useState(true);
  const [entryType, setEntryType] = useState('note');
  const [entryContent, setEntryContent] = useState('');
  const [entryMood, setEntryMood] = useState('');
  const [entrySaving, setEntrySaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/v1/trades/${trade.id}/activity`);
        if (res.ok) {
          const data = await res.json();
          setActivity(data.activity || []);
        }
      } catch {}
      try {
        const res = await fetch(`/api/v1/trades/${trade.id}/comments`);
        if (res.ok) {
          const data = await res.json();
          setComments(data.comments || []);
        }
      } catch {}
      try {
        const res = await fetch(`/api/v1/trades/${trade.id}/journal`);
        if (res.ok) {
          const data = await res.json();
          setJournalEntries(data.entries || []);
        }
      } catch {}
      setLoadingComments(false);
      setJournalLoading(false);
    })();
  }, [trade.id]);

  const handleSave = async () => {
    setSaving(true);
    const tradeSettingsPayload = {
      entry_zone_low: entryZoneLow ? parseFloat(entryZoneLow) : null,
      entry_zone_high: entryZoneHigh ? parseFloat(entryZoneHigh) : null,
      stop_loss: settingsStopLoss ? parseFloat(settingsStopLoss) : null,
      take_profit_1: takeProfit1 ? parseFloat(takeProfit1) : null,
      take_profit_2: takeProfit2 ? parseFloat(takeProfit2) : null,
      take_profit_3: takeProfit3 ? parseFloat(takeProfit3) : null,
      position_size_pct: positionSizePct ? parseFloat(positionSizePct) : null,
    };
    const payload: Record<string, unknown> = {
      entry_price: entryPrice ? parseFloat(entryPrice) : null,
      stop_loss: stopLoss ? parseFloat(stopLoss) : null,
      take_profit: takeProfit ? parseFloat(takeProfit) : null,
      position_size: positionSize ? parseFloat(positionSize) : null,
      direction,
      notes,
      trade_settings: tradeSettingsPayload,
    };
    try {
      await fetch(`/api/v1/boards/${boardId}/trades/${trade.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      onSaved();
    } catch {}
    setSaving(false);
  };

  const handleEnter = async () => {
    try {
      const res = await fetch(`/api/v1/trades/${trade.id}/enter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_price: entryPrice ? parseFloat(entryPrice) : null }),
      });
      if (res.ok) onSaved();
    } catch {}
  };

  const handleExit = async () => {
    const parsed = parseFloat(exitPrice);
    if (!Number.isFinite(parsed)) return;
    try {
      const res = await fetch(`/api/v1/trades/${trade.id}/exit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exit_price: parsed }),
      });
      if (res.ok) onSaved();
    } catch {}
  };

  const handlePark = async () => {
    if (!pauseReason.trim()) return;
    try {
      const res = await fetch(`/api/v1/trades/${trade.id}/park`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pause_reason: pauseReason.trim() }),
      });
      if (res.ok) onSaved();
    } catch {}
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      const res = await fetch(`/api/v1/trades/${trade.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments(prev => [...prev, data.comment]);
        setNewComment('');
      }
    } catch {}
  };

  const handleAddJournalEntry = async () => {
    if (!entryContent.trim()) return;
    setEntrySaving(true);
    try {
      const res = await fetch(`/api/v1/trades/${trade.id}/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_type: entryType, content: entryContent.trim(), mood: entryMood || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setJournalEntries((prev) => [data.entry, ...prev]);
        setEntryContent('');
        setEntryMood('');
      }
    } catch {}
    setEntrySaving(false);
  };

  const sectionTitleStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' };
  const journalTypeStyles: Record<string, { label: string; color: string; bg: string }> = {
    note: { label: 'Note', color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.2)' },
    lesson: { label: 'Lesson', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.2)' },
    mistake: { label: 'Mistake', color: '#f05b6f', bg: 'rgba(240, 91, 111, 0.2)' },
    win_reason: { label: 'Win Reason', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.2)' },
    strategy: { label: 'Strategy', color: '#7b7dff', bg: 'rgba(123, 125, 255, 0.2)' },
    market_context: { label: 'Context', color: '#f5b544', bg: 'rgba(245, 181, 68, 0.2)' },
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(5, 5, 15, 0.75)',
        display: 'grid', placeItems: 'center', padding: '20px', zIndex: 70,
      }}
    >
      <div style={{
        width: 'min(960px, 100%)', background: 'var(--panel)',
        border: '1px solid var(--border)', borderRadius: '20px',
        padding: '24px', boxShadow: 'var(--shadow)',
        animation: 'floatIn 0.3s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>{normalizePair(trade.coin_pair)}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Current price: {formatPrice(livePrice ?? toNumber(trade.current_price))}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <button
            onClick={() => setActiveTab('details')}
            style={{
              ...secondaryBtnStyle,
              padding: '8px 14px',
              background: activeTab === 'details' ? 'rgba(123,125,255,0.2)' : 'transparent',
              borderColor: activeTab === 'details' ? 'rgba(123,125,255,0.5)' : 'var(--border)',
              color: activeTab === 'details' ? 'var(--accent)' : 'var(--text)',
            }}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('journal')}
            style={{
              ...secondaryBtnStyle,
              padding: '8px 14px',
              background: activeTab === 'journal' ? 'rgba(74,222,128,0.2)' : 'transparent',
              borderColor: activeTab === 'journal' ? 'rgba(74,222,128,0.5)' : 'var(--border)',
              color: activeTab === 'journal' ? '#4ade80' : 'var(--text)',
            }}
          >
            Journal
          </button>
        </div>

        {activeTab === 'details' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={sectionTitleStyle}>Trade Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Entry Price</label>
                    <input value={entryPrice} onChange={e => setEntryPrice(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Direction</label>
                    <select value={direction} onChange={e => setDirection(e.target.value)} style={inputStyle}>
                      <option value="long">LONG</option>
                      <option value="short">SHORT</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Stop Loss</label>
                    <input value={stopLoss} onChange={e => setStopLoss(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Take Profit</label>
                    <input value={takeProfit} onChange={e => setTakeProfit(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Position Size</label>
                    <input value={positionSize} onChange={e => setPositionSize(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Status</label>
                    <input value={trade.status || '—'} readOnly style={{ ...inputStyle, background: 'var(--panel-3)' }} />
                  </div>
                </div>
              </div>

              <div>
                <div style={sectionTitleStyle}>Notes</div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
                  placeholder="Trade notes..."
                />
              </div>

              <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '12px 14px' }}>
                <button
                  onClick={() => setTradeSettingsOpen((prev) => !prev)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    padding: 0,
                    marginBottom: tradeSettingsOpen ? '10px' : 0,
                  }}
                  type="button"
                >
                  <span>⚙️</span>
                  <span>Trade Settings</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{tradeSettingsOpen ? 'Hide' : 'Show'}</span>
                </button>
                {tradeSettingsOpen && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Entry Zone Low</label>
                      <input type="number" value={entryZoneLow} onChange={e => setEntryZoneLow(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Entry Zone High</label>
                      <input type="number" value={entryZoneHigh} onChange={e => setEntryZoneHigh(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Stop Loss</label>
                      <input type="number" value={settingsStopLoss} onChange={e => setSettingsStopLoss(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Take Profit 1</label>
                      <input type="number" value={takeProfit1} onChange={e => setTakeProfit1(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Take Profit 2</label>
                      <input type="number" value={takeProfit2} onChange={e => setTakeProfit2(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Take Profit 3</label>
                      <input type="number" value={takeProfit3} onChange={e => setTakeProfit3(e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Position Size</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="number" value={positionSizePct} onChange={e => setPositionSizePct(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>% of paper balance</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div style={sectionTitleStyle}>Actions</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                  <button onClick={handleEnter} style={primaryBtnStyle}>Enter Trade</button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      value={exitPrice}
                      onChange={e => setExitPrice(e.target.value)}
                      placeholder="Exit price"
                      style={{ ...inputStyle, width: '140px' }}
                    />
                    <button onClick={handleExit} style={secondaryBtnStyle}>Exit Trade</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      value={pauseReason}
                      onChange={e => setPauseReason(e.target.value)}
                      placeholder="Pause reason"
                      style={{ ...inputStyle, width: '200px' }}
                    />
                    <button onClick={handlePark} style={secondaryBtnStyle}>Park</button>
                  </div>
                  <button onClick={handleSave} style={{ ...primaryBtnStyle, opacity: saving ? 0.6 : 1 }} disabled={saving}>
                    Save Changes
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
                <div style={sectionTitleStyle}>Activity Timeline</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '220px', overflowY: 'auto' }}>
                  {activity.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>No activity yet</div>
                  ) : (
                    activity.map((item) => (
                      <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>{item.action}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          {item.from_column ? `${item.from_column} → ` : ''}{item.to_column || '—'} · {item.actor_name || 'System'}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{new Date(item.created_at).toLocaleString()}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
                <div style={sectionTitleStyle}>Comments</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '180px', overflowY: 'auto', marginBottom: '10px' }}>
                  {loadingComments ? (
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Loading comments...</div>
                  ) : comments.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>No comments yet</div>
                  ) : (
                    comments.map(c => {
                      const isBot = (c.user_name || '').toLowerCase().includes('penny') || (c.user_name || '').toLowerCase().includes('bot');
                      return (
                        <div key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                          <div style={{
                            width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                            background: isBot ? 'linear-gradient(135deg, #7b7dff, #9a9cff)' : 'var(--panel-3)',
                            border: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: isBot ? '13px' : '11px', fontWeight: 600, color: '#fff',
                          }}>
                            {isBot ? '🤖' : (c.user_name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                              <span style={{ fontSize: '12px', fontWeight: 600 }}>{c.user_name || 'Unknown'}</span>
                              {isBot && <span style={{ fontSize: '9px', background: 'rgba(123,125,255,0.2)', color: 'var(--accent)', padding: '1px 6px', borderRadius: '999px' }}>bot</span>}
                              <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                                {new Date(c.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.5, marginTop: '2px', whiteSpace: 'pre-wrap' }}>{c.content}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAddComment())}
                    placeholder="Write a comment..."
                    style={{ ...inputStyle, flex: 1, fontSize: '12px', padding: '8px 12px' }}
                  />
                  <button onClick={handleAddComment} style={{ ...primaryBtnStyle, padding: '8px 14px', fontSize: '12px' }}>Send</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {(trade.status === 'lost' || trade.column_name === 'Losses') && trade.lesson_tag && (
              <div style={{ background: 'rgba(240, 91, 111, 0.16)', border: '1px solid rgba(240, 91, 111, 0.4)', borderRadius: '14px', padding: '14px' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.18em', color: '#f05b6f', marginBottom: '6px' }}>Lesson Tag</div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{trade.lesson_tag}</div>
              </div>
            )}

            <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
              <div style={sectionTitleStyle}>Journal Timeline</div>
              <div style={{ display: 'grid', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
                {journalLoading ? (
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Loading journal...</div>
                ) : journalEntries.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>No journal entries yet.</div>
                ) : (
                  journalEntries.map((entry) => {
                    const style = journalTypeStyles[entry.entry_type] || journalTypeStyles.note;
                    return (
                      <div key={entry.id} style={{ display: 'grid', gap: '4px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: style.bg, color: style.color, border: `1px solid ${style.color}44`, fontWeight: 600 }}>
                            {style.label}
                          </span>
                          {entry.mood && <span style={{ fontSize: '14px' }}>{entry.mood}</span>}
                          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                            {new Date(entry.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{entry.content}</div>
                        {entry.created_by_name && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>— {entry.created_by_name}</div>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
              <div style={sectionTitleStyle}>Add Entry</div>
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <select value={entryType} onChange={e => setEntryType(e.target.value)} style={inputStyle}>
                    <option value="note">Note</option>
                    <option value="lesson">Lesson</option>
                    <option value="mistake">Mistake</option>
                    <option value="win_reason">Win Reason</option>
                    <option value="strategy">Strategy</option>
                    <option value="market_context">Market Context</option>
                  </select>
                  <select value={entryMood} onChange={e => setEntryMood(e.target.value)} style={inputStyle}>
                    <option value="">Mood (optional)</option>
                    <option value="😊">😊 Positive</option>
                    <option value="😐">😐 Neutral</option>
                    <option value="😤">😤 Frustrated</option>
                    <option value="😰">😰 Anxious</option>
                    <option value="🎯">🎯 Focused</option>
                  </select>
                </div>
                <textarea
                  value={entryContent}
                  onChange={e => setEntryContent(e.target.value)}
                  style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' }}
                  placeholder="What happened? What did you learn?"
                />
                <button
                  onClick={handleAddJournalEntry}
                  style={{ ...primaryBtnStyle, opacity: entrySaving ? 0.6 : 1 }}
                  disabled={entrySaving}
                >
                  Add Entry
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { key: 'Esc', label: 'Close modal or chart panel' },
    { key: 'N', label: 'New trade' },
    { key: 'R', label: 'Refresh prices' },
    { key: '?', label: 'Toggle shortcuts' },
  ];

  return (
    <div
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(5, 5, 15, 0.75)', display: 'grid', placeItems: 'center', zIndex: 90 }}
    >
      <div style={{ width: 'min(420px, 90vw)', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--muted)' }}>Shortcuts</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '18px', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          {shortcuts.map((item) => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px' }}>{item.label}</span>
              <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '8px', background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                {item.key}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewTradeModal({
  boardId,
  onClose,
  onCreated,
}: {
  boardId: number;
  onClose: () => void;
  onCreated: (trade: Trade) => void;
}) {
  const [pair, setPair] = useState('');
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ pair: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/v1/prices?top=20');
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setSuggestions(data.coins || []);
          }
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  const handleCreate = async () => {
    const normalized = normalizePair(pair.trim());
    if (!normalized) {
      setError('Pair is required');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/v1/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId,
          coin_pair: normalized,
          direction,
          notes,
          column_name: 'Watchlist',
          status: 'watching',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onCreated(data.trade);
      } else {
        setError('Failed to create trade');
      }
    } catch {
      setError('Failed to create trade');
    }
    setLoading(false);
  };

  return (
    <div
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(5, 5, 15, 0.8)', display: 'grid', placeItems: 'center', padding: '20px', zIndex: 70 }}
    >
      <div style={{ width: 'min(520px, 100%)', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '18px', padding: '22px', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)' }}>New Trade</div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>Add to Watchlist</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '18px', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'grid', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Coin Pair</label>
            <input
              list="top-coins"
              value={pair}
              onChange={(event) => setPair(event.target.value)}
              placeholder="BTC/USDT"
              style={inputStyle}
            />
            <datalist id="top-coins">
              {suggestions.map((coin) => (
                <option key={coin.pair} value={normalizePair(coin.pair)} />
              ))}
            </datalist>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Direction</label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setDirection('long')}
                style={{
                  ...secondaryBtnStyle,
                  padding: '8px 12px',
                  background: direction === 'long' ? 'rgba(74,222,128,0.18)' : 'transparent',
                  borderColor: direction === 'long' ? 'rgba(74,222,128,0.6)' : 'var(--border)',
                  color: direction === 'long' ? '#4ade80' : 'var(--text)',
                }}
              >
                LONG
              </button>
              <button
                type="button"
                onClick={() => setDirection('short')}
                style={{
                  ...secondaryBtnStyle,
                  padding: '8px 12px',
                  background: direction === 'short' ? 'rgba(240,91,111,0.18)' : 'transparent',
                  borderColor: direction === 'short' ? 'rgba(240,91,111,0.6)' : 'var(--border)',
                  color: direction === 'short' ? '#f05b6f' : 'var(--text)',
                }}
              >
                SHORT
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Notes</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
              placeholder="Setup notes..."
            />
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: '#f05b6f' }}>{error}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
            <button type="button" onClick={handleCreate} style={{ ...primaryBtnStyle, opacity: loading ? 0.7 : 1 }} disabled={loading}>
              {loading ? 'Creating...' : 'Create Trade'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

}

function DashboardStatusBar({ livePnl }: { livePnl?: number | null }) {
  const [settings, setSettings] = useState<{ riskLevel: string | null; tradingAmount: number | null; timeframe: string | null; timeframeStartDate: string | null; tboEnabled: boolean; engineOn: boolean } | null>(null);
  const [pnl, setPnl] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [startBal, setStartBal] = useState<number>(0);
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = JSON.parse(localStorage.getItem('clawdesk-trading-setup') || '{}');
      setSettings({
        riskLevel: saved.riskLevel || null,
        tradingAmount: saved.tradingAmount || null,
        timeframe: saved.timeframe || null,
        timeframeStartDate: saved.timeframeStartDate || null,
        tboEnabled: !!saved.tboEnabled,
        engineOn: !!saved.engineOn,
      });
    } catch {
      setSettings(null);
    }
    fetch('/api/trading/settings').then(r => r.json()).then(({ settings: s }) => {
      if (s && s.riskLevel) {
        setSettings({
          riskLevel: s.riskLevel || null,
          tradingAmount: s.tradingAmount || null,
          timeframe: s.timeframe || null,
          timeframeStartDate: s.timeframeStartDate || null,
          tboEnabled: !!s.tboEnabled,
          engineOn: !!s.engineOn,
        });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const boardId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('boardId') || window.location.pathname.split('/trading/')[1]?.split('/')[0] || '' : '';
    if (!boardId) return;
    fetch(`/api/trading/account?boardId=${boardId}`)
      .then(r => r.json())
      .then(data => {
        if (data?.account) {
          const starting = parseFloat(data.account.starting_balance);
          if (!isNaN(starting)) setStartBal(starting);
          if (data.account.created_at) setAccountCreatedAt(data.account.created_at);
          fetch(`/api/v1/portfolio`)
            .then(r => r.json())
            .then(portfolio => {
              const realized = Number(portfolio?.summary?.total_realized_pnl ?? 0);
              const unrealized = Number(portfolio?.summary?.total_unrealized_pnl ?? 0);
              const totalPnl = realized + unrealized;
              setPnl(totalPnl);
              setBalance(starting + totalPnl);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  if (!settings) return null;

  const riskLabel = settings.riskLevel ? settings.riskLevel.charAt(0).toUpperCase() + settings.riskLevel.slice(1) : 'Not Set';
  const timeframeLabel = settings.timeframe ? (settings.timeframe === 'unlimited' ? 'Unlimited' : `${settings.timeframe} days`) : '—';

  let dayLabel = '';
  const challengeStart = accountCreatedAt || settings.timeframeStartDate;
  if (challengeStart) {
    const start = new Date(challengeStart);
    const now = new Date();
    const dayNum = Math.max(1, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    dayLabel = `Day ${dayNum}`;
  }

  const engineLabel = settings.engineOn ? 'Engine Active' : 'Engine Off';
  const engineColor = settings.engineOn ? '#4ade80' : 'var(--muted)';

  const displayPnl = livePnl ?? pnl;
  const pnlColor = displayPnl === null ? 'var(--muted)' : displayPnl >= 0 ? '#4ade80' : '#f05b6f';
  const pnlLabel = displayPnl === null ? '' : `${displayPnl >= 0 ? '+' : ''}$${displayPnl.toFixed(2)}`;
  const balanceLabel = balance !== null ? `$${balance >= 1000 ? balance.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : balance.toFixed(2)}` : '';
  const balanceColor = balance !== null && balance >= startBal ? '#4ade80' : '#f05b6f';

  return (
    <div style={{
      padding: '6px 16px',
      fontSize: '11px',
      color: 'var(--muted)',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '8px',
      letterSpacing: '0.04em',
    }}>
      <span>{riskLabel}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      {balanceLabel && <span style={{ color: balanceColor, fontWeight: 600 }}>{balanceLabel}</span>}
      {pnlLabel && <span style={{ color: pnlColor }}>({pnlLabel})</span>}
      <span style={{ opacity: 0.4 }}>·</span>
      <span>{timeframeLabel}</span>
      {dayLabel && <><span style={{ opacity: 0.4 }}>·</span><span>{dayLabel}</span></>}
      <span style={{ opacity: 0.4 }}>·</span>
      <span style={{ color: engineColor }}>{engineLabel}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <button
        onClick={async () => {
          const amt = settings.tradingAmount || 1000;
          const confirmed = window.confirm(
            `Reset challenge? This will close all positions, clear trade history, and start fresh with $${amt.toLocaleString()} balance. This cannot be undone.`
          );
          if (!confirmed) return;
          try {
            await fetch('/api/trading/account', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ boardId: 15, balance: amt }),
            });
            const tradesRes = await fetch('/api/v1/trades?boardId=15');
            const tradesData = await tradesRes.json();
            const trades = tradesData.trades || tradesData || [];
            await Promise.all(trades.map((t: { id: number }) =>
              fetch(`/api/v1/trades/${t.id}`, { method: 'DELETE' })
            ));
            window.location.reload();
          } catch (err) {
            console.error('Reset challenge failed:', err);
            alert('Failed to reset challenge. Check console for details.');
          }
        }}
        style={{ background: 'none', border: 'none', color: '#f05b6f88', fontSize: '11px', cursor: 'pointer', padding: '0 4px' }}
      >
        🔄 Reset
      </button>
    </div>
  );
}
