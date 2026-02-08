'use client';

import React from 'react';

export type ToastItem = {
  id: number;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
};

const toneMap: Record<ToastItem['type'], { bg: string; border: string; text: string }> = {
  success: { bg: 'rgba(74, 222, 128, 0.16)', border: 'rgba(74, 222, 128, 0.4)', text: '#4ade80' },
  info: { bg: 'rgba(123, 125, 255, 0.18)', border: 'rgba(123, 125, 255, 0.45)', text: '#9a9cff' },
  warning: { bg: 'rgba(245, 181, 68, 0.18)', border: 'rgba(245, 181, 68, 0.45)', text: '#f5b544' },
  error: { bg: 'rgba(240, 91, 111, 0.18)', border: 'rgba(240, 91, 111, 0.45)', text: '#f05b6f' },
};

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (!toasts.length) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: '20px',
        bottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        zIndex: 90,
      }}
    >
      {toasts.map((toast) => {
        const tone = toneMap[toast.type];
        return (
          <div
            key={toast.id}
            style={{
              minWidth: '220px',
              maxWidth: '320px',
              background: 'var(--panel)',
              border: `1px solid ${tone.border}`,
              borderRadius: '12px',
              padding: '10px 12px',
              boxShadow: 'var(--shadow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              color: 'var(--text)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.14em', color: tone.text }}>
                {toast.type}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text)' }}>{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              style={{
                background: tone.bg,
                border: `1px solid ${tone.border}`,
                color: tone.text,
                borderRadius: '8px',
                padding: '2px 6px',
                cursor: 'pointer',
              }}
              aria-label="Dismiss toast"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
