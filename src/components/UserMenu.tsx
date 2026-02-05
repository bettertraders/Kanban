'use client';

import { signOut, useSession } from 'next-auth/react';
import { useState } from 'react';

export function UserMenu() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  if (!session?.user) return null;

  const user = session.user;
  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email?.[0].toUpperCase() || 'U';

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          borderRadius: '999px',
          background: user.image ? `url(${user.image})` : 'var(--accent)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          border: '2px solid var(--border)',
          color: user.image ? 'transparent' : '#0d0d1f',
          fontWeight: '600',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'transform 0.2s ease',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
        }}
      >
        {!user.image && initials}
      </button>

      {isOpen && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 9,
            }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '48px',
              right: '0',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '12px',
              minWidth: '200px',
              zIndex: 10,
              boxShadow: 'var(--shadow)',
            }}
          >
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600' }}>{user.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{user.email}</div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: '8px',
                color: 'var(--danger)',
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(240, 91, 111, 0.1)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <span>🚪</span>
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}