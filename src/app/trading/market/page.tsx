'use client';

import { useCallback, useEffect, useState } from 'react';
import { TradingNav } from '@/components/TradingNav';

/* ── types ── */
type Coin = {
  id: string; name: string; symbol: string; image: string;
  price: number; change24h: number; change7d: number | null;
  marketCap: number; volume: number;
};
type TrendingCoin = { name: string; symbol: string; thumb: string; marketCapRank: number; priceBtc: number };
type MarketData = {
  overview: {
    btc: Coin; eth: Coin;
    totalMarketCap: number; btcDominance: number;
    fearGreed: { value: number; label: string };
  };
  movers: { gainers: Coin[]; losers: Coin[]; volatile: Coin[] };
  discovery: { trending: TrendingCoin[]; topVolume: Coin[]; topMarketCap: Coin[] };
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

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  return (
    <div style={{ minHeight: '100vh', background: '#141428', color: '#e2e2ff', padding: '20px 16px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <TradingNav activeTab={'dashboard' as any} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            📊 Market Overview
          </h1>
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

        {loading && !data && <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>Loading market data…</div>}
        {error && !data && <div style={{ textAlign: 'center', padding: 60, color: '#ef4444' }}>Error: {error}</div>}

        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>

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
      </div>
    </div>
  );
}
