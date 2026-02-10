'use client';

import { useEffect, useState } from 'react';
// TradingNav and PriceTicker moved to shared layout

type JournalEntry = {
  id: number;
  entry_type: string;
  content: string;
  mood?: string | null;
  created_at: string;
  created_by_name?: string | null;
  board_name?: string | null;
  coin_pair?: string | null;
};

function formatDate(ts: string) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function TradingJournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/v1/trading/journal?limit=200');
        const json = await res.json();
        setEntries(Array.isArray(json?.entries) ? json.entries : []);
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <>
    <div style={{ padding: '0 clamp(20px, 4vw, 48px) 40px', maxWidth: '1400px', margin: '0 auto' }}>

      <section style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px' }}>
        {loading && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Loading entries...</div>}
        {!loading && entries.length === 0 && (
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>No journal entries yet.</div>
        )}
        <div style={{ display: 'grid', gap: '14px' }}>
          {entries.map((entry) => (
            <div key={entry.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  {entry.board_name || 'Board'} · {entry.coin_pair || 'Trade'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatDate(entry.created_at)}</div>
              </div>
              <div style={{ marginTop: '6px', fontSize: '13px', fontWeight: 600 }}>
                {entry.entry_type} {entry.mood ? `· ${entry.mood}` : ''}
              </div>
              <div style={{ marginTop: '6px', fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}>
                {entry.content}
              </div>
              <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--muted)' }}>
                {entry.created_by_name || 'Trader'}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
    </>
  );
}
