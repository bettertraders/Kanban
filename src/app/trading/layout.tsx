'use client';

import { usePathname } from 'next/navigation';
import { TradingNav } from '@/components/TradingNav';
import PriceTicker from '@/components/PriceTicker';

type PageMeta = {
  title: string;
  subtitle: string;
  activeTab: 'dashboard' | 'board' | 'bots' | 'leaderboard' | 'journal' | 'market';
};

function getPageMeta(pathname: string): PageMeta {
  if (pathname === '/trading/market') return { title: 'Market Overview', subtitle: 'Live Data & Sentiment', activeTab: 'market' };
  if (pathname === '/trading/history') return { title: 'Trade History', subtitle: 'Past Trades & Notes', activeTab: 'journal' };
  if (pathname.match(/^\/trading\/\d+$/) || pathname === '/trading/trades') return { title: 'Trades', subtitle: 'Signal Board & Execution', activeTab: 'board' };
  return { title: 'ClawDesk Trading', subtitle: 'Configure & Monitor', activeTab: 'dashboard' };
}

export default function TradingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { title, subtitle, activeTab } = getPageMeta(pathname);

  return (
    <>
      <PriceTicker />
      <div style={{ opacity: 0, animation: 'fadeIn 0.2s ease forwards' }}>
        <div style={{
          padding: '32px clamp(20px, 4vw, 48px) 0',
          maxWidth: pathname.match(/^\/trading\/\d+$/) ? '1720px' : '1400px',
          margin: '0 auto',
        }}>
          <header style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img src="/icons/clawdesk-mark.png" alt="" style={{ width: '48px', height: '48px', borderRadius: '10px' }} />
              <div>
                <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 36px)' }}>{title}</h1>
                <div style={{ color: 'var(--muted)', fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                  {subtitle}
                </div>
              </div>
            </div>
          </header>
          <TradingNav activeTab={activeTab} />
        </div>
        {children}
      </div>
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
