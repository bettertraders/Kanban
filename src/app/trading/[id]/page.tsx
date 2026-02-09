'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserMenu } from '@/components/UserMenu';
import TradingChart from '@/components/TradingChart';
import { ToastStack, type ToastItem } from '@/components/ToastStack';
import { AlertsPanel } from '@/components/AlertsPanel';

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
  entered_at?: string | null;
  exited_at?: string | null;
  created_by_name?: string;
  pause_reason?: string | null;
  lesson_tag?: string | null;
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
  { name: 'Wins', color: '#4ade80' },
  { name: 'Losses', color: '#f05b6f' },
];

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

function formatCurrency(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
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
  const pnlDollar = size !== null ? perUnit * size : null;
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
  const [priceMap, setPriceMap] = useState<Record<string, { price: number; volume24h: number; change24h: number }>>({});
  const [priceFlashMap, setPriceFlashMap] = useState<Record<string, { direction: 'up' | 'down'; token: number }>>({});
  const [exitPrompt, setExitPrompt] = useState<{ trade: Trade; target: string } | null>(null);
  const [stats, setStats] = useState<TradingStats | null>(null);
  const [statsExpanded, setStatsExpanded] = useState(true);
  const [statsInitialized, setStatsInitialized] = useState(false);
  const [chartPair, setChartPair] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [tradeStreamConnected, setTradeStreamConnected] = useState(false);
  const [priceStreamConnected, setPriceStreamConnected] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [newTradeOpen, setNewTradeOpen] = useState(false);
  const [actionMenu, setActionMenu] = useState<{ trade: Trade; x: number; y: number } | null>(null);
  const [botActivity, setBotActivity] = useState<BotActivityItem[]>([]);
  const [botActivityLoading, setBotActivityLoading] = useState(true);
  const [botScansExpanded, setBotScansExpanded] = useState(true);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertBadgeCount, setAlertBadgeCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [isTeamAdmin, setIsTeamAdmin] = useState(false);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: number; name: string; email: string; role?: string }>>([]);
  const [showBoardSettings, setShowBoardSettings] = useState(false);
  const [paperAccount, setPaperAccount] = useState<{ starting_balance: number; current_balance: number } | null>(null);
  const [paperLoading, setPaperLoading] = useState(false);

  const priceMapRef = useRef<Record<string, { price: number; volume24h: number; change24h: number }>>({});
  const tradesRef = useRef<Trade[]>([]);
  const toastIdRef = useRef(1);
  const toastTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const reconnectRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const priceAlertRef = useRef<Record<string, { tp?: boolean; sl?: boolean }>>({});
  const alertCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    fetchBoard();
    fetchTrades();
    fetchStats();
    fetchBotActivity();
    refreshAlertCount();
  }, [fetchBoard, fetchBotActivity, fetchStats, fetchTrades, refreshAlertCount]);

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
        pushToast('Prices stream connected', 'success');
      };
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.prices) {
            const nextPrices = payload.prices as Record<string, { price: number; volume24h: number; change24h: number }>;
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
        pushToast('Trades stream connected', 'success');
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

    if (col === 'Wins' || col === 'Losses') {
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
      return trade.column_name === 'Wins' || trade.column_name === 'Losses' || ['closed', 'won', 'lost'].includes(status);
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

  if (boardLoading && !board) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ color: 'var(--muted)', fontSize: '16px' }}>Loading trading board...</div>
      </div>
    );
  }

  if (!board) return null;

  return (
    <div style={{ padding: '32px clamp(20px, 4vw, 48px) 40px', maxWidth: '1720px', margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '20px' }}>←</Link>
            <img src="/icons/clawdesk-mark.png" alt="ClawDesk" style={{ width: '48px', height: '48px', borderRadius: '10px' }} />
            <h1 style={{ fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 600, letterSpacing: '0.02em', margin: 0 }}>
              {board.name}
            </h1>
            <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '999px', background: 'rgba(74, 222, 128, 0.16)', border: '1px solid rgba(74, 222, 128, 0.28)', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              Trading Board
            </span>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
            {board.team_name || 'Personal Board'} · {trades.length} trades tracked
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '999px', background: 'var(--panel-2)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--muted)' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: sseConnected ? '#4ade80' : '#f05b6f', boxShadow: sseConnected ? '0 0 8px rgba(74,222,128,0.7)' : '0 0 8px rgba(240,91,111,0.7)' }} />
            SSE {sseConnected ? 'connected' : 'disconnected'}
          </div>
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
          <button
            onClick={() => setNewTradeOpen(true)}
            style={{ ...primaryBtnStyle, padding: '8px 14px', fontSize: '12px' }}
          >
            + Add Trade
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderRadius: '999px', background: 'var(--panel-2)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--muted)' }}>
            Live prices via SSE · Press ? for shortcuts
          </div>
          <UserMenu />
        </div>
      </header>

      <section style={{ marginBottom: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--muted)' }}>
            Bot Scans
          </div>
          <button
            onClick={() => setBotScansExpanded((prev) => !prev)}
            style={{
              background: 'transparent',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              padding: '6px 12px',
              borderRadius: '999px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {botScansExpanded ? 'Hide' : 'Show'}
          </button>
        </div>
        <div
          style={{
            overflow: 'hidden',
            maxHeight: botScansExpanded ? '260px' : '0px',
            opacity: botScansExpanded ? 1 : 0,
            transition: 'max-height 0.4s ease, opacity 0.25s ease',
            pointerEvents: botScansExpanded ? 'auto' : 'none',
          }}
        >
          <div style={{ ...glassCard, padding: '14px 16px' }}>
            {botActivityLoading ? (
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Loading bot activity...</div>
            ) : botActivity.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>No recent bot scans yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {botActivity.map((item) => {
                  const confidence = toNumber(item.confidence_score);
                  const confidenceTone = confidenceColor(confidence);
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>
                          {item.action} · {item.coin_pair ? normalizePair(item.coin_pair) : '—'}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>
                          {new Date(item.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ width: '120px' }}>
                        <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '4px', textAlign: 'right' }}>
                          Confidence {confidence ?? '—'}
                        </div>
                        <div style={{ height: '6px', borderRadius: '999px', background: 'var(--panel-3)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, confidence ?? 0))}%`, background: confidenceTone }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--muted)' }}>
            Performance Dashboard
          </div>
          <button
            onClick={() => setStatsExpanded((prev) => !prev)}
            style={{
              background: 'transparent',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              padding: '8px 14px',
              borderRadius: '999px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Stats {statsExpanded ? '▲' : '▼'}
          </button>
        </div>

        <div
          style={{
            overflow: 'hidden',
            maxHeight: statsExpanded ? '520px' : '0px',
            opacity: statsExpanded ? 1 : 0,
            transition: 'max-height 0.45s ease, opacity 0.3s ease',
            pointerEvents: statsExpanded ? 'auto' : 'none',
          }}
        >
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '14px' }}>
            <div style={glassCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '12px', background: 'rgba(123,125,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontSize: '18px' }}>📊</div>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)' }}>Total Trades</div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '10px' }}>{stats?.total_trades ?? 0}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>All board entries</div>
            </div>
            <div style={glassCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '12px', background: 'rgba(245,181,68,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f5b544', fontSize: '18px' }}>⚡</div>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)' }}>Active Trades</div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '10px' }}>{stats?.active_trades ?? 0}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>Currently open</div>
            </div>
            <div style={glassCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '12px', background: 'rgba(74,222,128,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ade80', fontSize: '18px' }}>🏆</div>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)' }}>Win Rate</div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '10px', color: winRateColor }}>
                {winRateValue === null ? '—' : `${winRateValue.toFixed(1)}%`}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                {stats ? `${stats.wins} wins / ${stats.losses} losses` : 'No closed trades'}
              </div>
            </div>
            <div style={glassCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '12px', background: 'rgba(74,222,128,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ade80', fontSize: '18px' }}>💵</div>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)' }}>Total P&amp;L</div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '10px', color: totalPnlColor }}>
                {totalPnlValue === null ? '—' : formatCurrency(totalPnlValue)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>Net performance</div>
            </div>
            <div style={glassCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '12px', background: `${bestTradeColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: bestTradeColor, fontSize: '18px' }}>🚀</div>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)' }}>Best Trade</div>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 700, marginTop: '10px', color: bestTradeColor }}>
                {bestWorstTrades.best ? formatCurrency(bestWorstTrades.best.pnl) : '—'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                {bestWorstTrades.best ? normalizePair(bestWorstTrades.best.trade.coin_pair) : 'No wins yet'}
              </div>
            </div>
            <div style={glassCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '12px', background: `${worstTradeColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: worstTradeColor, fontSize: '18px' }}>🧊</div>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)' }}>Worst Trade</div>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 700, marginTop: '10px', color: worstTradeColor }}>
                {bestWorstTrades.worst ? formatCurrency(bestWorstTrades.worst.pnl) : '—'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                {bestWorstTrades.worst ? normalizePair(bestWorstTrades.worst.trade.coin_pair) : 'No losses yet'}
              </div>
            </div>
          </div>

          <div style={{ ...glassCard, padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)', marginBottom: '8px' }}>
              Equity Curve
            </div>
            {equityChart ? (
              <svg width="100%" viewBox={`0 0 ${equityChart.w} ${equityChart.h}`} style={{ display: 'block', height: '110px' }}>
                {[0, 0.5, 1].map((pct, i) => {
                  const y = equityChart.pad + equityChart.chartH - pct * equityChart.chartH;
                  return <line key={i} x1={equityChart.pad} x2={equityChart.w - equityChart.pad} y1={y} y2={y} stroke="var(--border)" strokeWidth="0.6" />;
                })}
                <polyline points={equityChart.linePoints} fill="none" stroke={equityChart.lineColor} strokeWidth="2" />
                {(stats?.equityCurve ?? []).map((point, i) => {
                  const { x, y } = equityChart.toPoint(point.cumulative, i);
                  return <circle key={point.date + i} cx={x} cy={y} r="3" fill={equityChart.lineColor} />;
                })}
              </svg>
            ) : (
              <div style={{ height: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '13px', borderRadius: '12px', border: '1px dashed var(--border)', background: 'rgba(15, 15, 30, 0.4)' }}>
                No closed trades yet
              </div>
            )}
          </div>
        </div>
      </section>

      <section
        className="chart-panel"
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '18px',
          padding: chartPair ? '16px' : '0 16px',
          marginBottom: chartPair ? '24px' : '0',
          maxHeight: chartPair ? '420px' : '0px',
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
            <TradingChart pair={chartPair} boardId={Number(boardId)} />
          </>
        )}
      </section>

      <div className="trading-columns" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))', gap: '16px', alignItems: 'start', overflowX: 'auto', paddingBottom: '16px' }}>
        {columns.map((col) => {
          const colTrades = trades.filter(t => t.column_name === col.name);
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
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)' }}>P&amp;L</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: pnlColor }}>{formatCurrency(totals.pnl)}</div>
                </div>
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
                      const direction = String(trade.direction || '').toUpperCase();
                      const directionTone = direction === 'SHORT' ? '#f05b6f' : '#4ade80';
                      const signal = signalBadge(trade.tbo_signal);
                      const botName = getBotDisplayName(trade.created_by_name);
                      const confidence = toNumber(trade.confidence_score);
                      const confidenceTone = confidenceColor(confidence);

                      return (
                        <article
                          key={trade.id}
                          draggable
                          onDragStart={() => handleDragStart(trade.id)}
                          onClick={() => setEditingTrade(trade)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setActionMenu({ trade, x: event.clientX, y: event.clientY });
                          }}
                          className="trade-card"
                          style={{
                            background: 'var(--panel-2)',
                            border: '1px solid var(--border)',
                            borderRadius: '14px',
                            padding: '12px',
                            cursor: 'pointer',
                            boxShadow: '0 10px 20px rgba(0,0,0,0.18)',
                            transition: 'transform 0.2s ease, border-color 0.2s ease',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = col.color; }}
                          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setChartPair(toApiPair(pair));
                              }}
                              style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '0.02em', background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: 0 }}
                              title="Open chart"
                            >
                              {pair.replace('/', ' / ')}
                            </button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {botName && (
                                <div style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(123,125,255,0.2)', color: 'var(--accent)', border: '1px solid rgba(123,125,255,0.4)', fontWeight: 600 }}>
                                  🤖 {botName}
                                </div>
                              )}
                              <div style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '999px', background: `${directionTone}22`, color: directionTone, border: `1px solid ${directionTone}44`, fontWeight: 600 }}>
                                {direction || '—'}
                              </div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActionMenu({ trade, x: event.clientX, y: event.clientY });
                                }}
                                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: '8px', padding: '2px 6px', cursor: 'pointer' }}
                                aria-label="Quick actions"
                              >
                                ⋯
                              </button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                            <div>
                              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Current</div>
                              <div
                                key={priceFlashMap[pair]?.token ?? 0}
                                style={{
                                  fontSize: '15px',
                                  fontWeight: 600,
                                  animation: priceFlashMap[pair]?.direction === 'up'
                                    ? 'priceUp 0.6s ease'
                                    : priceFlashMap[pair]?.direction === 'down'
                                      ? 'priceDown 0.6s ease'
                                      : undefined,
                                }}
                              >
                                {formatPrice(livePrice)}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>P&L</div>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: pnlTone }}>{formatCurrency(pnlDollar)}</div>
                              <div style={{ fontSize: '11px', color: pnlTone }}>{formatPercent(pnlPercent)}</div>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', marginBottom: '10px' }}>
                            <div>
                              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Entry</div>
                              <div style={{ fontSize: '12px' }}>{formatPrice(toNumber(trade.entry_price))}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Size</div>
                              <div style={{ fontSize: '12px' }}>{toNumber(trade.position_size) ?? '—'}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Stop</div>
                              <div style={{ fontSize: '12px' }}>{formatPrice(toNumber(trade.stop_loss))}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Target</div>
                              <div style={{ fontSize: '12px' }}>{formatPrice(toNumber(trade.take_profit))}</div>
                            </div>
                          </div>
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
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px', color: 'var(--muted)', fontSize: '12px' }}>
                            <span style={{ cursor: 'grab' }}>⠿</span>
                          </div>
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

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => {
          if (toastTimersRef.current[id]) {
            clearTimeout(toastTimersRef.current[id]);
            delete toastTimersRef.current[id];
          }
          setToasts(prev => prev.filter(t => t.id !== id));
        }}
      />

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

function TradeDetailModal({ trade, livePrice, onClose, onSaved }: { trade: Trade; livePrice: number | null; onClose: () => void; onSaved: () => void; }) {
  const [entryPrice, setEntryPrice] = useState(String(trade.entry_price ?? ''));
  const [stopLoss, setStopLoss] = useState(String(trade.stop_loss ?? ''));
  const [takeProfit, setTakeProfit] = useState(String(trade.take_profit ?? ''));
  const [positionSize, setPositionSize] = useState(String(trade.position_size ?? ''));
  const [direction, setDirection] = useState(String(trade.direction || 'long').toLowerCase());
  const [notes, setNotes] = useState(String(trade.notes ?? ''));
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
    const payload: Record<string, unknown> = {
      entry_price: entryPrice ? parseFloat(entryPrice) : null,
      stop_loss: stopLoss ? parseFloat(stopLoss) : null,
      take_profit: takeProfit ? parseFloat(takeProfit) : null,
      position_size: positionSize ? parseFloat(positionSize) : null,
      direction,
      notes,
    };
    try {
      await fetch(`/api/v1/trades/${trade.id}`, {
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
