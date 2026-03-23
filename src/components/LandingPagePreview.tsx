import { useState } from 'react'
import { Copy, Download, ExternalLink, Check, Code2, Globe } from 'lucide-react'

interface Props {
  html: string
  title: string
}

const toolBtn: React.CSSProperties = {
  width: '28px',
  height: '28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '7px',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.55)',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background 0.15s, color 0.15s',
}

export default function LandingPagePreview({ html, title }: Props) {
  const [tab, setTab]       = useState<'preview' | 'code'>('preview')
  const [copied, setCopied] = useState(false)

  const slug = (title || 'landing').replace(/[^a-z0-9]+/gi, '-').toLowerCase()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(html)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const handleDownload = () => {
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${slug}-landing.html`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 500)
  }

  const handleOpen = () => {
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  return (
    <div style={{
      margin: '4px 20px 16px',
      borderRadius: '14px',
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(0,0,0,0.25)',
    }}>
      {/* ── Header bar ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['preview', 'code'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 11px',
                borderRadius: '7px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: tab === t ? 'rgba(124,58,237,0.18)' : 'transparent',
                color: tab === t ? '#a78bfa' : 'rgba(255,255,255,0.38)',
                border: tab === t ? '1px solid rgba(124,58,237,0.32)' : '1px solid transparent',
              }}
            >
              {t === 'preview' ? <Globe size={11} /> : <Code2 size={11} />}
              {t === 'preview' ? 'Preview' : 'Code'}
            </button>
          ))}
        </div>

        {/* Label + Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginRight: '4px' }}>
            {slug}-landing.html
          </span>

          <button
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy HTML'}
            style={{
              ...toolBtn,
              ...(copied ? { background: 'rgba(16,185,129,0.18)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' } : {}),
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>

          <button onClick={handleDownload} title="Download HTML" style={toolBtn}>
            <Download size={12} />
          </button>

          <button onClick={handleOpen} title="Open in new tab" style={toolBtn}>
            <ExternalLink size={12} />
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      {tab === 'preview' ? (
        <div style={{ position: 'relative' }}>
          {/* Browser-chrome strip */}
          <div style={{
            padding: '7px 12px',
            background: 'rgba(255,255,255,0.03)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <div style={{ display: 'flex', gap: '5px' }}>
              {['#ff5f57','#ffbd2e','#28c840'].map(c => (
                <div key={c} style={{ width: '10px', height: '10px', borderRadius: '50%', background: c, opacity: 0.7 }} />
              ))}
            </div>
            <div style={{
              flex: 1,
              margin: '0 8px',
              padding: '3px 10px',
              borderRadius: '5px',
              background: 'rgba(255,255,255,0.06)',
              fontSize: '10px',
              color: 'rgba(255,255,255,0.3)',
            }}>
              {slug}.com
            </div>
          </div>
          <iframe
            srcDoc={html}
            title={`${title} Landing Page`}
            style={{
              width: '100%',
              height: '520px',
              border: 'none',
              display: 'block',
              background: '#fff',
            }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      ) : (
        <pre style={{
          margin: 0,
          padding: '14px',
          fontSize: '10.5px',
          lineHeight: '1.6',
          color: 'rgba(255,255,255,0.65)',
          background: 'rgba(0,0,0,0.35)',
          maxHeight: '520px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        }}>
          {html}
        </pre>
      )}
    </div>
  )
}
