'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at 20% 30%, rgba(123, 125, 255, 0.15), transparent 50%), radial-gradient(circle at 80% 60%, rgba(72, 194, 255, 0.1), transparent 50%), linear-gradient(120deg, #0f0f1f, #141428 40%, #17172f 100%)',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: '24px',
        padding: '48px',
        maxWidth: '420px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      }}>
        <div style={{ marginBottom: '32px' }}>
          <img 
            src="/icons/clawdesk-mark.png" 
            alt="ClawDesk" 
            style={{ width: '64px', height: '64px', borderRadius: '16px', marginBottom: '16px' }} 
          />
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: '700', 
            marginBottom: '8px',
            background: 'linear-gradient(135deg, var(--text), var(--accent))',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Welcome to ClawDesk
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '15px' }}>
            Sign in to manage your boards and collaborate with your AI teammates.
          </p>
        </div>

        <button
          onClick={() => signIn('google', { callbackUrl })}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            width: '100%',
            padding: '14px 24px',
            borderRadius: '12px',
            background: 'white',
            color: '#1f1f1f',
            border: 'none',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 10px 40px rgba(255, 255, 255, 0.15)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = 'none';
            (e.currentTarget as HTMLElement).style.boxShadow = 'none';
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <p style={{ 
          marginTop: '24px', 
          fontSize: '12px', 
          color: 'var(--muted)',
          lineHeight: '1.5',
        }}>
          By signing in, you agree to our terms of service and privacy policy.
        </p>

        <a 
          href="/login"
          style={{
            display: 'inline-block',
            marginTop: '24px',
            color: 'var(--accent)',
            fontSize: '14px',
            textDecoration: 'none',
          }}
        >
          ← Back to home
        </a>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#141428',
      }}>
        <div style={{ color: 'var(--muted)' }}>Loading...</div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}
