'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TradingNav } from '@/components/TradingNav';
import PriceTicker from '@/components/PriceTicker';
// TboToggle moved to board page

/* ── types ── */
type Coin = {
  id: string; name: string; symbol: string; image: string;
  price: number; change24h: number; change7d: number | null;
  marketCap: number; volume: number;
};
type TrendingCoin = { name: string; symbol: string; thumb: string; marketCapRank: number; priceBtc: number };
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
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsError, setNewsError] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const loadNews = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/news');
      if (res.ok) {
        const json = await res.json();
        setNewsItems(Array.isArray(json?.items) ? json.items : []);
        setNewsError(false);
      } else {
        setNewsError(true);
      }
    } catch {
      setNewsError(true);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/market');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(); loadNews();
    const iv = setInterval(() => { load(); loadNews(); }, 60_000);
    return () => clearInterval(iv);
  }, [load, loadNews]);

  return (
    <div style={{ minHeight: '100vh', color: '#e2e2ff' }}>
      <PriceTicker />
      <div style={{ padding: '32px clamp(20px, 4vw, 48px) 40px' }}>
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

        {/* Penny's Market Update */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', fontWeight: 600 }}>
                  Penny&apos;s Market Update
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', opacity: 0.7 }}>
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
              <div style={{ fontSize: '17px', lineHeight: 1.6, color: 'var(--text)', fontWeight: 500 }}>
                {data ? (() => {
                  const btc = data.overview.btc;
                  const fng = data.overview.fearGreed;
                  const gainers = data.movers.gainers.slice(0, 3).map(c => c.symbol.toUpperCase());
                  const losers = data.movers.losers.slice(0, 2).map(c => c.symbol.toUpperCase());
                  const btcDir = btc.change24h >= 0 ? 'up' : 'down';
                  const btcAbs = Math.abs(btc.change24h).toFixed(1);

                  if (fng.value < 25) return `Fear is running the show right now — index at ${fng.value} (${fng.label}). BTC is ${btcDir} ${btcAbs}% in the last 24h. ${losers.length > 0 ? `${losers.join(', ')} taking the biggest hits.` : ''} This is where patient traders start watching for opportunities. 👀`;
                  if (fng.value < 45) return `Markets are cautious with the Fear & Greed at ${fng.value} (${fng.label}). BTC ${btcDir} ${btcAbs}% today. ${gainers.length > 0 ? `${gainers.join(', ')} leading the green.` : ''} Not much conviction either way — staying sharp. 🎯`;
                  if (fng.value < 60) return `Balanced vibes in the market — Fear & Greed sitting at ${fng.value}. BTC ${btcDir} ${btcAbs}% on the day. ${gainers.length > 0 ? `Top movers: ${gainers.join(', ')}.` : ''} No panic, no FOMO — just the way I like it. 😎`;
                  if (fng.value < 75) return `Getting greedy out there — index at ${fng.value} (${fng.label}). BTC ${btcDir} ${btcAbs}%. ${gainers.length > 0 ? `${gainers.join(', ')} on a tear.` : ''} Good times but this is when discipline matters most. 📈`;
                  return `Extreme greed in the market — ${fng.value} on the Fear & Greed. BTC ${btcDir} ${btcAbs}%. Everyone's euphoric. Be careful — this is historically where tops form. Taking profits is never wrong. 🚨`;
                })() : 'Loading market data...'}
              </div>

              {/* Read More / Full Analysis */}
              {data && (
                <>
                  <button
                    onClick={() => setAnalysisOpen(prev => !prev)}
                    style={{
                      background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px',
                      fontWeight: 600, cursor: 'pointer', padding: '6px 0 0', display: 'inline-flex',
                      alignItems: 'center', gap: '4px',
                    }}
                  >
                    {analysisOpen ? 'Show less ▲' : 'Read full analysis ▼'}
                  </button>

                  {analysisOpen && (() => {
                    const btc = data.overview.btc;
                    const eth = data.overview.eth;
                    const fng = data.overview.fearGreed;
                    const totalMcap = data.overview.totalMarketCap;
                    const btcDom = data.overview.btcDominance;
                    const gainers = data.movers.gainers.slice(0, 5);
                    const losers = data.movers.losers.slice(0, 5);
                    const volatile = data.movers.volatile?.slice(0, 3) ?? [];
                    const trending = data.discovery.trending.slice(0, 5);

                    const btcDir = btc.change24h >= 0 ? 'up' : 'down';
                    const ethDir = eth.change24h >= 0 ? 'up' : 'down';

                    // BTC 7d context
                    const btc7d = btc.change7d != null ? `${btc.change7d >= 0 ? 'up' : 'down'} ${Math.abs(btc.change7d).toFixed(1)}% on the week` : '';

                    // Dominance analysis
                    const domText = btcDom > 55 ? 'BTC dominance is elevated — capital is consolidating into Bitcoin, which usually means altcoins are underperforming relative to BTC. This often happens during risk-off periods or early bull phases.'
                      : btcDom > 45 ? 'BTC dominance is in a neutral range — money is flowing across the market fairly evenly. Altcoins have breathing room here.'
                      : 'BTC dominance is low — altcoins are seeing significant rotation and outperformance. This typically happens in mid-to-late bull markets when risk appetite is high.';

                    // Fear & Greed context
                    const fngText = fng.value < 25 ? 'Extreme fear usually marks the best buying opportunities historically, but it can persist for weeks. Watch for capitulation volume spikes as a potential reversal signal.'
                      : fng.value < 45 ? 'The market is cautious but not panicking. This is a wait-and-see zone — momentum traders should wait for confirmation before entering.'
                      : fng.value < 60 ? 'Sentiment is neutral, which is actually healthy. Markets can trend in either direction from here. Focus on individual coin setups rather than macro bets.'
                      : fng.value < 75 ? 'Greed is building, and while the trend may have room to run, this is where smart money starts scaling out of positions. Tighten your stop losses.'
                      : 'Extreme greed is historically where major tops form. This doesn\'t mean sell everything, but consider taking profits on positions that have run significantly. Protect your gains.';

                    // Volume context
                    const btcVolStr = btc.volume > 50e9 ? 'Massive BTC volume today — institutions are active.' : btc.volume > 30e9 ? 'Healthy BTC volume indicating real participation.' : 'BTC volume is relatively light — moves may lack conviction.';

                    return (
                      <div style={{ marginTop: '12px', fontSize: '13px', lineHeight: 1.7, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                        <p style={{ margin: 0 }}>
                          <strong style={{ color: 'var(--text)' }}>Price Action:</strong>{' '}
                          Bitcoin is trading at {fmt(btc.price)}, {btcDir} {Math.abs(btc.change24h).toFixed(1)}% in the last 24 hours{btc7d ? ` and ${btc7d}` : ''}. Ethereum sits at {fmt(eth.price)}, {ethDir} {Math.abs(eth.change24h).toFixed(1)}% on the day.
                          Total crypto market cap stands at {fmt(totalMcap)} with BTC dominance at {btcDom.toFixed(1)}%. {domText} {btcVolStr}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong style={{ color: 'var(--text)' }}>Movers & Sentiment:</strong>{' '}
                          {gainers.length > 0 && <>Today&apos;s top gainers are {gainers.map(c => `${c.symbol.toUpperCase()} (${pct(c.change24h)})`).join(', ')}. </>}
                          {losers.length > 0 && <>On the downside, {losers.map(c => `${c.symbol.toUpperCase()} (${pct(c.change24h)})`).join(', ')} are seeing the most selling pressure. </>}
                          {volatile.length > 0 && <>Most volatile: {volatile.map(c => c.symbol.toUpperCase()).join(', ')} — expect wide swings. </>}
                          The Fear &amp; Greed Index reads {fng.value} ({fng.label}). {fngText}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong style={{ color: 'var(--text)' }}>What I&apos;m Watching:</strong>{' '}
                          {trending.length > 0 && <>Trending coins right now: {trending.map(t => t.symbol.toUpperCase()).join(', ')}. </>}
                          {fng.value < 40 ? 'In this fearful environment, I\'m watching for oversold bounces on quality assets — BTC and ETH near support levels are the highest-probability setups. Don\'t try to catch falling knives on small caps.' :
                           fng.value < 60 ? 'With neutral sentiment, I\'m focused on individual chart setups rather than directional bets. Look for coins with clear support levels and accumulation patterns. This is a stock-picker\'s market.' :
                           'With elevated sentiment, I\'m being selective. If you\'re entering new positions, keep them small and use tight stops. This is the time to let winners ride but lock in gains on extended moves.'}
                          {' '}Keep an eye on macro — Fed commentary, bond yields, and equity markets all influence crypto risk appetite. Gold and the dollar index are key correlation plays right now.
                        </p>
                        <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--accent)', fontSize: '12px', textAlign: 'right', paddingTop: '4px' }}>
                          {(() => {
                            const signoffs = [
                              'Stay sharp, stay patient, and let the charts do the talking.',
                              'Trade the plan, not the emotion. I\'ll be watching so you don\'t have to.',
                              'Remember — the best trade is the one you don\'t rush into.',
                              'Markets reward the patient. I\'ll keep my eyes on the screens.',
                              'Protect your capital, trust your setups, and let the winners run.',
                              'The market will always be here tomorrow. Trade smart, not hard.',
                              'Discipline today, gains tomorrow. That\'s the Penny way.',
                            ];
                            // Use day of year as seed for consistent daily rotation
                            const now = new Date();
                            const start = new Date(now.getFullYear(), 0, 0);
                            const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
                            return signoffs[dayOfYear % signoffs.length];
                          })()}
                          <br />
                          <span style={{ fontWeight: 600, fontStyle: 'normal' }}>— Penny 🐱</span>
                        </p>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </section>

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

                {/* TBO PRO Toggle moved to board page */}

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
                          paddingLeft: 0,
                          borderLeft: 'none',
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
    </div>
  );
}
