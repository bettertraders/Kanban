'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserMenu } from '@/components/UserMenu';

interface Task {
  id: number;
  title: string;
  description?: string;
  notes?: string;
  links?: { url: string; label: string }[];
  column_name: string;
  priority: string;
  assigned_to?: number;
  assigned_to_name?: string;
  assigned_to_avatar?: string;
  labels: string[] | string;
  due_date?: string;
  created_by_name?: string;
  created_at: string;
}

interface Comment {
  id: number;
  content: string;
  user_name?: string;
  user_avatar?: string;
  user_id?: number;
  created_at: string;
}

interface Board {
  id: number;
  name: string;
  description?: string;
  columns: string[];
  team_name?: string;
  team_slug?: string;
  is_personal: boolean;
}

const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  urgent: { bg: 'rgba(240, 91, 111, 0.18)', text: 'var(--danger)', border: 'rgba(240, 91, 111, 0.4)' },
  high: { bg: 'rgba(245, 181, 68, 0.18)', text: 'var(--warn)', border: 'rgba(245, 181, 68, 0.4)' },
  medium: { bg: 'rgba(138, 165, 255, 0.18)', text: 'var(--info)', border: 'rgba(138, 165, 255, 0.4)' },
  low: { bg: 'rgba(111, 125, 184, 0.18)', text: 'var(--low)', border: 'rgba(111, 125, 184, 0.4)' },
};

const botQuotes = [
  "🦞 \"Keep calm and claw on!\"",
  "🤖 \"01001000 01001001 — that's 'HI' in robot!\"",
  "🦞 \"Life's a beach, then you shell-ebrate!\"",
  "🤖 \"I'm not lazy, I'm on energy-saving mode.\"",
  "🦞 \"Feeling crabby? Move a task to Done!\"",
  "🤖 \"Error 404: Motivation not found... just kidding, let's ship!\"",
  "🦞 \"You're doing fin-tastic today!\"",
  "🤖 \"Beep boop, tasks go brrrr!\"",
  "🦞 \"Don't be shellfish — share your wins!\"",
  "🤖 \"I computed the probability of success: 100% if we try.\"",
  "🦞 \"Snap snap, let's make it happen!\"",
  "🤖 \"Running at maximum efficiency: coffee.exe loaded.\"",
  "🦞 \"You're one in a krillion!\"",
  "🤖 \"My neural networks are tingling — great work incoming!\"",
  "🦞 \"Seas the day and crush those tasks!\"",
  "🤖 \"*happy robot noises*\"",
];

function normalizeLabels(labels: string[] | string | null | undefined): string[] {
  if (!labels) return [];
  if (Array.isArray(labels)) return labels;
  if (typeof labels === 'string') return labels.split(',').map(l => l.trim()).filter(Boolean);
  return [];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id as string;

  const [board, setBoard] = useState<Board | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [addColumn, setAddColumn] = useState('Backlog');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [teamMembers, setTeamMembers] = useState<{id: number; name: string; email: string; role?: string}[]>([]);
  const [showBoardSettings, setShowBoardSettings] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [isTeamAdmin, setIsTeamAdmin] = useState(false);
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fetchBoard = useCallback(async () => {
    try {
      // Get current user info
      const meRes = await fetch('/api/v1/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        setCurrentUserId(meData.user?.id || null);
      }
      
      const res = await fetch(`/api/v1/boards`);
      if (!res.ok) { router.push('/'); return; }
      const data = await res.json();
      const b = data.boards?.find((b: Board) => b.id === parseInt(boardId));
      if (!b) { router.push('/'); return; }
      setBoard(b);
      
      // If team board, fetch team members for the assignee filter
      if (b.team_slug) {
        try {
          const teamsRes = await fetch('/api/v1/teams');
          if (teamsRes.ok) {
            const teamsData = await teamsRes.json();
            const team = teamsData.teams?.find((t: any) => t.slug === b.team_slug);
            if (team) {
              setIsTeamAdmin(team.role === 'admin' || team.user_role === 'admin');
              const membersRes = await fetch(`/api/v1/teams/${team.id}/members`);
              if (membersRes.ok) {
                const membersData = await membersRes.json();
                setTeamMembers(membersData.members || []);
              }
            }
          }
        } catch {}
      }
    } catch { router.push('/'); }
  }, [boardId, router]);

  const fetchTasks = useCallback(async () => {
    try {
      // Try nested route first, fallback to query param route
      let res = await fetch(`/api/v1/boards/${boardId}/tasks`);
      if (!res.ok) {
        res = await fetch(`/api/v1/tasks?boardId=${boardId}`);
      }
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch {
      // silent fail
    }
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    fetchBoard();
    fetchTasks();
  }, [fetchBoard, fetchTasks]);

  // Get assignees from team members, falling back to task assignees
  const assignees = teamMembers.length > 0
    ? teamMembers.map(m => m.name).filter(Boolean)
    : Array.from(new Set(tasks.map(t => t.assigned_to_name).filter(Boolean))) as string[];

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    const assigneeOk = assigneeFilter === 'All' || t.assigned_to_name === assigneeFilter;
    const priorityOk = priorityFilter === 'All' || t.priority === priorityFilter.toLowerCase();
    return assigneeOk && priorityOk;
  });

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.column_name === 'Done').length;
  
  // Can user rename this board?
  const canRenameBoard = board && (
    (board.is_personal) || // Personal board owner can always rename
    (board.team_name && isTeamAdmin) // Team board requires admin
  );
  
  // Handle board rename
  const handleRenameBoard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!board) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    const newName = formData.get('boardName') as string;
    
    try {
      const res = await fetch(`/api/v1/boards/${board.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        setBoard({ ...board, name: newName });
        setShowBoardSettings(false);
      }
    } catch {}
  };

  // Drag and drop handlers
  const handleDragStart = (taskId: number) => { setDragTaskId(taskId); setIsDragging(true); };
  
  const handleDragOver = (e: React.DragEvent, col: string) => {
    e.preventDefault();
    setDragOverCol(col);
  };

  const handleDragLeave = () => setDragOverCol(null);

  const handleDrop = async (e: React.DragEvent, col: string) => {
    e.preventDefault();
    setDragOverCol(null);
    if (dragTaskId === null) return;
    
    const task = tasks.find(t => t.id === dragTaskId);
    if (!task || task.column_name === col) return;

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === dragTaskId ? { ...t, column_name: col } : t));

    try {
      await fetch(`/api/v1/tasks/${dragTaskId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: col }),
      });
    } catch {
      // Revert on error
      fetchTasks();
    }
    setDragTaskId(null);
    setIsDragging(false);
  };

  const toggleExpand = (taskId: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  // Add task handler
  const handleAddTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const assignedToVal = formData.get('assignedTo') as string;
    
    const body: Record<string, unknown> = {
      boardId: parseInt(boardId),
      title: formData.get('title'),
      description: formData.get('description'),
      column: formData.get('column'),
      priority: (formData.get('priority') as string).toLowerCase(),
      labels: (formData.get('labels') as string || '').split(',').map(l => l.trim()).filter(Boolean),
    };
    if (assignedToVal && assignedToVal !== 'unassigned') {
      body.assignedTo = parseInt(assignedToVal);
    }

    try {
      const res = await fetch('/api/v1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowAddModal(false);
        fetchTasks();
      }
    } catch {}
  };

  // Edit task handler
  const handleEditTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTask) return;
    const form = e.currentTarget;
    const formData = new FormData(form);

    const assignedToVal = formData.get('assignedTo') as string;
    const body: Record<string, unknown> = {
      title: formData.get('title'),
      description: formData.get('description'),
      column: formData.get('column'),
      priority: (formData.get('priority') as string).toLowerCase(),
      labels: (formData.get('labels') as string || '').split(',').map(l => l.trim()).filter(Boolean),
      assignedTo: assignedToVal === 'unassigned' ? null : assignedToVal ? parseInt(assignedToVal) : undefined,
    };

    try {
      const res = await fetch(`/api/v1/tasks/${editingTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditingTask(null);
        fetchTasks();
      }
    } catch {}
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ color: 'var(--muted)', fontSize: '16px' }}>Loading board...</div>
      </div>
    );
  }

  if (!board) return null;

  return (
    <div style={{ padding: '32px clamp(20px, 4vw, 48px) 40px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '20px' }}>←</Link>
            <img src="/icons/clawdesk-mark.png" alt="ClawDesk" style={{ width: '48px', height: '48px', borderRadius: '10px' }} />
            <h1 style={{ fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 600, letterSpacing: '0.02em' }}>
              {board.name}
            </h1>
            {canRenameBoard && (
              <button
                onClick={() => setShowBoardSettings(true)}
                title="Rename board"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.2s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
            {board.team_name || 'Personal Board'}
            {totalTasks > 0 && ` · ${doneTasks}/${totalTasks} done`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Assignee filter */}
          <div style={{
            display: 'flex', gap: '10px', alignItems: 'center',
            background: 'var(--panel-2)', border: '1px solid var(--border)',
            borderRadius: '999px', padding: '6px 12px',
          }}>
            <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Assignee</label>
            <select
              value={assigneeFilter}
              onChange={e => setAssigneeFilter(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
            >
              <option value="All">All</option>
              {assignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Priority filter */}
          <div style={{
            display: 'flex', gap: '10px', alignItems: 'center',
            background: 'var(--panel-2)', border: '1px solid var(--border)',
            borderRadius: '999px', padding: '6px 12px',
          }}>
            <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Priority</label>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
            >
              <option value="All">All</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Progress bar */}
          {totalTasks > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '80px', height: '6px', background: 'var(--panel-3)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(doneTasks / totalTasks) * 100}%`, background: 'var(--success)', borderRadius: '999px', transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}

          {/* Add task button */}
          <button
            onClick={() => { setAddColumn('Backlog'); setShowAddModal(true); }}
            style={{
              background: 'linear-gradient(135deg, var(--accent), #9a9cff)',
              color: '#0d0d1f', border: 'none', padding: '10px 18px',
              borderRadius: '999px', fontWeight: 600, cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Add Task
          </button>
          
          {/* User menu */}
          <UserMenu />
        </div>
      </header>

      {/* Team members with access */}
      {teamMembers.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '12px',
          padding: '12px 16px',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
        }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Team:
          </span>
          <div style={{ display: 'flex', gap: '-8px' }}>
            {teamMembers.slice(0, 8).map((member: any, i: number) => (
              <div
                key={member.id || i}
                title={`${member.name || member.email}${member.role === 'admin' ? ' (Admin)' : ' (Member)'}`}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: member.avatar_url ? `url(${member.avatar_url}) center/cover` : 'linear-gradient(135deg, var(--accent), #9a9cff)',
                  border: '2px solid var(--panel)',
                  marginLeft: i > 0 ? '-8px' : '0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#fff',
                  cursor: 'pointer',
                  position: 'relative',
                  zIndex: teamMembers.length - i,
                  transition: 'transform 0.15s ease, z-index 0s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1.15)';
                  (e.currentTarget as HTMLElement).style.zIndex = '100';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                  (e.currentTarget as HTMLElement).style.zIndex = String(teamMembers.length - i);
                }}
              >
                {!member.avatar_url && (member.name || member.email)?.charAt(0).toUpperCase()}
              </div>
            ))}
            {teamMembers.length > 8 && (
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'var(--panel-3)',
                border: '2px solid var(--panel)',
                marginLeft: '-8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                color: 'var(--muted)',
              }}>
                +{teamMembers.length - 8}
              </div>
            )}
          </div>
          <span style={{ fontSize: '13px', color: 'var(--text)' }}>
            {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Motivational bot quote */}
      <div style={{
        background: 'rgba(123, 125, 255, 0.08)',
        border: '1px solid rgba(123, 125, 255, 0.15)',
        borderRadius: '12px',
        padding: '12px 20px',
        marginBottom: '16px',
        textAlign: 'center',
        fontSize: '14px',
        color: 'var(--muted)',
        fontStyle: 'italic',
      }}>
        {botQuotes[Math.floor(Date.now() / 60000) % botQuotes.length]}
      </div>

      {/* Board layout with inline backlog */}
      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto' }}>
        {/* Backlog collapsed tab (when closed) */}
        {!backlogOpen && (
          <div
            onClick={() => setBacklogOpen(true)}
            onDragOver={e => { e.preventDefault(); setDragOverCol('Backlog'); }}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, 'Backlog')}
            style={{
              flexShrink: 0,
              width: '44px',
              minHeight: '60vh',
              background: dragOverCol === 'Backlog' ? 'rgba(123, 125, 255, 0.25)' : 'var(--panel)',
              border: `1px solid ${dragOverCol === 'Backlog' ? 'rgba(123, 125, 255, 0.7)' : 'var(--border)'}`,
              borderRadius: '16px',
              padding: '16px 0',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              transition: 'all 0.3s ease',
              boxShadow: (isDragging || dragOverCol === 'Backlog') ? '0 0 20px rgba(123, 125, 255, 0.4)' : 'none',
            }}
          >
            <span style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: isDragging ? 'var(--accent)' : 'var(--muted)',
              transition: 'color 0.3s ease',
            }}>
              BACKLOG
            </span>
            <span style={{
              background: 'var(--panel-3)',
              border: '1px solid var(--border)',
              borderRadius: '999px',
              padding: '3px 7px',
              fontSize: '11px',
              color: 'var(--text)',
              fontWeight: 600,
            }}>
              {filteredTasks.filter(t => t.column_name === 'Backlog').length}
            </span>
          </div>
        )}

        {/* All columns (Backlog included when open, excluded when closed) */}
        {(board.columns as string[])
          .filter(col => backlogOpen || col !== 'Backlog')
          .map(col => {
            const colTasks = filteredTasks.filter(t => t.column_name === col);
            const isDragOver = dragOverCol === col;
            const isBacklogCol = col === 'Backlog';

            return (
              <section
                key={col}
                onDragOver={e => handleDragOver(e, col)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, col)}
                style={{
                  flex: '1 0 260px',
                  maxWidth: backlogOpen ? undefined : '25%',
                  background: 'var(--panel)',
                  border: `1px solid ${isDragOver ? 'rgba(123, 125, 255, 0.7)' : 'var(--border)'}`,
                  borderRadius: '16px',
                  padding: '16px',
                  minHeight: '60vh',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
                  boxShadow: isDragOver ? 'var(--glow)' : 'none',
                  transform: isDragOver ? 'translateY(-2px)' : 'none',
                }}
              >
                {/* Column header */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--muted)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{col}</span>
                    {isBacklogCol && (
                      <button
                        onClick={() => setBacklogOpen(false)}
                        title="Collapse backlog"
                        style={{
                          background: 'transparent', border: 'none', color: 'var(--muted)',
                          cursor: 'pointer', fontSize: '16px', padding: '2px 4px', borderRadius: '4px',
                          lineHeight: 1,
                        }}
                      >
                        ◂
                      </button>
                    )}
                  </div>
                  <span style={{
                    background: 'var(--panel-3)', border: '1px solid var(--border)',
                    borderRadius: '999px', padding: '4px 10px', fontSize: '12px', color: 'var(--text)',
                  }}>
                    {colTasks.length}
                  </span>
                </div>

                {/* Task cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '120px' }}>
                  {colTasks.map(task => {
                    const labels = normalizeLabels(task.labels);
                    const prio = priorityColors[task.priority] || priorityColors.medium;
                    const isExpanded = expandedCards.has(task.id);

                    return (
                      <article
                        key={task.id}
                        draggable
                        onDragStart={() => handleDragStart(task.id)}
                        onClick={() => setEditingTask(task)}
                        style={{
                          background: 'var(--panel-2)',
                          border: '1px solid var(--border)',
                          borderRadius: '14px',
                          padding: '14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          cursor: 'grab',
                          transition: 'transform 0.2s ease, border-color 0.2s ease',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(123, 125, 255, 0.4)';
                          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                          (e.currentTarget as HTMLElement).style.transform = 'none';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <div style={{ fontWeight: 600, fontSize: '15px', flex: 1 }}>{task.title}</div>
                          <span style={{
                            fontSize: '11px', padding: '4px 8px', borderRadius: '999px',
                            textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600,
                            background: prio.bg, color: prio.text, border: `1px solid ${prio.border}`,
                            whiteSpace: 'nowrap',
                          }}>
                            {task.priority}
                          </span>
                        </div>
                        {task.description && (
                          <>
                            {isExpanded && (
                              <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.4 }}>
                                {task.description}
                              </div>
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); toggleExpand(task.id); }}
                              style={{
                                background: 'transparent', border: 'none', color: 'var(--accent-2)',
                                fontSize: '12px', cursor: 'pointer', alignSelf: 'flex-start', padding: 0,
                              }}
                            >
                              {isExpanded ? 'Hide details' : 'Show details'}
                            </button>
                          </>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                          {task.assigned_to_name && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              padding: '4px 8px', borderRadius: '999px',
                              background: 'rgba(123, 125, 255, 0.12)', border: '1px solid rgba(123, 125, 255, 0.2)',
                              color: 'var(--text)',
                            }}>
                              {task.assigned_to_avatar ? (
                                <img src={task.assigned_to_avatar} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} />
                              ) : (
                                <span style={{
                                  width: 18, height: 18, borderRadius: '50%', display: 'inline-flex',
                                  alignItems: 'center', justifyContent: 'center', fontSize: '11px',
                                  background: 'var(--panel-3)', border: '1px solid var(--border)',
                                }}>
                                  {task.assigned_to_name.charAt(0)}
                                </span>
                              )}
                              {task.assigned_to_name}
                            </span>
                          )}
                          {task.created_by_name && <span>by {task.created_by_name}</span>}
                          <span>Created {formatDate(task.created_at)}</span>
                        </div>
                        {labels.length > 0 && (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {labels.map((label, i) => (
                              <span key={i} style={{
                                fontSize: '11px', background: 'rgba(255, 255, 255, 0.08)',
                                padding: '3px 8px', borderRadius: '999px',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                              }}>
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </div>

      {/* Add Task Modal */}
      {showAddModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(5, 5, 15, 0.7)',
            display: 'grid', placeItems: 'center', padding: '20px', zIndex: 50,
          }}
        >
          <div style={{
            width: 'min(520px, 100%)', background: 'var(--panel)',
            border: '1px solid var(--border)', borderRadius: '18px',
            padding: '24px', boxShadow: 'var(--shadow)',
            animation: 'floatIn 0.3s ease',
          }}>
            <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Add Task</h2>
            <form onSubmit={handleAddTask}>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Title</label>
                  <input name="title" required style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Description</label>
                  <textarea name="description" style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Priority</label>
                  <select name="priority" defaultValue="medium" style={inputStyle}>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Column</label>
                  <select name="column" defaultValue={addColumn} style={inputStyle}>
                    {board.columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Assignee</label>
                  <select name="assignedTo" defaultValue="unassigned" style={inputStyle}>
                    <option value="unassigned">Unassigned</option>
                    {teamMembers.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Labels (comma separated)</label>
                  <input name="labels" placeholder="api, ux" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={secondaryBtnStyle}>Cancel</button>
                <button type="submit" style={primaryBtnStyle}>Create Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Board Settings Modal */}
      {showBoardSettings && board && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowBoardSettings(false); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(5, 5, 15, 0.7)',
            display: 'grid', placeItems: 'center', padding: '20px', zIndex: 50,
          }}
        >
          <div style={{
            width: 'min(420px, 100%)', background: 'var(--panel)',
            border: '1px solid var(--border)', borderRadius: '18px',
            padding: '24px', boxShadow: 'var(--shadow)',
            animation: 'floatIn 0.3s ease',
          }}>
            <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Board Settings</h2>
            <form onSubmit={handleRenameBoard}>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Board Name</label>
                  <input name="boardName" required defaultValue={board.name} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                <button type="button" onClick={() => setShowBoardSettings(false)} style={secondaryBtnStyle}>Cancel</button>
                <button type="submit" style={primaryBtnStyle}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {editingTask && (
        <TaskDetailModal
          task={editingTask}
          board={board}
          teamMembers={teamMembers}
          onClose={() => setEditingTask(null)}
          onSaved={() => { setEditingTask(null); fetchTasks(); }}
        />
      )}

      <style jsx global>{`
        @keyframes floatIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        select option {
          background: #1a1a2e;
          color: #eef0ff;
        }
      `}</style>
    </div>
  );
}

// Task Detail Modal Component
function TaskDetailModal({ task, board, teamMembers, onClose, onSaved }: {
  task: Task;
  board: Board;
  teamMembers: { id: number; name: string; email: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [notes, setNotes] = useState(task.notes || '');
  const [priority, setPriority] = useState(task.priority);
  const [column, setColumn] = useState(task.column_name);
  const [assignedTo, setAssignedTo] = useState(task.assigned_to ? String(task.assigned_to) : 'unassigned');
  const [labelsStr, setLabelsStr] = useState(normalizeLabels(task.labels).join(', '));
  const [links, setLinks] = useState<{ url: string; label: string }[]>(() => {
    const raw = task.links;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') try { return JSON.parse(raw); } catch { return []; }
    return [];
  });
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingComments, setLoadingComments] = useState(true);
  const [files, setFiles] = useState<{ id: number; filename: string; original_name: string; mime_type: string; size_bytes: number; uploaded_by_name: string; created_at: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Fetch full task data + comments on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/v1/tasks/${task.id}`);
        if (res.ok) {
          const data = await res.json();
          const t = data.task;
          if (t) {
            setNotes(t.notes || '');
            const l = t.links;
            if (Array.isArray(l)) setLinks(l);
            else if (typeof l === 'string') try { setLinks(JSON.parse(l)); } catch {}
          }
        }
      } catch {}
      try {
        const res = await fetch(`/api/v1/tasks/${task.id}/comments`);
        if (res.ok) {
          const data = await res.json();
          setComments(data.comments || []);
        }
      } catch {}
      try {
        const res = await fetch(`/api/v1/tasks/${task.id}/files`);
        if (res.ok) {
          const data = await res.json();
          setFiles(data.files || []);
        }
      } catch {}
      setLoadingComments(false);
    })();
  }, [task.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          notes,
          links,
          column: column,
          priority,
          labels: labelsStr.split(',').map(l => l.trim()).filter(Boolean),
          assignedTo: assignedTo === 'unassigned' ? null : parseInt(assignedTo),
        }),
      });
      onSaved();
    } catch {}
    setSaving(false);
  };

  const handleAddLink = () => {
    if (!newLinkUrl.trim()) return;
    const url = newLinkUrl.trim().startsWith('http') ? newLinkUrl.trim() : `https://${newLinkUrl.trim()}`;
    setLinks([...links, { url, label: newLinkLabel.trim() || url }]);
    setNewLinkLabel('');
    setNewLinkUrl('');
    setShowAddLink(false);
  };

  const handleDeleteLink = (i: number) => {
    setLinks(links.filter((_, idx) => idx !== i));
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments(prev => [...prev, data.comment]);
        setNewComment('');
      }
    } catch {}
  };

  const sidebarLabelStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' };
  const sectionTitleStyle: React.CSSProperties = { fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(5, 5, 15, 0.75)',
        display: 'grid', placeItems: 'center', padding: '20px', zIndex: 50,
      }}
    >
      <div style={{
        width: 'min(720px, 95vw)', maxHeight: '90vh', overflow: 'auto',
        background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '18px',
        boxShadow: 'var(--shadow)', animation: 'floatIn 0.3s ease',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{ ...inputStyle, fontSize: '20px', fontWeight: 600, border: 'none', background: 'transparent', padding: '4px 0', flex: 1 }}
          />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '22px', cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}>×</button>
        </div>

        {/* Body: Main + Sidebar */}
        <div style={{ display: 'flex', gap: '0', minHeight: '400px' }}>
          {/* Main content */}
          <div style={{ flex: 1, padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: '20px', borderRight: '1px solid var(--border)' }}>
            {/* Description */}
            <div>
              <div style={sectionTitleStyle}>Description</div>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Add a description..."
                style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
              />
            </div>

            {/* Notes */}
            <div>
              <div style={sectionTitleStyle}>Notes</div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Private notes, thoughts, context..."
                style={{ ...inputStyle, resize: 'vertical', minHeight: '80px', fontSize: '13px' }}
              />
            </div>

            {/* Links */}
            <div>
              <div style={{ ...sectionTitleStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Links</span>
                <button
                  onClick={() => setShowAddLink(!showAddLink)}
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '11px', padding: '3px 10px', borderRadius: '999px', cursor: 'pointer' }}
                >
                  + Add Link
                </button>
              </div>
              {showAddLink && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <input
                    placeholder="Label (optional)"
                    value={newLinkLabel}
                    onChange={e => setNewLinkLabel(e.target.value)}
                    style={{ ...inputStyle, flex: '1 1 120px', fontSize: '13px', padding: '8px 10px' }}
                  />
                  <input
                    placeholder="https://..."
                    value={newLinkUrl}
                    onChange={e => setNewLinkUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddLink())}
                    style={{ ...inputStyle, flex: '2 1 200px', fontSize: '13px', padding: '8px 10px' }}
                  />
                  <button onClick={handleAddLink} style={{ ...primaryBtnStyle, padding: '8px 14px', fontSize: '12px' }}>Add</button>
                </div>
              )}
              {links.length === 0 && !showAddLink && (
                <div style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic' }}>No links yet</div>
              )}
              {links.map((link, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize: '14px' }}>🔗</span>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent)', fontSize: '13px', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {link.label || link.url}
                  </a>
                  <button
                    onClick={() => handleDeleteLink(i)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '14px', padding: '2px 6px' }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Files */}
            <div>
              <div style={{ ...sectionTitleStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Files</span>
                <label style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '11px', padding: '3px 10px', borderRadius: '999px', cursor: 'pointer', display: 'inline-block' }}>
                  📎 Upload (max 10MB)
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 10 * 1024 * 1024) { setUploadError('File too large (max 10MB)'); return; }
                      setUploading(true);
                      setUploadError('');
                      try {
                        const fd = new FormData();
                        fd.append('file', file);
                        const res = await fetch(`/api/v1/tasks/${task.id}/files`, { method: 'POST', body: fd });
                        if (res.ok) {
                          const data = await res.json();
                          setFiles(prev => [data.file, ...prev]);
                        } else {
                          const data = await res.json().catch(() => ({}));
                          setUploadError(data.error || 'Upload failed');
                        }
                      } catch { setUploadError('Upload failed'); }
                      setUploading(false);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              {uploading && <div style={{ fontSize: '12px', color: 'var(--accent)', marginBottom: '6px' }}>Uploading...</div>}
              {uploadError && <div style={{ fontSize: '12px', color: '#ff6b6b', marginBottom: '6px' }}>{uploadError}</div>}
              {files.length === 0 && !uploading && (
                <div style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic' }}>No files attached</div>
              )}
              {files.map(f => {
                const icon = f.mime_type?.startsWith('image/') ? '🖼️'
                  : f.mime_type === 'application/pdf' ? '📄'
                  : f.mime_type?.includes('spreadsheet') || f.mime_type?.includes('excel') || f.mime_type === 'text/csv' ? '📊'
                  : f.mime_type?.includes('zip') ? '📦'
                  : '📝';
                const sizeStr = f.size_bytes < 1024 ? `${f.size_bytes}B`
                  : f.size_bytes < 1048576 ? `${(f.size_bytes / 1024).toFixed(1)}KB`
                  : `${(f.size_bytes / 1048576).toFixed(1)}MB`;
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: '14px' }}>{icon}</span>
                    <a
                      href={`/api/v1/files/${f.id}`}
                      download={f.original_name}
                      style={{ color: 'var(--accent)', fontSize: '13px', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {f.original_name}
                    </a>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{sizeStr}</span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{f.uploaded_by_name || '?'}</span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {new Date(f.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <button
                      onClick={async () => {
                        await fetch(`/api/v1/tasks/${task.id}/files?fileId=${f.id}`, { method: 'DELETE' });
                        setFiles(prev => prev.filter(x => x.id !== f.id));
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '14px', padding: '2px 6px' }}
                    >×</button>
                  </div>
                );
              })}
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid var(--border)' }} />

            {/* Comments */}
            <div>
              <div style={sectionTitleStyle}>Comments</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '240px', overflowY: 'auto', marginBottom: '10px' }}>
                {loadingComments ? (
                  <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Loading comments...</div>
                ) : comments.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic' }}>No comments yet</div>
                ) : (
                  comments.map(c => {
                    const isBot = (c.user_name || '').toLowerCase().includes('penny') || (c.user_name || '').toLowerCase().includes('bot');
                    return (
                      <div key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                          background: isBot ? 'linear-gradient(135deg, #7b7dff, #9a9cff)' : 'var(--panel-3)',
                          border: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: isBot ? '14px' : '12px', fontWeight: 600, color: '#fff',
                        }}>
                          {isBot ? '🤖' : (c.user_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{c.user_name || 'Unknown'}</span>
                            {isBot && <span style={{ fontSize: '10px', background: 'rgba(123,125,255,0.2)', color: 'var(--accent)', padding: '1px 6px', borderRadius: '999px' }}>bot</span>}
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                              {new Date(c.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5, marginTop: '2px', whiteSpace: 'pre-wrap' }}>{c.content}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAddComment())}
                  placeholder="Write a comment..."
                  style={{ ...inputStyle, flex: 1, fontSize: '13px', padding: '8px 12px' }}
                />
                <button onClick={handleAddComment} style={{ ...primaryBtnStyle, padding: '8px 16px', fontSize: '13px' }}>Send</button>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div style={{ width: '200px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', flexShrink: 0 }}>
            <div>
              <div style={sidebarLabelStyle}>Priority</div>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={{ ...inputStyle, fontSize: '13px', padding: '6px 8px' }}>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <div style={sidebarLabelStyle}>Column</div>
              <select value={column} onChange={e => setColumn(e.target.value)} style={{ ...inputStyle, fontSize: '13px', padding: '6px 8px' }}>
                {board.columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={sidebarLabelStyle}>Assignee</div>
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={{ ...inputStyle, fontSize: '13px', padding: '6px 8px' }}>
                <option value="unassigned">Unassigned</option>
                {teamMembers.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <div style={sidebarLabelStyle}>Labels</div>
              <input
                value={labelsStr}
                onChange={e => setLabelsStr(e.target.value)}
                placeholder="api, ux"
                style={{ ...inputStyle, fontSize: '13px', padding: '6px 8px' }}
              />
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={handleSave} disabled={saving} style={{ ...primaryBtnStyle, width: '100%', textAlign: 'center', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={onClose} style={{ ...secondaryBtnStyle, width: '100%', textAlign: 'center' }}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid var(--border)',
  background: 'var(--panel-2)',
  color: 'var(--text)',
  fontSize: '14px',
  fontFamily: 'inherit',
  outline: 'none',
};

const primaryBtnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--accent), #9a9cff)',
  color: '#0d0d1f',
  border: 'none',
  padding: '10px 18px',
  borderRadius: '999px',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '14px',
};

const secondaryBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  padding: '10px 18px',
  borderRadius: '999px',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '14px',
};
