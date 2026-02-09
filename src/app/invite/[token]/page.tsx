'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type InviteStatus = 'pending' | 'accepted' | 'cancelled' | 'expired' | string;

export default function InvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<{
    boardName: string;
    inviterName: string;
    status: InviteStatus;
    email: string;
    expiresAt: string;
    expired: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [inviteRes, meRes] = await Promise.all([
          fetch(`/api/v1/invites/${params.token}`),
          fetch('/api/v1/me')
        ]);

        if (inviteRes.ok) {
          const data = await inviteRes.json();
          setInvite(data.invite);
        } else {
          const data = await inviteRes.json().catch(() => ({}));
          setError(data.error || 'Invite not found');
        }

        setIsLoggedIn(meRes.ok);
      } catch {
        setError('Failed to load invite');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [params.token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/invites/${params.token}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to accept invite');
      }
      const data = await res.json();
      router.push(`/board/${data.boardId}`);
    } catch (err: any) {
      setError(err?.message || 'Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  };

  const handleSignIn = () => {
    const callbackUrl = `/invite/${params.token}`;
    window.location.href = `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: '20px',
    padding: '32px',
    width: 'min(520px, 100%)',
    boxShadow: 'var(--shadow)',
    textAlign: 'center',
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>🦞 ClawDesk</div>
          <p style={{ color: 'var(--muted)', marginTop: '12px' }}>Loading invite…</p>
        </div>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>🦞 ClawDesk</div>
          <p style={{ color: 'var(--danger)', marginTop: '16px' }}>{error}</p>
        </div>
      </div>
    );
  }

  const isExpired = invite?.expired || invite?.status === 'expired';
  const isAccepted = invite?.status === 'accepted';
  const isCancelled = invite?.status === 'cancelled';

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: '22px', fontWeight: 700 }}>🦞 ClawDesk</div>
        {invite && (
          <>
            <p style={{ marginTop: '18px', fontSize: '18px', fontWeight: 600 }}>
              {invite.inviterName} invited you to {invite.boardName}
            </p>
            <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '6px' }}>
              Invite sent to {invite.email}
            </p>
          </>
        )}

        {isExpired && (
          <div style={noticeStyle('warning')}>
            This invite has expired.
          </div>
        )}
        {isAccepted && (
          <div style={noticeStyle('info')}>
            This invite has already been used.
          </div>
        )}
        {isCancelled && (
          <div style={noticeStyle('error')}>
            This invite has been cancelled.
          </div>
        )}
        {error && (
          <div style={noticeStyle('error')}>
            {error}
          </div>
        )}

        {!isExpired && !isAccepted && !isCancelled && (
          <div style={{ marginTop: '22px', display: 'grid', gap: '10px' }}>
            {isLoggedIn ? (
              <button onClick={handleAccept} disabled={accepting} style={primaryBtnStyle}>
                {accepting ? 'Accepting…' : 'Accept Invite'}
              </button>
            ) : (
              <button onClick={handleSignIn} style={primaryBtnStyle}>
                Sign in with Google to accept
              </button>
            )}
            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
              Invites expire after 7 days.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background:
    'radial-gradient(circle at 20% 20%, rgba(123, 125, 255, 0.18), transparent 50%), radial-gradient(circle at 80% 30%, rgba(72, 194, 255, 0.12), transparent 45%), linear-gradient(120deg, #0f0f1f, #141428 40%, #17172f 100%)',
};

const primaryBtnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--accent), #9a9cff)',
  color: '#0d0d1f',
  border: 'none',
  padding: '12px 18px',
  borderRadius: '999px',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: '14px',
  fontFamily: 'inherit',
};

const noticeStyle = (tone: 'warning' | 'info' | 'error'): React.CSSProperties => {
  const colors: Record<typeof tone, { bg: string; border: string; text: string }> = {
    warning: { bg: 'rgba(245, 181, 68, 0.18)', border: 'rgba(245, 181, 68, 0.5)', text: '#f5b544' },
    info: { bg: 'rgba(123, 125, 255, 0.18)', border: 'rgba(123, 125, 255, 0.45)', text: '#9a9cff' },
    error: { bg: 'rgba(240, 91, 111, 0.18)', border: 'rgba(240, 91, 111, 0.45)', text: '#f05b6f' },
  };
  const toneStyles = colors[tone];
  return {
    marginTop: '16px',
    padding: '10px 12px',
    borderRadius: '12px',
    background: toneStyles.bg,
    border: `1px solid ${toneStyles.border}`,
    color: toneStyles.text,
    fontSize: '13px',
  };
};
