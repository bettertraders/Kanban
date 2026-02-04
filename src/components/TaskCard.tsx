'use client';

import { useState } from 'react';
import { MoreHorizontal, Trash2, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Task {
  id: number;
  title: string;
  description?: string;
  column_name: string;
  priority: string;
  assigned_to_name?: string;
  assigned_to_avatar?: string;
  labels: string[];
  due_date?: string;
}

interface TaskCardProps {
  task: Task;
  boardId: number;
}

const priorityColors: Record<string, string> = {
  low: 'border-l-green-500',
  medium: 'border-l-yellow-500',
  high: 'border-l-red-500',
};

export function TaskCard({ task, boardId }: TaskCardProps) {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Delete this task?')) return;
    
    await fetch(`/api/v1/tasks/${task.id}`, { method: 'DELETE' });
    router.refresh();
  };

  const handleMove = async (newColumn: string) => {
    await fetch(`/api/v1/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column_name: newColumn }),
    });
    setIsMoving(false);
    router.refresh();
  };

  const columns = ['Backlog', 'Planned', 'In Progress', 'Done'];

  return (
    <div className={`bg-slate-700 rounded-lg p-3 border-l-4 ${priorityColors[task.priority] || 'border-l-slate-500'}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium flex-1">{task.title}</h3>
        <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="text-slate-400 hover:text-white p-1"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          
          {isMenuOpen && (
            <div className="absolute right-0 top-6 bg-slate-800 rounded-lg shadow-lg border border-slate-600 py-1 z-10 min-w-[120px]">
              <button
                onClick={() => { setIsMoving(true); setIsMenuOpen(false); }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-700 flex items-center gap-2"
              >
                <ChevronRight className="w-4 h-4" />
                Move
              </button>
              <button
                onClick={handleDelete}
                className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}
          
          {isMoving && (
            <div className="absolute right-0 top-6 bg-slate-800 rounded-lg shadow-lg border border-slate-600 py-1 z-10 min-w-[140px]">
              {columns.filter(c => c !== task.column_name).map(column => (
                <button
                  key={column}
                  onClick={() => handleMove(column)}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-700"
                >
                  {column}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {task.description && (
        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>
      )}
      
      <div className="flex items-center gap-2 mt-2">
        {task.assigned_to_avatar && (
          <img 
            src={task.assigned_to_avatar} 
            alt={task.assigned_to_name || ''} 
            className="w-5 h-5 rounded-full"
            title={task.assigned_to_name}
          />
        )}
        {task.labels && task.labels.length > 0 && (
          <div className="flex gap-1">
            {(task.labels as string[]).slice(0, 2).map((label, i) => (
              <span key={i} className="text-xs bg-slate-600 px-1.5 py-0.5 rounded">
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
