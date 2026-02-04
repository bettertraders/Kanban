import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { findOrCreateUser, getBoards } from '@/lib/database';
import Link from 'next/link';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    redirect('/login');
  }

  const user = await findOrCreateUser(session.user.email);
  const boards = await getBoards(user.id);

  return (
    <div style={{ padding: '32px clamp(20px, 4vw, 48px) 40px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <h1 style={{ fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 600, letterSpacing: '0.02em' }}>
            Team Kanban 🚀
          </h1>
          <div style={{ color: 'var(--muted)', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
            Welcome, {session.user.name?.split(' ')[0] || 'there'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link href="/teams/new" style={{
            background: 'linear-gradient(135deg, var(--accent), #9a9cff)',
            color: '#0d0d1f', textDecoration: 'none', padding: '10px 18px',
            borderRadius: '999px', fontWeight: 600, fontSize: '14px',
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
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {boards.map((board: any) => (
          <Link
            key={board.id}
            href={`/board/${board.id}`}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '24px',
              textDecoration: 'none',
              color: 'var(--text)',
              transition: 'border-color 0.2s ease, transform 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600 }}>{board.name}</h2>
              {board.is_personal ? (
                <span style={{
                  fontSize: '11px', padding: '4px 8px', borderRadius: '999px',
                  background: 'rgba(123, 125, 255, 0.12)', border: '1px solid rgba(123, 125, 255, 0.2)',
                  color: 'var(--accent)',
                }}>
                  Personal
                </span>
              ) : (
                <span style={{
                  fontSize: '11px', padding: '4px 8px', borderRadius: '999px',
                  background: 'rgba(58, 193, 124, 0.12)', border: '1px solid rgba(58, 193, 124, 0.2)',
                  color: 'var(--success)',
                }}>
                  {board.team_name}
                </span>
              )}
            </div>
            {board.description && (
              <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.4 }}>
                {board.description}
              </p>
            )}
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              {(board.columns as string[])?.length || 4} columns
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
