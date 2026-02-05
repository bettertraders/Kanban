'use client';

import { signOut, useSession } from 'next-auth/react';
import { useState } from 'react';

export function UserMenu() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  if (!session?.user) return null;

  const user = session.user;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          borderRadius: '999px',
          background: 'var(--panel-2)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          transition: 'background 0.2s ease, border-color 0.2s ease',
          color: 'var(--text)',
          fontSize: '13px',
          fontWeight: '500',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = 'var(--panel-3)';
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = 'var(--panel-2)';
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        Account
        <svg 
          width="12" 
          height="12" 
          viewBox="0 0 12 12" 
          fill="none" 
          style={{ 
            color: 'var(--muted)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}