import React, { useEffect, useState } from 'react'

export function AudioFile({ path, label }: { path: string; label?: string }): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let revoked: string | null = null
    setUrl(null)
    setErr(null)
    window.api.fs.readFile(path)
      .then(buf => {
        const u = URL.createObjectURL(new Blob([new Uint8Array(buf)]))
        revoked = u
        setUrl(u)
      })
      .catch(e => setErr(String(e?.message ?? e)))
    return () => { if (revoked) URL.revokeObjectURL(revoked) }
  }, [path])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {label && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>}
      {url && <audio controls src={url} style={{ height: 32 }} />}
      {err && <span style={{ color: 'var(--red)', fontSize: 11 }}>{err}</span>}
      <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => window.api.shell.openPath(path)}>
        Open file
      </button>
    </div>
  )
}
