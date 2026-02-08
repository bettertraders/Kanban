'use client';

import { useState, useEffect } from 'react';
import { X, Save, Trash2, Tag, Flag } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Task {
  id: number;
  title: string;
  description?: string;
  notes?: string;
  column_name: string;
  priority: string;
  assigned_to?: number;
  assigned_to_name?: string;
  labels: string[];
  due_date?: string;
  created_by_name?: string;
  created_at?: string;
}

interface TaskComment {
  id: number;
  task_id: number;
  user_id?: number;
  content: string;
  created_at?: string;
  updated_at?: string;
  user_name?: string;
  user_avatar?: string;
}

interface TaskModalProps {
  task: Task;
  boardId: number;
  columns: string[];
  onClose: () => void;
}

const priorities = [
  { value: 'low', label: 'Low', color: 'bg-green-500' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { value: 'high', label: 'High', color: 'bg-red-500' },
];

export function TaskModal({ task, boardId, columns, onClose }: TaskModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [notes, setNotes] = useState(task.notes || '');
  const [column, setColumn] = useState(task.column_name);
  const [priority, setPriority] = useState(task.priority);
  const [labelInput, setLabelInput] = useState('');
  const [labels, setLabels] = useState<string[]>(() => {
    if (Array.isArray(task.labels)) return task.labels;
    if (typeof task.labels === 'string') return (task.labels as string).split(',').map(l => l.trim()).filter(Boolean);
    return [];
  });
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentInput, setCommentInput] = useState('');
  const [isCommenting, setIsCommenting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const loadComments = async () => {
    setCommentsLoading(true);
    try {
      const response = await fetch(`/api/v1/tasks/${task.id}/comments`);
      if (response.ok) {
        const data = await response.json();
        setComments(Array.isArray(data.comments) ? data.comments : []);
      }
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      await loadComments();
    };
    run();
  }, [task.id]);

  const handleAddComment = async () => {
    if (!commentInput.trim()) return;
    setIsCommenting(true);
    try {
      await fetch(`/api/v1/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentInput.trim() }),
      });
      setCommentInput('');
      await loadComments();
    } finally {
      setIsCommenting(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          notes,
          column_name: column,
          priority,
          labels,
        }),
      });
      router.refresh();
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this task? This cannot be undone.')) return;
    await fetch(`/api/v1/tasks/${task.id}`, { method: 'DELETE' });
    router.refresh();
    onClose();
  };

  const addLabel = () => {
    if (labelInput.trim() && !labels.includes(labelInput.trim())) {
      setLabels([...labels, labelInput.trim()]);
      setLabelInput('');
    }
  };

  const removeLabel = (label: string) => {
    setLabels(labels.filter(l => l !== label));
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold">Edit Task</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a more detailed description..."
              rows={4}
              className="w-full bg-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Comments */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Comments</label>
            <div className="space-y-3">
              {commentsLoading ? (
                <div className="text-sm text-slate-500">Loading comments...</div>
              ) : comments.length === 0 ? (
                <div className="text-sm text-slate-500">No comments yet.</div>
              ) : (
                comments.map(comment => (
                  <div key={comment.id} className="bg-slate-700 rounded-lg p-3 border border-slate-600">
                    <div className="flex items-start gap-3">
                      {comment.user_avatar ? (
                        <img
                          src={comment.user_avatar}
                          alt={comment.user_name || 'User'}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs text-slate-200">
                          {(comment.user_name || '?').charAt(0)}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-slate-200">
                            {comment.user_name || 'Unknown'}
                          </span>
                          <span className="text-xs text-slate-500">
                            {comment.created_at ? new Date(comment.created_at).toLocaleString() : ''}
                          </span>
                        </div>
                        <p className="text-sm text-slate-400 mt-1 whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
                placeholder="Write a comment..."
                className="flex-1 bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleAddComment}
                disabled={isCommenting || !commentInput.trim()}
                className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {isCommenting ? 'Posting...' : 'Comment'}
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Notes &amp; References</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add longer notes, links, or references..."
              rows={6}
              className="w-full bg-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Column & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                <Flag className="w-4 h-4 inline mr-1" />
                Status
              </label>
              <select
                value={column}
                onChange={(e) => setColumn(e.target.value)}
                className="w-full bg-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {columns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                <Flag className="w-4 h-4 inline mr-1" />
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {priorities.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Labels */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              <Tag className="w-4 h-4 inline mr-1" />
              Labels
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {labels.map(label => (
                <span key={label} className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded-lg text-sm flex items-center gap-1">
                  {label}
                  <button onClick={() => removeLabel(label)} className="hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLabel())}
                placeholder="Add a label..."
                className="flex-1 bg-slate-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button 
                onClick={addLabel}
                className="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg text-sm"
              >
                Add
              </button>
            </div>
          </div>

          {/* Meta info */}
          {task.created_by_name && (
            <div className="text-xs text-slate-500 pt-2 border-t border-slate-700">
              Created by {task.created_by_name}
              {task.created_at && ` • ${new Date(task.created_at).toLocaleDateString()}`}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-700">
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading || !title.trim()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
