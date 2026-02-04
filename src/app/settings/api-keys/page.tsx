'use client';

import { useState } from 'react';
import { ArrowLeft, Key, Copy, Check } from 'lucide-react';
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
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/" className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold">API Keys</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 mb-6">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Key className="w-5 h-5" />
            Generate New API Key
          </h2>
          
          <p className="text-slate-400 text-sm mb-4">
            API keys allow bots and scripts to access your boards. Keys are shown only once when created.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {newKey && (
            <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-green-400 text-sm mb-2">
                ⚠️ Save this key now! It won&apos;t be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-slate-900 p-2 rounded text-sm font-mono break-all">
                  {newKey}
                </code>
                <button
                  onClick={handleCopy}
                  className="p-2 bg-slate-700 rounded hover:bg-slate-600"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleGenerate} className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Key name (e.g., Penny Bot)"
              className="flex-1 bg-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {isLoading ? 'Generating...' : 'Generate'}
            </button>
          </form>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-lg font-medium mb-4">Using API Keys</h2>
          
          <p className="text-slate-400 text-sm mb-4">
            Include your API key in requests using the <code className="bg-slate-700 px-1 rounded">x-api-key</code> header:
          </p>
          
          <pre className="bg-slate-900 p-4 rounded-lg text-sm overflow-x-auto">
{`curl -X GET https://your-kanban-url/api/v1/boards \\
  -H "x-api-key: kb_your_key_here"

# Create a task
curl -X POST https://your-kanban-url/api/v1/tasks \\
  -H "x-api-key: kb_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"boardId": 1, "title": "New task", "column": "In Progress"}'`}
          </pre>
        </div>
      </main>
    </div>
  );
}
