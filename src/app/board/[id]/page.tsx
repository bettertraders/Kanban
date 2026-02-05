'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserMenu } from '@/components/UserMenu';

interface Task {
  id: number;
  title: string;
  description?: string;
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
  const [teamMembers, setTeamMembers] = useState<{id: number; name: string; email: string}[]>([]);

  const fetchBoard = useCallback(async () => {
    try {
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

  // Drag and drop handlers
  const handleDragStart = (taskId: number) => setDragTaskId(taskId);
  
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
                title={`${member.name}${member.role === 'admin' ? ' (Admin)' : ''}`}
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
                }}
              >
                {!member.avatar_url && member.name?.charAt(0).toUpperCase()}
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

      {/* Board columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
        {(board.columns as string[]).map(col => {
          const colTasks = filteredTasks.filter(t => t.column_name === col);
          const isDragOver = dragOverCol === col;

          return (
            <section
              key={col}
              onDragOver={e => handleDragOver(e, col)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, col)}
              style={{
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
                <span>{col}</span>
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
                      {/* Title + Priority */}
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

                      {/* Description toggle */}
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

                      {/* Meta: Assignee + Date */}
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
                        {task.created_by_name && (
                          <span>by {task.created_by_name}</span>
                        )}
                        <span>Created {formatDate(task.created_at)}</span>
                      </div>

                      {/* Labels */}
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

      {/* Edit Task Modal */}
      {editingTask && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setEditingTask(null); }}
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
            <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Edit Task</h2>
            <form onSubmit={handleEditTask}>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Title</label>
                  <input name="title" required defaultValue={editingTask.title} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Description</label>
                  <textarea name="description" defaultValue={editingTask.description || ''} style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Priority</label>
                  <select name="priority" defaultValue={editingTask.priority} style={inputStyle}>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Column</label>
                  <select name="column" defaultValue={editingTask.column_name} style={inputStyle}>
                    {board.columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Assignee</label>
                  <select name="assignedTo" defaultValue={editingTask.assigned_to ? String(editingTask.assigned_to) : 'unassigned'} style={inputStyle}>
                    <option value="unassigned">Unassigned</option>
                    {teamMembers.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Labels (comma separated)</label>
                  <input name="labels" defaultValue={normalizeLabels(editingTask.labels).join(', ')} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                <button type="button" onClick={() => setEditingTask(null)} style={secondaryBtnStyle}>Cancel</button>
                <button type="submit" style={primaryBtnStyle}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
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
