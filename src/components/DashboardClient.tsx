'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserMenu } from '@/components/UserMenu';

interface Board {
  id: number;
  name: string;
  description?: string;
  is_personal: boolean;
  team_id?: number;
  team_name?: string;
  columns: string[];
}

interface Team {
  id: number;
  name: string;
  slug: string;
  user_role: string;
}

interface Stats {
  total: number;
  byStatus: Record<string, number>;
  recentlyCompleted: number;
}

interface Props {
  initialBoards: Board[];
  initialTeams: Team[];
  stats: Stats;
  userEmail: string;
}

export function DashboardClient({ initialBoards, initialTeams, stats, userEmail }: Props) {
  const [boards, setBoards] = useState(initialBoards);
  const [teams] = useState(initialTeams);
  const [showNewBoardModal, setShowNewBoardModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  // Check if user can create boards (Michael and Penny only for now)
  const canManage = ['michael@thebettertraders.com', 'penny@thebettertraders.com'].includes(userEmail);

  const handleCreateBoard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const body: Record<string, unknown> = {
      name: formData.get('name'),
      description: formData.get('description'),
    };
    
    const teamId = formData.get('teamId');
    if (teamId && teamId !== 'personal') {
      body.teamId = parseInt(teamId as string);
    }

    try {
      const res = await fetch('/api/v1/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setBoards([...boards, data.board]);
        setShowNewBoardModal(false);
      }
    } catch {}
  };

  const handleAddMember = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTeamId) return;
    
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const body = {
      email: formData.get('email'),
      role: formData.get('role') || 'member',
    };

    try {
      const res = await fetch(`/api/v1/teams/${selectedTeamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowAddMemberModal(false);
        setSelectedTeamId(null);
      }
    } catch {}
  };

  const openAddMember = (teamId: number) => {
    setSelectedTeamId(teamId);
    setShowAddMemberModal(true);
  };

  return (
    <div style={{ padding: '32px clamp(20px, 4vw, 48px) 40px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src="/icons/clawdesk-mark.png" alt="ClawDesk" style={{ width: '64px', height: '64px', borderRadius: '12px' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h1 style={{ fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 600, letterSpacing: '0.02em', margin: 0 }}>
                ClawDesk
              </h1>
              <div style={{ color: 'var(--muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                Your boards
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {canManage && (
            <button
              onClick={() => setShowNewBoardModal(true)}
              style={{
                background: 'linear-gradient(135deg, var(--accent), #9a9cff)',
                color: '#0d0d1f', border: 'none', padding: '10px 18px',
                borderRadius: '999px', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
              }}
            >
              New Board
            </button>
          )}
          <Link href="/teams/new" style={{
            background: 'transparent', color: 'var(--text)',
            border: '1px solid var(--border)', textDecoration: 'none',
            padding: '10px 18px', borderRadius: '999px', fontWeight: 600,
            fontSize: '14px',
          }}>
            New Team
          </Link>
          <Link href="/settings/api-keys" style={{
            background: 'transparent', color: 'var(--text)',
            border: '1px solid var(--border)', textDecoration: 'none',
            padding: '10px 18px', borderRadius: '999px', fontWeight: 600,
            fontSize: '14px',
          }}>
            API Keys
          </Link>
          <UserMenu />
        </div>
      </header>

      {/* Stats Dashboard */}
      {stats.total > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent)' }}>{stats.total}</div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>Total Tasks</div>
          </div>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--muted)' }}>{stats.byStatus['Backlog'] || 0}</div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>Backlog</div>
          </div>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--info)' }}>{stats.byStatus['In Progress'] || 0}</div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>In Progress</div>
          </div>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--success)' }}>{stats.byStatus['Done'] || 0}</div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>Done</div>
          </div>
          <div style={{ background: 'rgba(58, 193, 124, 0.1)', border: '1px solid rgba(58, 193, 124, 0.2)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--success)' }}>{stats.recentlyCompleted}</div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>Done This Week</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {boards.map((board) => {
          const team = teams.find(t => t.id === board.team_id);
          const isTeamAdmin = team?.user_role === 'admin';
          
          return (
            <div
              key={board.id}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'border-color 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                <Link href={`/board/${board.id}`} style={{ textDecoration: 'none', color: 'var(--text)', overflow: 'hidden' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{board.name}</h2>
                </Link>
                {board.is_personal ? (
                  <span style={{
                    fontSize: '11px', padding: '4px 8px', borderRadius: '999px',
                    background: 'rgba(123, 125, 255, 0.12)', border: '1px solid rgba(123, 125, 255, 0.2)',
                    color: 'var(--accent)', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    Personal
                  </span>
                ) : (
                  <span style={{
                    fontSize: '11px', padding: '4px 8px', borderRadius: '999px',
                    background: 'rgba(58, 193, 124, 0.12)', border: '1px solid rgba(58, 193, 124, 0.2)',
                    color: 'var(--success)', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {board.team_name}
                  </span>
                )}
              </div>
              {board.description && (
                <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.4, margin: 0 }}>
                  {board.description}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  {board.columns?.length || 4} columns
                </span>
                {canManage && !board.is_personal && isTeamAdmin && board.team_id && (
                  <button
                    onClick={() => openAddMember(board.team_id!)}
                    style={{
                      background: 'transparent', border: '1px solid var(--border)',
                      color: 'var(--muted)', padding: '4px 10px', borderRadius: '999px',
                      fontSize: '11px', cursor: 'pointer',
                    }}
                  >
                    + Add Member
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Board Modal */}
      {showNewBoardModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowNewBoardModal(false); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(5, 5, 15, 0.7)',
            display: 'grid', placeItems: 'center', padding: '20px', zIndex: 50,
          }}
        >
          <div style={{
            width: 'min(420px, 100%)', background: 'var(--panel)',
            border: '1px solid var(--border)', borderRadius: '18px',
            padding: '24px', boxShadow: 'var(--shadow)',
          }}>
            <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Create New Board</h2>
            <form onSubmit={handleCreateBoard}>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Board Name</label>
                  <input name="name" required style={inputStyle} placeholder="My Board" />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Description</label>
                  <textarea name="description" style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} placeholder="Optional description" />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Type</label>
                  <select name="teamId" style={inputStyle}>
                    <option value="personal">Personal Board</option>
                    {teams.filter(t => t.user_role === 'admin').map(t => (
                      <option key={t.id} value={t.id}>Team: {t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                <button type="button" onClick={() => setShowNewBoardModal(false)} style={secondaryBtnStyle}>Cancel</button>
                <button type="submit" style={primaryBtnStyle}>Create Board</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && selectedTeamId && (
        <div
          onClick={e => { if (e.target === e.currentTarget) { setShowAddMemberModal(false); setSelectedTeamId(null); } }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(5, 5, 15, 0.7)',
            display: 'grid', placeItems: 'center', padding: '20px', zIndex: 50,
          }}
        >
          <div style={{
            width: 'min(420px, 100%)', background: 'var(--panel)',
            border: '1px solid var(--border)', borderRadius: '18px',
            padding: '24px', boxShadow: 'var(--shadow)',
          }}>
            <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Add Team Member</h2>
            <form onSubmit={handleAddMember}>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Email</label>
                  <input name="email" type="email" required style={inputStyle} placeholder="user@example.com" />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Role</label>
                  <select name="role" style={inputStyle}>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                <button type="button" onClick={() => { setShowAddMemberModal(false); setSelectedTeamId(null); }} style={secondaryBtnStyle}>Cancel</button>
                <button type="submit" style={primaryBtnStyle}>Add Member</button>
              </div>
            </form>
          </div>
        </div>
      )}
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
