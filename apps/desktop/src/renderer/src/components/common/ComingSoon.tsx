import React from 'react'

// Views that are not finished yet: a large "Coming soon" instead of a half-working screen.
export function ComingSoon({ name, icon }: { name: string; icon: string }): React.ReactElement {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 64, filter: 'grayscale(0.6)', opacity: 0.7 }}>{icon}</div>
      <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: '0.02em', color: 'var(--text-primary)' }}>Coming soon</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-light)' }}>{name}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 440, lineHeight: 1.6 }}>
        This part of AI Music Studio is still being built. It arrives with a later update; the app updates itself.
      </div>
    </div>
  )
}
