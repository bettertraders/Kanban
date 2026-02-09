'use client';

import { useCallback, useEffect, useState } from 'react';
import { TradingNav } from '@/components/TradingNav';
// TboToggle moved to board page

/* ── types ── */
type Coin = {
  id: string; name: string; symbol: string; image: string;
  price: number; change24h: number; change7d: number | null;
  marketCap: number; volume: number;
};
type TrendingCoin = { name: string; symbol: string; thumb: string; marketCapRank: number; priceBtc: number };
type TboStatus = {
  enabled: boolean;
  signalsToday: number;
  lastSignal: { time: string; ticker: string; signal: string; interval: string } | null;
  activeTimeframes: string[];
};
type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

const NEWS_SOURCES: Record<string, { label: string; color: string }> = {
  CoinDesk: { label: 'CoinDesk', color: '#f39a26' },
  CoinTelegraph: { label: 'CoinTelegraph', color: '#1b6bff' },
  'Yahoo Finance': { label: 'Yahoo Finance', color: '#8b5cf6' },
};

type WatchlistTask = {
  id: number;
  coin_pair: string;
  tbo_signal?: string | null;
};

type MarketData = {
  overview: {
    btc: Coin; eth: Coin;
    totalMarketCap: number; btcDominance: number;
    fearGreed: { value: number; label: string };
  };
  movers: { gainers: Coin[]; losers: Coin[]; volatile: Coin[] };
  discovery: { trending: TrendingCoin[]; topVolume: Coin[]; topMarketCap: Coin[] };
  watchlist: Coin[];
  updatedAt: string;
  stale?: boolean;
};

/* ── helpers ── */
const fmt = (n: number, decimals = 2) => {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1) return `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  return `$${n.toFixed(6)}`;
};
const pct = (n: number | null) => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const pctColor = (n: number | null) => n == null ? '#888' : n >= 0 ? '#22c55e' : '#ef4444';
const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

/* ── styles ── */
const card: React.CSSProperties = {
  background: 'rgba(123,125,255,0.06)', borderRadius: 12, padding: 16,
  border: '1px solid rgba(123,125,255,0.15)', marginBottom: 12,
};
const sectionTitle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: '#7b7dff', textTransform: 'uppercase',
  letterSpacing: 1, marginBottom: 10,
};
const coinRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
};

/* ── components ── */
function CoinRow({ coin, showVolume }: { coin: Coin; showVolume?: boolean }) {
  return (
    <div style={coinRow}>
      <img src={coin.image} alt="" width={22} height={22} style={{ borderRadius: 99 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#e2e2ff' }}>{coin.name} <span style={{ color: '#888', fontWeight: 400 }}>{coin.symbol}</span></div>
        {showVolume && <div style={{ fontSize: 11, color: '#888' }}>Vol: {fmt(coin.volume)}</div>}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#e2e2ff' }}>{fmt(coin.price)}</div>
        <div style={{ fontSize: 11, color: pctColor(coin.change24h) }}>{pct(coin.change24h)}</div>
      </div>
    </div>
  );
}

function FearGreedGauge({ value, label }: { value: number; label: string }) {
  const color = value <= 25 ? '#ef4444' : value <= 45 ? '#f97316' : value <= 55 ? '#eab308' : value <= 75 ? '#22c55e' : '#16a34a';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 48, height: 48, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `conic-gradient(${color} ${value * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
        fontWeight: 700, fontSize: 16, color: '#fff',
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 99, background: '#141428', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {value}
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 600, color: '#e2e2ff', fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 11, color: '#888' }}>Fear & Greed Index</div>
      </div>
    </div>
  );
}

/* ── page ── */
export default function MarketDashboard() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tbo, setTbo] = useState<TboStatus | null>(null);
  const [tboLoading, setTboLoading] = useState(false);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsError, setNewsError] = useState(false);
  const [boardWatchlist, setBoardWatchlist] = useState<WatchlistTask[]>([]);
  const [boardWatchlistPrices, setBoardWatchlistPrices] = useState<Record<string, { price: number; change24h: number }>>({});

  const loadTbo = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/tbo/status');
      if (res.ok) setTbo(await res.json());
    } catch {}
  }, []);

  const toggleTbo = useCallback(async () => {
    if (!tbo || tboLoading) return;
    setTboLoading(true);
    try {
      const res = await fetch('/api/trading/tbo/toggle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !tbo.enabled }),
      });
      if (res.ok) await loadTbo();
    } finally { setTboLoading(false); }
  }, [tbo, tboLoading, loadTbo]);

  const loadNews = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/news');
      if (res.ok) {
        const json = await res.json();
        setNewsItems(Array.isArray(json?.items) ? json.items : []);
        setNewsError(false);
      } else {
        setNewsItems([]);
        setNewsError(true);
      }
    } catch {
      setNewsItems([]);
      setNewsError(true);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/market');
      if (!res.ok) throw new Error('Failed to fetch');
      setData(await res.json());
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBoardWatchlist = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/boards/15/trades');
      if (res.ok) {
        const json = await res.json();
        const trades = (json.trades || []) as Array<{ id: number; coin_pair: string; column_name: string; tbo_signal?: string | null }>;
        const wl = trades.filter((t) => t.column_name === 'Watchlist');
        setBoardWatchlist(wl);
        // fetch prices for watchlist coins
        if (wl.length) {
          const pairs = wl.map((t) => t.coin_pair.replace(/\//g, '-')).join(',');
          const priceRes = await fetch(`/api/v1/prices?pairs=${encodeURIComponent(pairs)}`);
          if (priceRes.ok) {
            const priceJson = await priceRes.json();
            setBoardWatchlistPrices(priceJson.prices || {});
          }
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    load(); loadTbo(); loadNews(); loadBoardWatchlist();
    const iv = setInterval(() => { load(); loadTbo(); loadNews(); loadBoardWatchlist(); }, 60_000);
    return () => clearInterval(iv);
  }, [load, loadTbo, loadNews, loadBoardWatchlist]);

  return (
    <div style={{ minHeight: '100vh', color: '#e2e2ff', padding: '32px clamp(20px, 4vw, 48px) 40px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <header style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src="/icons/clawdesk-mark.png" alt="" style={{ width: '48px', height: '48px', borderRadius: '10px' }} />
            <div>
              <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 36px)' }}>Market Overview</h1>
              <div style={{ color: 'var(--muted)', fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                Live Data &amp; Sentiment
              </div>
            </div>
          </div>
        </header>
        <TradingNav activeTab={'market' as any} />

        {/* TBO toggle moved to board page */}

        {/* Refresh bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {data && (
              <span style={{ fontSize: 12, color: data.stale ? '#f97316' : '#888' }}>
                {data.stale ? '⚠ Stale — ' : ''}Last updated: {timeAgo(data.updatedAt)}
              </span>
            )}
            <button
              onClick={() => { setLoading(true); load(); }}
              style={{
                background: 'rgba(123,125,255,0.15)', border: '1px solid rgba(123,125,255,0.3)',
                color: '#7b7dff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* ── TBO PRO Toggle ── */}
        {tbo && (
          <div style={{
            ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 12,
            boxShadow: tbo.enabled ? '0 0 20px rgba(34,197,94,0.15)' : 'none',
            borderColor: tbo.enabled ? 'rgba(34,197,94,0.3)' : 'rgba(123,125,255,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button onClick={toggleTbo} disabled={tboLoading} style={{
                width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                background: tbo.enabled ? '#22c55e' : 'rgba(255,255,255,0.12)',
                position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 11, background: '#fff',
                  position: 'absolute', top: 3,
                  left: tbo.enabled ? 27 : 3, transition: 'left 0.2s',
                }} />
              </button>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: tbo.enabled ? '#22c55e' : '#888' }}>
                  TBO PRO {tbo.enabled ? '— Active' : '— Paused'}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {tbo.enabled ? (
                    <>
                      {tbo.signalsToday} signal{tbo.signalsToday !== 1 ? 's' : ''} today
                      {tbo.lastSignal && <> · Last: {tbo.lastSignal.ticker} {tbo.lastSignal.signal} ({timeAgo(tbo.lastSignal.time)})</>}
                    </>
                  ) : 'Signal processing paused'}
                </div>
              </div>
            </div>
            {tbo.enabled && tbo.activeTimeframes.length > 0 && (
              <div style={{ display: 'flex', gap: 6 }}>
                {tbo.activeTimeframes.map(tf => (
                  <span key={tf} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 6,
                    background: 'rgba(34,197,94,0.12)', color: '#22c55e', fontWeight: 600,
                  }}>{tf}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Watchlist removed — lives on the board only */}

        {loading && !data && <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>Loading market data…</div>}
        {error && !data && <div style={{ textAlign: 'center', padding: 60, color: '#ef4444' }}>Error: {error}</div>}

        {data && (
          <div className="market-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

            {/* ── Column 1: Overview ── */}
            <div>
              <div style={card}>
                <div style={sectionTitle}>Pinned Assets</div>
                {[data.overview.btc, data.overview.eth].filter(Boolean).map((c) => (
                  <div key={c.id} style={{ ...coinRow, borderBottom: 'none', padding: '8px 0' }}>
                    <img src={c.image} alt="" width={28} height={28} style={{ borderRadius: 99 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>{c.name} <span style={{ color: '#888', fontWeight: 400, fontSize: 12 }}>{c.symbol}</span></div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 2 }}>{fmt(c.price)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: pctColor(c.change24h) }}>24h {pct(c.change24h)}</div>
                      <div style={{ fontSize: 12, color: pctColor(c.change7d), marginTop: 2 }}>7d {pct(c.change7d)}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={card}>
                <div style={sectionTitle}>Global Market</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#888' }}>Total Market Cap</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{fmt(data.overview.totalMarketCap)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888' }}>BTC Dominance</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#7b7dff' }}>{data.overview.btcDominance.toFixed(1)}%</div>
                  </div>
                </div>
              </div>

              <div style={card}>
                <FearGreedGauge value={data.overview.fearGreed.value} label={data.overview.fearGreed.label} />
              </div>

              <div style={card}>
                <div style={sectionTitle}>🧠 Market Sentiment</div>
                {(() => {
                  const gainersCount = data.movers.gainers.length;
                  const losersCount = data.movers.losers.length;
                  const btcChange = data.overview.btc?.change24h ?? 0;
                  const fgValue = data.overview.fearGreed.value;

                  // Compute sentiment score: 0-100
                  // BTC trend (40%), Fear & Greed (40%), gainers vs losers ratio (20%)
                  const btcScore = Math.max(0, Math.min(100, 50 + btcChange * 5));
                  const glRatio = gainersCount + losersCount > 0 ? (gainersCount / (gainersCount + losersCount)) * 100 : 50;
                  const sentimentScore = Math.round(btcScore * 0.4 + fgValue * 0.4 + glRatio * 0.2);

                  const label = sentimentScore >= 70 ? 'Bullish' : sentimentScore >= 55 ? 'Slightly Bullish' : sentimentScore >= 45 ? 'Neutral' : sentimentScore >= 30 ? 'Slightly Bearish' : 'Bearish';
                  const color = sentimentScore >= 70 ? '#22c55e' : sentimentScore >= 55 ? '#4ade80' : sentimentScore >= 45 ? '#eab308' : sentimentScore >= 30 ? '#f97316' : '#ef4444';
                  const emoji = sentimentScore >= 70 ? '🐂' : sentimentScore >= 55 ? '📈' : sentimentScore >= 45 ? '😐' : sentimentScore >= 30 ? '📉' : '🐻';

                  return (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{ fontSize: 28 }}>{emoji}</div>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 700, color }}>{label}</div>
                          <div style={{ fontSize: 12, color: '#888' }}>Sentiment Score: {sentimentScore}/100</div>
                        </div>
                      </div>
                      <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 10 }}>
                        <div style={{ height: '100%', width: `${sentimentScore}%`, background: `linear-gradient(90deg, #ef4444, #eab308, #22c55e)`, borderRadius: 99 }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 11, color: '#888' }}>
                        <div>
                          <div>BTC 24h</div>
                          <div style={{ fontWeight: 600, color: pctColor(btcChange) }}>{pct(btcChange)}</div>
                        </div>
                        <div>
                          <div>Fear & Greed</div>
                          <div style={{ fontWeight: 600, color: '#e2e2ff' }}>{fgValue}</div>
                        </div>
                        <div>
                          <div>Gainers/Losers</div>
                          <div style={{ fontWeight: 600, color: '#e2e2ff' }}>{gainersCount}/{losersCount}</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div style={card}>
                <div style={sectionTitle}>📰 Market News</div>
                {newsError ? (
                  <div style={{ fontSize: 12, color: '#888' }}>Unable to load news</div>
                ) : newsItems.length ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {newsItems.slice(0, 5).map((item, i) => {
                      const badge = NEWS_SOURCES[item.source];
                      return (
                        <div key={`${item.link}-${item.pubDate}`} style={{
                          display: 'flex', alignItems: 'start', gap: 8,
                          paddingLeft: i === 0 ? 10 : 0,
                          borderLeft: i === 0 ? '2px solid #f3c226' : '2px solid transparent',
                        }}>
                          <span style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 6, flexShrink: 0,
                            background: 'rgba(255,255,255,0.04)',
                            border: `1px solid ${badge?.color ?? 'rgba(255,255,255,0.1)'}`,
                            color: badge?.color ?? '#888', fontWeight: 600, whiteSpace: 'nowrap',
                          }}>
                            {badge?.label ?? item.source}
                          </span>
                          <a href={item.link} target="_blank" rel="noreferrer" style={{
                            color: '#e2e2ff', textDecoration: 'none', fontSize: 13, fontWeight: 600,
                            flex: 1, lineHeight: 1.3,
                          }}>
                            {item.title}
                          </a>
                          <span style={{ fontSize: 11, color: '#888', flexShrink: 0 }}>{timeAgo(item.pubDate)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#888' }}>Loading news…</div>
                )}
              </div>
            </div>

            {/* ── Column 2: Top Movers ── */}
            <div>
              <div style={card}>
                <div style={sectionTitle}>🚀 Top 5 Gainers (24h)</div>
                {data.movers.gainers.map((c) => <CoinRow key={c.id} coin={c} />)}
              </div>
              <div style={card}>
                <div style={sectionTitle}>📉 Top 5 Losers (24h)</div>
                {data.movers.losers.map((c) => <CoinRow key={c.id} coin={c} />)}
              </div>
              <div style={card}>
                <div style={sectionTitle}>⚡ Most Volatile (24h)</div>
                {data.movers.volatile.map((c) => <CoinRow key={c.id} coin={c} />)}
              </div>
            </div>

            {/* ── Column 3: Discovery ── */}
            <div>
              <div style={card}>
                <div style={sectionTitle}>🔥 Trending</div>
                {data.discovery.trending.map((t, i) => (
                  <div key={i} style={coinRow}>
                    <img src={t.thumb} alt="" width={22} height={22} style={{ borderRadius: 99 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#e2e2ff' }}>{t.name} <span style={{ color: '#888', fontWeight: 400 }}>{t.symbol}</span></div>
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>#{t.marketCapRank || '—'}</div>
                  </div>
                ))}
              </div>
              <div style={card}>
                <div style={sectionTitle}>💰 Highest Volume (24h)</div>
                {data.discovery.topVolume.map((c) => <CoinRow key={c.id} coin={c} showVolume />)}
              </div>
              <div style={card}>
                <div style={sectionTitle}>👑 Top Market Cap</div>
                {data.discovery.topMarketCap.map((c) => <CoinRow key={c.id} coin={c} />)}
              </div>
            </div>
          </div>
        )}

        <style jsx global>{`
          @media (max-width: 1024px) {
            .market-grid {
              grid-template-columns: repeat(2, 1fr) !important;
            }
          }
          @media (max-width: 680px) {
            .market-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
