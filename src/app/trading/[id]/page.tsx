'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserMenu } from '@/components/UserMenu';

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
  created_by_name?: string;
  pause_reason?: string | null;
  lesson_tag?: string | null;
}

interface Board {
  id: number;
  name: string;
  description?: string;
  team_name?: string;
  team_slug?: string;
  is_personal: boolean;
  board_type?: string;
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

export default function TradingBoardPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id as string;

  const [board, setBoard] = useState<Board | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragTradeId, setDragTradeId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [priceMap, setPriceMap] = useState<Record<string, { price: number; volume24h: number; change24h: number }>>({});
  const [exitPrompt, setExitPrompt] = useState<{ trade: Trade; target: string } | null>(null);

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
    }
  }, [boardId, router]);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/boards/${boardId}/trades`);
      if (res.ok) {
        const data = await res.json();
        setTrades(data.trades || []);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    fetchBoard();
    fetchTrades();
  }, [fetchBoard, fetchTrades]);

  const pairList = useMemo(() => {
    const pairs = new Set<string>();
    trades.forEach((trade) => {
      if (trade.coin_pair) {
        pairs.add(normalizePair(trade.coin_pair));
      }
    });
    return Array.from(pairs);
  }, [trades]);

  useEffect(() => {
    if (!pairList.length) return;
    const pairsParam = pairList.map((pair) => pair.replace('/', '-')).join(',');
    const source = new EventSource(`/api/v1/prices/stream?pairs=${encodeURIComponent(pairsParam)}`);

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.prices) {
          setPriceMap(payload.prices);
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      source.close();
    };
  }, [pairList]);

  useEffect(() => {
    const source = new EventSource(`/api/v1/trades/stream?boardId=${encodeURIComponent(boardId)}`);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.trades) {
          setTrades(payload.trades);
        }
      } catch {
        // ignore
      }
    };
    return () => {
      source.close();
    };
  }, [boardId]);

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

  if (loading) {
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderRadius: '999px', background: 'var(--panel-2)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--muted)' }}>
            Live prices refreshed every 10s
          </div>
          <UserMenu />
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))', gap: '16px', alignItems: 'start', overflowX: 'auto', paddingBottom: '16px' }}>
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
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: col.color }}>{col.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>{totals.count} trades</div>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: pnlColor }}>{formatCurrency(totals.pnl)}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

                  return (
                    <article
                      key={trade.id}
                      draggable
                      onDragStart={() => handleDragStart(trade.id)}
                      onClick={() => setEditingTrade(trade)}
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
                        <div style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '0.02em' }}>{pair.replace('/', ' / ')}</div>
                        <div style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '999px', background: `${directionTone}22`, color: directionTone, border: `1px solid ${directionTone}44`, fontWeight: 600 }}>
                          {direction || '—'}
                        </div>
                      </div>
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
                            <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, Number(trade.confidence_score || 0)))}%`, background: col.color }} />
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
                  <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '6px 4px', textAlign: 'center' }}>Drop trades here</div>
                )}
              </div>
            </section>
          );
        })}
      </div>

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

      <style jsx global>{`
        @keyframes floatIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        select option {
          background: #1a1a2e;
          color: #eef0ff;
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
      setLoadingComments(false);
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

  const sectionTitleStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' };

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
      </div>
    </div>
  );
}
