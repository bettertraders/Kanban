'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ApiKeysPage() {
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setError('');
    setNewKey('');

    try {
      const res = await fetch('/api/v1/auth/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate key');
      }

      const data = await res.json();
      setNewKey(data.apiKey);
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ padding: '32px clamp(20px, 4vw, 48px) 40px', maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <Link href="/" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '20px' }}>←</Link>
        <h1 style={{ fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 600, letterSpacing: '0.02em' }}>
          🔑 API Keys
        </h1>
      </div>

      <div style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '16px',
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>Generate New API Key</h2>
        <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '16px' }}>
          API keys allow bots and scripts to access your boards. Keys are shown only once when created.
        </p>

        {error && (
          <div style={{
            marginBottom: '16px', padding: '12px',
            background: 'rgba(240, 91, 111, 0.1)', border: '1px solid rgba(240, 91, 111, 0.2)',
            borderRadius: '10px', color: 'var(--danger)', fontSize: '13px',
          }}>
            {error}
          </div>
        )}

        {newKey && (
          <div style={{
            marginBottom: '16px', padding: '16px',
            background: 'rgba(58, 193, 124, 0.1)', border: '1px solid rgba(58, 193, 124, 0.2)',
            borderRadius: '10px',
          }}>
            <p style={{ color: 'var(--success)', fontSize: '13px', marginBottom: '8px' }}>
              ⚠️ Save this key now! It won&apos;t be shown again.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <code style={{
                flex: 1, background: 'var(--panel-2)', padding: '10px 12px',
                borderRadius: '10px', fontSize: '13px', fontFamily: 'monospace',
                wordBreak: 'break-all', border: '1px solid var(--border)',
              }}>
                {newKey}
              </code>
              <button
                onClick={handleCopy}
                style={{
                  padding: '10px 14px', borderRadius: '10px',
                  background: 'var(--panel-2)', border: '1px solid var(--border)',
                  color: copied ? 'var(--success)' : 'var(--text)',
                  cursor: 'pointer', fontSize: '14px',
                }}
              >
                {copied ? '✓' : '📋'}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleGenerate} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g., Penny Bot)"
            required
            style={{
              flex: 1, padding: '10px 12px', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'var(--panel-2)',
              color: 'var(--text)', fontSize: '14px', fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !name.trim()}
            style={{
              background: 'linear-gradient(135deg, var(--accent), #9a9cff)',
              color: '#0d0d1f', border: 'none', padding: '10px 18px',
              borderRadius: '999px', fontWeight: 600, cursor: 'pointer',
              fontSize: '14px', opacity: isLoading || !name.trim() ? 0.5 : 1,
            }}
          >
            {isLoading ? 'Generating...' : 'Generate'}
          </button>
        </form>
      </div>

      <div style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '24px',
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>Using API Keys</h2>
        <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '16px' }}>
          Include your API key in the <code style={{ background: 'var(--panel-2)', padding: '2px 6px', borderRadius: '4px' }}>Authorization</code> header:
        </p>
        <pre style={{
          background: 'var(--panel-2)', padding: '16px', borderRadius: '10px',
          fontSize: '12px', overflow: 'auto', border: '1px solid var(--border)',
          lineHeight: 1.5,
        }}>
{`curl -X GET https://your-url/api/v1/boards \\
  -H "Authorization: Bearer kb_your_key_here"

# Create a task
curl -X POST https://your-url/api/v1/tasks \\
  -H "Authorization: Bearer kb_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"boardId": 1, "title": "New task"}'`}
        </pre>
      </div>
    </div>
  );
}
