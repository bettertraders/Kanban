export function Footer() {
  return (
    <footer style={{
      textAlign: 'center',
      padding: '40px clamp(20px, 5vw, 80px)',
      borderTop: '1px solid var(--border)',
      marginTop: '40px',
    }}>
      <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '8px', margin: '0 0 8px' }}>
        © 2026 ClawDesk. All rights reserved.
      </p>
      <p style={{ color: 'var(--muted)', fontSize: '13px', opacity: 0.7, margin: 0 }}>
        A product of The Better Traders Inc.
      </p>
    </footer>
  );
}
