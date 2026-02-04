'use client';

import { useState } from 'react';
import { TaskModal } from './TaskModal';

interface Task {
  id: number;
  title: string;
  description?: string;
  column_name: string;
  priority: string;
  assigned_to?: number;
  assigned_to_name?: string;
  assigned_to_avatar?: string;
  labels: string[];
  due_date?: string;
  created_by_name?: string;
  created_at?: string;
}

interface TaskCardProps {
  task: Task;
  boardId: number;
  columns: string[];
}

const priorityColors: Record<string, string> = {
  low: 'border-l-green-500',
  medium: 'border-l-yellow-500',
  high: 'border-l-red-500',
};

const priorityDots: Record<string, string> = {
  low: 'bg-green-500',
  medium: 'bg-yellow-500',
  high: 'bg-red-500',
};

export function TaskCard({ task, boardId, columns }: TaskCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div 
        onClick={() => setIsModalOpen(true)}
        className={`bg-slate-700 rounded-lg p-3 border-l-4 ${priorityColors[task.priority] || 'border-l-slate-500'} cursor-pointer hover:bg-slate-600 transition-colors group`}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium flex-1">{task.title}</h3>
          <span className={`w-2 h-2 rounded-full ${priorityDots[task.priority] || 'bg-slate-500'} flex-shrink-0 mt-1.5`} />
        </div>
        
        {task.description && (
          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>
        )}
        
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {task.assigned_to_name && (
            <div className="flex items-center gap-1">
              {task.assigned_to_avatar ? (
                <img 
                  src={task.assigned_to_avatar} 
                  alt={task.assigned_to_name} 
                  className="w-5 h-5 rounded-full"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center text-xs">
                  {task.assigned_to_name.charAt(0)}
                </div>
              )}
              <span className="text-xs text-slate-400">{task.assigned_to_name}</span>
            </div>
          )}
          {task.labels && (() => {
            const labelArr = Array.isArray(task.labels) 
              ? task.labels 
              : typeof task.labels === 'string' 
                ? (task.labels as string).split(',').map(l => l.trim()).filter(Boolean)
                : [];
            return labelArr.length > 0 ? (
              <div className="flex gap-1 flex-wrap">
                {labelArr.slice(0, 3).map((label, i) => (
                  <span key={i} className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                    {label}
                  </span>
                ))}
              </div>
            ) : null;
          })()}
        </div>
      </div>
      
      {isModalOpen && (
        <TaskModal 
          task={task} 
          boardId={boardId} 
          columns={columns}
          onClose={() => setIsModalOpen(false)} 
        />
      )}
    </>
  );
}
