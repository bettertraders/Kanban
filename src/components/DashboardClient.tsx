'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserMenu } from '@/components/UserMenu';

interface Board {
  id: number;
  name: string;
  description?: string;
  is_personal: boolean;
  team_id?: number;
  team_name?: string;
  owner_id?: number | null;
  columns: string[];
  board_type?: string;
}

interface Team {
  id: number;
  name: string;
  slug: string;
  user_role: string;
}

interface VisibleUser {
  id: number;
  name: string | null;
  email: string;
  image?: string | null;
}

interface TeamMember {
  id: number;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  role: string;
  joined_at: string;
}

interface PerBoardStat {
  boardId: number;
  boardName: string;
  total: number;
  done: number;
  inProgress: number;
  backlog: number;
}

interface DailyCount {
  date: string;
  count: number;
}

interface ActivityItem {
  taskTitle: string;
  boardName: string;
  action: string;
  userName: string;
  timestamp: string;
}

interface Stats {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  recentlyCompleted: number;
  tasksCreatedThisWeek: number;
  tasksCompletedThisWeek: number;
  avgCompletionDays: number;
  mostActiveBoard: string;
  overdueCount: number;
  perBoardStats: PerBoardStat[];
  dailyCompleted: DailyCount[];
  dailyCreated: DailyCount[];
  recentActivity: ActivityItem[];
}

interface Props {
  initialBoards: Board[];
  initialTeams: Team[];
  stats: Stats;
  userEmail: string;
  userId: number;
  userName?: string | null;
}

const CHART_COLORS = {
  backlog: '#6f7db8',
  planned: '#8aa5ff',
  inProgress: '#f5b544',
  review: '#44d9e6',
  done: '#4ade80',
};

function relativeTime(ts: string): string {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// --- SVG CHARTS ---

function DonutChart({ byStatus }: { byStatus: Record<string, number> }) {
  const segments = [
    { label: 'Backlog', color: CHART_COLORS.backlog, value: byStatus['Backlog'] || 0 },
    { label: 'Planned', color: CHART_COLORS.planned, value: byStatus['Planned'] || 0 },
    { label: 'In Progress', color: CHART_COLORS.inProgress, value: byStatus['In Progress'] || 0 },
    { label: 'Review', color: CHART_COLORS.review, value: byStatus['Review'] || 0 },
    { label: 'Done', color: CHART_COLORS.done, value: byStatus['Done'] || 0 },
  ];
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return null;

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', justifyContent: 'center' }}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dash = pct * circumference;
          const el = (
            <circle
              key={i}
              cx="80" cy="80" r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="20"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              style={{ transition: 'stroke-dasharray 0.5s' }}
            />
          );
          offset += dash;
          return el;
        })}
        <text x="80" y="76" textAnchor="middle" fill="var(--text)" fontSize="22" fontWeight="700">{total}</text>
        <text x="80" y="94" textAnchor="middle" fill="var(--muted)" fontSize="11">tasks</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: seg.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--muted)' }}>{seg.label}</span>
            <span style={{ fontWeight: 600, marginLeft: 'auto' }}>{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VelocityChart({ dailyCreated, dailyCompleted }: { dailyCreated: DailyCount[]; dailyCompleted: DailyCount[] }) {
  // Build 14-day timeline
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }

  const createdMap: Record<string, number> = {};
  const completedMap: Record<string, number> = {};
  dailyCreated.forEach(d => { createdMap[d.date] = d.count; });
  dailyCompleted.forEach(d => { completedMap[d.date] = d.count; });

  const createdVals = days.map(d => createdMap[d] || 0);
  const completedVals = days.map(d => completedMap[d] || 0);
  const maxVal = Math.max(...createdVals, ...completedVals, 1);

  const w = 400, h = 160, pad = 30, top = 10;
  const chartW = w - pad * 2;
  const chartH = h - top - 30;

  const toPoint = (vals: number[], i: number) => {
    const x = pad + (i / 13) * chartW;
    const y = top + chartH - (vals[i] / maxVal) * chartH;
    return `${x},${y}`;
  };

  const createdPoints = days.map((_, i) => toPoint(createdVals, i)).join(' ');
  const completedPoints = days.map((_, i) => toPoint(completedVals, i)).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
        const y = top + chartH - pct * chartH;
        return <line key={i} x1={pad} x2={w - pad} y1={y} y2={y} stroke="var(--border)" strokeWidth="0.5" />;
      })}
      {/* Lines */}
      <polyline points={createdPoints} fill="none" stroke={CHART_COLORS.planned} strokeWidth="2" />
      <polyline points={completedPoints} fill="none" stroke={CHART_COLORS.done} strokeWidth="2" />
      {/* Dots */}
      {days.map((_, i) => {
        const [cx1, cy1] = toPoint(createdVals, i).split(',').map(Number);
        const [cx2, cy2] = toPoint(completedVals, i).split(',').map(Number);
        return (
          <g key={i}>
            <circle cx={cx1} cy={cy1} r="3" fill={CHART_COLORS.planned} />
            <circle cx={cx2} cy={cy2} r="3" fill={CHART_COLORS.done} />
          </g>
        );
      })}
      {/* X labels (every 3rd day) */}
      {days.map((d, i) => {
        if (i % 3 !== 0 && i !== 13) return null;
        const x = pad + (i / 13) * chartW;
        return <text key={i} x={x} y={h - 4} textAnchor="middle" fill="var(--muted)" fontSize="9">{d.slice(5)}</text>;
      })}
      {/* Legend */}
      <circle cx={pad} cy={h - 18} r="4" fill={CHART_COLORS.planned} />
      <text x={pad + 8} y={h - 14} fill="var(--muted)" fontSize="10">Created</text>
      <circle cx={pad + 60} cy={h - 18} r="4" fill={CHART_COLORS.done} />
      <text x={pad + 68} y={h - 14} fill="var(--muted)" fontSize="10">Completed</text>
    </svg>
  );
}

function BoardBarChart({ perBoardStats }: { perBoardStats: PerBoardStat[] }) {
  if (perBoardStats.length === 0) return null;
  const maxTotal = Math.max(...perBoardStats.map(b => b.total), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {perBoardStats.map(b => {
        const pctDone = (b.done / maxTotal) * 100;
        const pctIP = (b.inProgress / maxTotal) * 100;
        const pctBL = (b.backlog / maxTotal) * 100;
        return (
          <div key={b.boardId} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '120px', fontSize: '13px', color: 'var(--muted)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {b.boardName}
            </div>
            <div style={{ flex: 1, display: 'flex', height: '22px', borderRadius: '6px', overflow: 'hidden', background: 'var(--panel-2)' }}>
              {pctDone > 0 && <div style={{ width: `${pctDone}%`, background: CHART_COLORS.done, transition: 'width 0.5s' }} />}
              {pctIP > 0 && <div style={{ width: `${pctIP}%`, background: CHART_COLORS.inProgress, transition: 'width 0.5s' }} />}
              {pctBL > 0 && <div style={{ width: `${pctBL}%`, background: CHART_COLORS.backlog, transition: 'width 0.5s' }} />}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--muted)', width: '30px', flexShrink: 0 }}>{b.total}</span>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '4px' }}>
        {[{ label: 'Done', color: CHART_COLORS.done }, { label: 'In Progress', color: CHART_COLORS.inProgress }, { label: 'Other', color: CHART_COLORS.backlog }].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- MAIN COMPONENT ---

export function DashboardClient({ initialBoards, initialTeams, stats, userEmail, userId, userName }: Props) {
  const [boards, setBoards] = useState(initialBoards);
  const [teams, setTeams] = useState(initialTeams);
  const [showNewBoardModal, setShowNewBoardModal] = useState(false);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [boardName, setBoardName] = useState('');
  const [sharingMode, setSharingMode] = useState<'personal' | 'shared'>('personal');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<VisibleUser[]>([]);

  const [visibleUsers, setVisibleUsers] = useState<VisibleUser[]>([]);
  const [visibleUsersLoaded, setVisibleUsersLoaded] = useState(false);
  const [visibleUsersLoading, setVisibleUsersLoading] = useState(false);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsBoard, setSettingsBoard] = useState<Board | null>(null);
  const [settingsName, setSettingsName] = useState('');
  const [settingsMembers, setSettingsMembers] = useState<TeamMember[]>([]);
  const [settingsLoadingMembers, setSettingsLoadingMembers] = useState(false);
  const [settingsMemberSearch, setSettingsMemberSearch] = useState('');
  const [settingsSelectedMembers, setSettingsSelectedMembers] = useState<VisibleUser[]>([]);
  const [settingsAddMode, setSettingsAddMode] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsDeleting, setSettingsDeleting] = useState(false);
  const [settingsRemoving, setSettingsRemoving] = useState<number | null>(null);

  const isTradingAdmin = teams.some(t => ['admin', 'owner'].includes(t.user_role));

  const loadVisibleUsers = async () => {
    if (visibleUsersLoaded || visibleUsersLoading) return;
    setVisibleUsersLoading(true);
    try {
      const res = await fetch('/api/v1/users/visible');
      if (res.ok) {
        const data = await res.json();
        setVisibleUsers(Array.isArray(data?.users) ? data.users : []);
        setVisibleUsersLoaded(true);
      }
    } catch {
    } finally {
      setVisibleUsersLoading(false);
    }
  };

  const handleCreateBoard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      if (!boardName.trim()) return;
      setCreatingBoard(true);
      let teamId: number | null = null;
      if (sharingMode === 'shared') {
        const teamRes = await fetch('/api/v1/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: boardName.trim(), create_default_board: false })
        });
        if (teamRes.ok) {
          const teamData = await teamRes.json();
          teamId = teamData?.team?.id ?? null;
          if (teamData?.team) {
            setTeams(prev => [...prev, teamData.team]);
          }
        }
        if (!teamId) {
          return;
        }
      }

      const res = await fetch('/api/v1/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: boardName.trim(),
          teamId: teamId ?? undefined
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (sharingMode === 'shared' && teamId && selectedMembers.length > 0) {
          await Promise.all(
            selectedMembers.map((member) =>
              fetch(`/api/v1/teams/${teamId}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: member.email, name: member.name || undefined, role: 'member' })
              })
            )
          );
        }
        setBoards([...boards, data.board]);
        setShowNewBoardModal(false);
        setBoardName('');
        setSharingMode('personal');
        setSelectedMembers([]);
        setMemberSearch('');
      }
    } catch {
    } finally {
      setCreatingBoard(false);
    }
  };

  const filteredVisibleUsers = visibleUsers.filter((u) => {
    if (!memberSearch.trim()) return true;
    const q = memberSearch.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const toggleMember = (user: VisibleUser) => {
    setSelectedMembers((prev) => {
      const exists = prev.find(m => m.id === user.id);
      if (exists) return prev.filter(m => m.id !== user.id);
      return [...prev, user];
    });
  };

  const openSettings = async (board: Board) => {
    setSettingsBoard(board);
    setSettingsName(board.name);
    setSettingsMembers([]);
    setSettingsSelectedMembers([]);
    setSettingsMemberSearch('');
    setSettingsAddMode(false);
    setShowSettingsModal(true);
    if (board.team_id) {
      setSettingsLoadingMembers(true);
      try {
        const res = await fetch(`/api/v1/teams/${board.team_id}/members`);
        if (res.ok) {
          const data = await res.json();
          setSettingsMembers(Array.isArray(data?.members) ? data.members : []);
        }
      } catch {
      } finally {
        setSettingsLoadingMembers(false);
      }
    }
  };

  const closeSettings = () => {
    setShowSettingsModal(false);
    setSettingsBoard(null);
    setSettingsMembers([]);
    setSettingsSelectedMembers([]);
    setSettingsMemberSearch('');
    setSettingsAddMode(false);
  };

  const toggleSettingsMember = (user: VisibleUser) => {
    setSettingsSelectedMembers((prev) => {
      const exists = prev.find(m => m.id === user.id);
      if (exists) return prev.filter(m => m.id !== user.id);
      return [...prev, user];
    });
  };

  const saveSettings = async () => {
    if (!settingsBoard) return;
    setSettingsSaving(true);
    try {
      if (settingsName.trim() && settingsName.trim() !== settingsBoard.name) {
        const res = await fetch(`/api/v1/boards/${settingsBoard.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: settingsName.trim() })
        });
        if (res.ok) {
          const data = await res.json();
          setBoards(prev => prev.map(b => b.id === settingsBoard.id ? data.board : b));
        }
      }

      if (settingsBoard.team_id && settingsSelectedMembers.length > 0) {
        await Promise.all(
          settingsSelectedMembers.map((member) =>
            fetch(`/api/v1/teams/${settingsBoard.team_id}/members`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: member.email, name: member.name || undefined, role: 'member' })
            })
          )
        );
        const refreshed = await fetch(`/api/v1/teams/${settingsBoard.team_id}/members`);
        if (refreshed.ok) {
          const data = await refreshed.json();
          setSettingsMembers(Array.isArray(data?.members) ? data.members : []);
        }
      }
      setSettingsSelectedMembers([]);
      setSettingsAddMode(false);
    } catch {
    } finally {
      setSettingsSaving(false);
    }
  };

  const removeSettingsMember = async (memberId: number) => {
    if (!settingsBoard?.team_id) return;
    setSettingsRemoving(memberId);
    try {
      const res = await fetch(`/api/v1/teams/${settingsBoard.team_id}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: memberId })
      });
      if (res.ok) {
        setSettingsMembers(prev => prev.filter(m => m.id !== memberId));
      }
    } catch {
    } finally {
      setSettingsRemoving(null);
    }
  };

  const deleteBoard = async () => {
    if (!settingsBoard) return;
    if (!confirm('Delete this board? This cannot be undone.')) return;
    setSettingsDeleting(true);
    try {
      const res = await fetch(`/api/v1/boards/${settingsBoard.id}`, { method: 'DELETE' });
      if (res.ok) {
        setBoards(prev => prev.filter(b => b.id !== settingsBoard.id));
        closeSettings();
      }
    } catch {
    } finally {
      setSettingsDeleting(false);
    }
  };

  const glassCard: React.CSSProperties = {
    background: 'rgba(20, 20, 40, 0.6)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '20px',
    textAlign: 'center',
  };

  const sectionStyle: React.CSSProperties = {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: '16px',
    padding: '24px',
  };

  useEffect(() => {
    if (showNewBoardModal && sharingMode === 'shared') {
      void loadVisibleUsers();
    }
  }, [showNewBoardModal, sharingMode]);

  useEffect(() => {
    if (showSettingsModal && settingsAddMode) {
      void loadVisibleUsers();
    }
  }, [showSettingsModal, settingsAddMode]);

  return (
    <div style={{ padding: '32px clamp(20px, 4vw, 48px) 40px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* HEADER */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/icons/clawdesk-mark.png" alt="ClawDesk" style={{ width: '64px', height: '64px', borderRadius: '12px' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 600, letterSpacing: '0.02em', margin: 0 }}>ClawDesk</h1>
            <div style={{ color: 'var(--muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Command Center</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setShowNewBoardModal(true)} style={{ background: 'linear-gradient(135deg, var(--accent), #9a9cff)', color: '#0d0d1f', border: 'none', padding: '10px 18px', borderRadius: '999px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>
            New Board
          </button>
          <Link href="/settings/api-keys" style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', textDecoration: 'none', padding: '10px 18px', borderRadius: '999px', fontWeight: 600, fontSize: '14px' }}>API Keys</Link>
          <UserMenu />
        </div>
      </header>

      {/* BOARD NAV TABS */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'rgba(20, 20, 40, 0.8)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: '12px',
          padding: '8px 12px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <style>{`.board-nav::-webkit-scrollbar { display: none; }`}</style>
        <div
          className="board-nav"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            flex: 1,
            minWidth: 0,
          }}
        >
          <Link
            href="/portfolio"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '999px',
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 8px rgba(123,125,255,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            📊 Portfolio
          </Link>
          <Link
            href="/bots"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '999px',
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 8px rgba(123,125,255,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            🤖 Bots
          </Link>
          <Link
            href="/leaderboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '999px',
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 8px rgba(123,125,255,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            🏆 Leaderboard
          </Link>
          {boards.map((board) => {
            const boardStat = stats.perBoardStats.find(b => b.boardId === board.id);
            const taskCount = boardStat?.total ?? 0;
            const boardHref = board.board_type === 'trading' ? `/trading/${board.id}` : `/board/${board.id}`;
            const team = teams.find(t => t.id === board.team_id);
            const isTeamAdmin = team?.user_role && ['admin', 'owner'].includes(team.user_role);
            const canEditBoard = board.is_personal ? board.owner_id === userId : Boolean(isTeamAdmin);
            return (
              <div key={board.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <Link
                  href={boardHref}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '999px',
                    background: 'var(--panel-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 8px rgba(123,125,255,0.3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  {board.board_type === 'trading' ? `📈 ${board.name}` : board.name}
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 400 }}>{taskCount}</span>
                </Link>
                {canEditBoard && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); openSettings(board); }}
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px'
                    }}
                    title="Board settings"
                  >
                    ⚙️
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {isTradingAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <div style={{ width: '1px', height: '26px', background: 'var(--border)', opacity: 0.6 }} />
            <Link
              href="/trading"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '999px',
                background: 'rgba(0,230,118,0.15)',
                border: '1px solid rgba(0,230,118,0.3)',
                color: 'var(--green)',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.boxShadow = '0 0 10px rgba(0,230,118,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,230,118,0.3)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              📈 Trading
            </Link>
          </div>
        )}
      </nav>

      {/* A. STATS CARDS ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div style={glassCard}>
          <div style={{ fontSize: '32px', fontWeight: 700, color: CHART_COLORS.done }}>{stats.tasksCompletedThisWeek}</div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginTop: '4px' }}>Completed This Week</div>
        </div>
        <div style={glassCard}>
          <div style={{ fontSize: '32px', fontWeight: 700, color: CHART_COLORS.planned }}>{stats.tasksCreatedThisWeek}</div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginTop: '4px' }}>Created This Week</div>
        </div>
        <div style={glassCard}>
          <div style={{ fontSize: '32px', fontWeight: 700, color: CHART_COLORS.review }}>{stats.avgCompletionDays}<span style={{ fontSize: '16px', fontWeight: 400 }}>d</span></div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginTop: '4px' }}>Avg Completion</div>
        </div>
        <div style={glassCard}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: CHART_COLORS.inProgress, lineHeight: '38px' }}>{stats.mostActiveBoard || '—'}</div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginTop: '4px' }}>Most Active Board</div>
        </div>
        <div style={{ ...glassCard, ...(stats.overdueCount > 0 ? { borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' } : {}) }}>
          <div style={{ fontSize: '32px', fontWeight: 700, color: stats.overdueCount > 0 ? '#ef4444' : 'var(--muted)' }}>{stats.overdueCount}</div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginTop: '4px' }}>Overdue</div>
        </div>
      </div>

      {/* B. CHARTS ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '16px', fontWeight: 600 }}>Task Distribution</h3>
          <DonutChart byStatus={stats.byStatus} />
        </div>
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '16px', fontWeight: 600 }}>Velocity (14 days)</h3>
          <VelocityChart dailyCreated={stats.dailyCreated} dailyCompleted={stats.dailyCompleted} />
        </div>
      </div>

      {/* C. BOARD ACTIVITY */}
      {stats.perBoardStats.length > 0 && (
        <div style={{ ...sectionStyle, marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '16px', fontWeight: 600 }}>Board Activity</h3>
          <BoardBarChart perBoardStats={stats.perBoardStats} />
        </div>
      )}

      {/* D. RECENT ACTIVITY FEED */}
      {stats.recentActivity.length > 0 && (
        <div style={{ ...sectionStyle, marginBottom: '24px', maxHeight: '360px', overflowY: 'auto' }}>
          <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '16px', fontWeight: 600 }}>Recent Activity</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {stats.recentActivity.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#0d0d1f', flexShrink: 0 }}>
                  {a.userName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, fontSize: '13px', lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 600 }}>{a.userName}</span>{' '}
                  <span style={{ color: 'var(--muted)' }}>{a.action}</span>{' '}
                  <span style={{ fontWeight: 500 }}>&lsquo;{a.taskTitle}&rsquo;</span>{' '}
                  <span style={{ color: 'var(--muted)' }}>on {a.boardName}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>{relativeTime(a.timestamp)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* E. YOUR BOARDS */}
      <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '14px', fontWeight: 600 }}>Your Boards</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {boards.map((board) => {
          const team = teams.find(t => t.id === board.team_id);
          const isTeamAdmin = team?.user_role && ['admin', 'owner'].includes(team.user_role);
          const boardStat = stats.perBoardStats.find(b => b.boardId === board.id);
          const pctDone = boardStat && boardStat.total > 0 ? Math.round((boardStat.done / boardStat.total) * 100) : 0;
          const boardHref = board.board_type === 'trading' ? `/trading/${board.id}` : `/board/${board.id}`;

          return (
            <div key={board.id} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', transition: 'border-color 0.2s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                <Link href={boardHref} style={{ textDecoration: 'none', color: 'var(--text)', overflow: 'hidden' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                    {board.board_type === 'trading' ? '📈 ' : ''}
                    {board.name}
                  </h2>
                </Link>
                {board.is_personal ? (
                  <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'rgba(123, 125, 255, 0.12)', border: '1px solid rgba(123, 125, 255, 0.2)', color: 'var(--accent)', whiteSpace: 'nowrap', flexShrink: 0 }}>Personal</span>
                ) : (
                  <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'rgba(58, 193, 124, 0.12)', border: '1px solid rgba(58, 193, 124, 0.2)', color: 'var(--success)', whiteSpace: 'nowrap', flexShrink: 0 }}>{board.team_name}</span>
                )}
              </div>
              {board.description && <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.4, margin: 0 }}>{board.description}</p>}
              {/* Progress bar */}
              {boardStat && boardStat.total > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                    <span>{boardStat.total} tasks</span>
                    <span>{pctDone}% done</span>
                  </div>
                  <div style={{ height: '4px', borderRadius: '2px', background: 'var(--panel-2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pctDone}%`, background: CHART_COLORS.done, borderRadius: '2px', transition: 'width 0.5s' }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{board.columns?.length || 4} columns</span>
                {isTeamAdmin && board.team_id && (
                  <button onClick={() => openSettings(board)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', cursor: 'pointer' }}>
                    ⚙️ Settings
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* NEW BOARD MODAL */}
      {showNewBoardModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowNewBoardModal(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(5, 5, 15, 0.7)', display: 'grid', placeItems: 'center', padding: '20px', zIndex: 50 }}>
          <div style={{ width: 'min(520px, 100%)', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '18px', padding: '24px', boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '20px', margin: 0 }}>Create New Board</h2>
              <button onClick={() => setShowNewBoardModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>
            <form onSubmit={handleCreateBoard}>
              <div style={{ display: 'grid', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Board Name</label>
                  <input
                    name="name"
                    required
                    style={inputStyle}
                    placeholder="My Board"
                    value={boardName}
                    onChange={(e) => setBoardName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Sharing</label>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <input
                        type="radio"
                        name="sharing"
                        value="personal"
                        checked={sharingMode === 'personal'}
                        onChange={() => setSharingMode('personal')}
                      />
                      Just me (personal)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <input
                        type="radio"
                        name="sharing"
                        value="shared"
                        checked={sharingMode === 'shared'}
                        onChange={() => setSharingMode('shared')}
                      />
                      Shared with others
                    </label>
                  </div>
                </div>
                {sharingMode === 'shared' && (
                  <div style={{ display: 'grid', gap: '10px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Add Members</label>
                    <div style={{ border: '1px solid var(--border)', borderRadius: '14px', background: 'var(--panel-2)', padding: '12px', display: 'grid', gap: '10px' }}>
                      <input
                        type="text"
                        placeholder="Search your contacts..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        style={{ ...inputStyle, background: 'rgba(10,10,26,0.4)' }}
                      />
                      {selectedMembers.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {selectedMembers.map((m) => (
                            <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(123,125,255,0.16)', border: '1px solid rgba(123,125,255,0.3)', color: 'var(--text)', padding: '4px 8px', borderRadius: '999px', fontSize: '12px' }}>
                              {m.name || m.email}
                              <button type="button" onClick={() => toggleMember(m)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'grid', gap: '6px' }}>
                        {visibleUsersLoading && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Loading contacts...</span>}
                        {!visibleUsersLoading && filteredVisibleUsers.length === 0 && (
                          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>No matching contacts.</span>
                        )}
                        {filteredVisibleUsers.map((user) => {
                          const selected = selectedMembers.some(m => m.id === user.id);
                          return (
                            <label key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleMember(user)}
                              />
                              <span style={{ flex: 1 }}>{user.name || user.email}</span>
                              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{user.email}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div style={{ display: 'grid', gap: '6px' }}>
                        <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Invite by email</label>
                        <input
                          type="text"
                          disabled
                          title="Coming soon"
                          placeholder="Coming soon"
                          style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                <button type="button" onClick={() => setShowNewBoardModal(false)} style={secondaryBtnStyle}>Cancel</button>
                <button type="submit" style={primaryBtnStyle} disabled={creatingBoard}>
                  {creatingBoard ? 'Creating...' : 'Create Board'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BOARD SETTINGS MODAL */}
      {showSettingsModal && settingsBoard && (
        <div onClick={e => { if (e.target === e.currentTarget) closeSettings(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(5, 5, 15, 0.7)', display: 'grid', placeItems: 'center', padding: '20px', zIndex: 55 }}>
          <div style={{ width: 'min(560px, 100%)', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '18px', padding: '24px', boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '20px', margin: 0 }}>Board Settings</h2>
              <button onClick={closeSettings} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Board Name</label>
                <input value={settingsName} onChange={(e) => setSettingsName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Members</label>
                <div style={{ border: '1px solid var(--border)', borderRadius: '14px', padding: '12px', background: 'var(--panel-2)', display: 'grid', gap: '8px' }}>
                  {settingsBoard.is_personal ? (
                    <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{userName || userEmail}</span>
                      <span style={{ color: 'var(--muted)' }}>owner</span>
                    </div>
                  ) : (
                    <>
                      {settingsLoadingMembers && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Loading members...</span>}
                      {!settingsLoadingMembers && settingsMembers.length === 0 && (
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>No members found.</span>
                      )}
                      {settingsMembers.map((member) => (
                        <div key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '13px' }}>
                          <span>
                            {member.name || member.email}
                            {member.role === 'admin' ? ' (admin)' : member.role === 'owner' ? ' (owner)' : ''}
                          </span>
                          {!['admin', 'owner'].includes(member.role) && (
                            <button
                              onClick={() => removeSettingsMember(member.id)}
                              disabled={settingsRemoving === member.id}
                              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', cursor: 'pointer' }}
                            >
                              {settingsRemoving === member.id ? 'Removing...' : 'Remove'}
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => { setSettingsAddMode(true); void loadVisibleUsers(); }}
                        style={{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--muted)', padding: '6px 10px', borderRadius: '10px', fontSize: '12px', cursor: 'pointer', textAlign: 'left' }}
                      >
                        + Add Member
                      </button>
                      {settingsAddMode && (
                        <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
                          <input
                            type="text"
                            placeholder="Search your contacts..."
                            value={settingsMemberSearch}
                            onChange={(e) => setSettingsMemberSearch(e.target.value)}
                            style={{ ...inputStyle, background: 'rgba(10,10,26,0.4)' }}
                          />
                          {settingsSelectedMembers.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {settingsSelectedMembers.map((m) => (
                                <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(123,125,255,0.16)', border: '1px solid rgba(123,125,255,0.3)', color: 'var(--text)', padding: '4px 8px', borderRadius: '999px', fontSize: '12px' }}>
                                  {m.name || m.email}
                                  <button type="button" onClick={() => toggleSettingsMember(m)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'grid', gap: '6px' }}>
                            {visibleUsersLoading && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Loading contacts...</span>}
                            {!visibleUsersLoading && visibleUsers.filter((u) => {
                              const exists = settingsMembers.some(m => m.id === u.id);
                              if (exists) return false;
                              if (!settingsMemberSearch.trim()) return true;
                              const q = settingsMemberSearch.toLowerCase();
                              return (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
                            }).length === 0 && (
                              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>No matching contacts.</span>
                            )}
                            {visibleUsers.filter((u) => {
                              const exists = settingsMembers.some(m => m.id === u.id);
                              if (exists) return false;
                              if (!settingsMemberSearch.trim()) return true;
                              const q = settingsMemberSearch.toLowerCase();
                              return (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
                            }).map((user) => {
                              const selected = settingsSelectedMembers.some(m => m.id === user.id);
                              return (
                                <label key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => toggleSettingsMember(user)}
                                  />
                                  <span style={{ flex: 1 }}>{user.name || user.email}</span>
                                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{user.email}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              {!settingsBoard.is_personal && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                  <button
                    onClick={deleteBoard}
                    disabled={settingsDeleting}
                    style={{ background: 'transparent', border: '1px solid rgba(255,82,82,0.5)', color: 'var(--red)', padding: '8px 12px', borderRadius: '12px', cursor: 'pointer', fontSize: '12px' }}
                  >
                    {settingsDeleting ? 'Deleting...' : '🗑️ Delete Board'}
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button type="button" onClick={closeSettings} style={secondaryBtnStyle}>Cancel</button>
              <button type="button" onClick={saveSettings} style={primaryBtnStyle} disabled={settingsSaving}>
                {settingsSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '10px',
  border: '1px solid var(--border)', background: 'var(--panel-2)',
  color: 'var(--text)', fontSize: '14px', fontFamily: 'inherit', outline: 'none',
};

const primaryBtnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--accent), #9a9cff)', color: '#0d0d1f',
  border: 'none', padding: '10px 18px', borderRadius: '999px', fontWeight: 600, cursor: 'pointer', fontSize: '14px',
};

const secondaryBtnStyle: React.CSSProperties = {
  background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)',
  padding: '10px 18px', borderRadius: '999px', fontWeight: 600, cursor: 'pointer', fontSize: '14px',
};
