'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface NewTaskFormProps {
  boardId: number;
  column: string;
}

export function NewTaskForm({ boardId, column }: NewTaskFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsLoading(true);
    try {
      await fetch('/api/v1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId,
          title: title.trim(),
          column,
        }),
      });
      setTitle('');
      setIsOpen(false);
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg flex items-center gap-2 text-sm"
      >
        <Plus className="w-4 h-4" />
        Add task
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-700 rounded-lg p-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title..."
        className="w-full bg-slate-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
        disabled={isLoading}
      />
      <div className="flex items-center justify-between mt-2">
        <button
          type="submit"
          disabled={isLoading || !title.trim()}
          className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm font-medium disabled:opacity-50"
        >
          {isLoading ? 'Adding...' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => { setIsOpen(false); setTitle(''); }}
          className="text-slate-400 hover:text-white p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
