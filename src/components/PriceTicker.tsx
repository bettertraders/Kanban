'use client';

import { useEffect, useState } from 'react';

type TickerCoin = { symbol: string; price: number; change24h: number };

const fmtPrice = (p: number) =>
  p >= 1
    ? p.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: p >= 100 ? 0 : 2, maximumFractionDigits: p >= 100 ? 0 : 2 })
    : `$${p.toFixed(4)}`;

function TickerContent({ coins }: { coins: TickerCoin[] }) {
  return (
    <>
      {coins.map((c, i) => {
        const up = c.change24h >= 0;
        return (
          <span key={`${c.symbol}-${i}`} style={{ whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 700, color: '#e2e2ff' }}>{c.symbol}</span>
            {' '}
            <span style={{ color: '#ccc' }}>{fmtPrice(c.price)}</span>
            {' '}
            <span style={{ color: up ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
              {up ? '▲' : '▼'}{Math.abs(c.change24h).toFixed(1)}%
            </span>
            <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 16px' }}>·</span>
          </span>
        );
      })}
    </>
  );
}

export default function PriceTicker() {
  const [coins, setCoins] = useState<TickerCoin[]>([]);

  useEffect(() => {
    const load = () =>
      fetch('/api/trading/ticker')
        .then((r) => r.json())
        .then((d) => { if (d.coins?.length) setCoins(d.coins); })
        .catch(() => {});
    load();
    const iv = setInterval(load, 3 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  if (!coins.length) return null;

  return (
    <div
      style={{
        width: '100%',
        height: 38,
        background: 'linear-gradient(90deg, rgba(0,0,0,0.35), rgba(20,20,50,0.4))',
        borderBottom: '1px solid rgba(123,125,255,0.1)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        fontSize: 12.5,
        fontFamily: 'inherit',
        position: 'relative',
      }}
    >
      <div className="ticker-scroll">
        <div className="ticker-track">
          <TickerContent coins={coins} />
          <TickerContent coins={coins} />
        </div>
      </div>
      <style jsx global>{`
        .ticker-scroll {
          width: 100%;
          overflow: hidden;
        }
        .ticker-track {
          display: flex;
          width: max-content;
          animation: ticker-marquee 28s linear infinite;
        }
        @keyframes ticker-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
