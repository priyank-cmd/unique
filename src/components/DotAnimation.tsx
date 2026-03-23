// ── DotAnimation ─────────────────────────────────────────────────────────────
// Animated background dots for the home/welcome screen.
// Keyframes and base styles are defined globally in src/index.css.
// Light theme: dark hex colors so dots are clearly visible on white.

type Theme = { isDark: boolean }

const DARK_DOTS = ['#FF5E79', '#006CFF', '#FF8000', '#006CFF'] as const

export default function DotAnimation({ theme }: { theme: Theme }) {
  const colors = DARK_DOTS
  const opacity = 1
  return (
    <>
      <div className="dot-animation dot-1" style={{ backgroundColor: colors[0], opacity, filter: 'none' }} />
      <div className="dot-animation dot-2" style={{ backgroundColor: colors[1], opacity, filter: 'none' }} />
      <div className="dot-animation dot-3" style={{ backgroundColor: colors[2], opacity, filter: 'none' }} />
      <div className="dot-animation dot-4" style={{ backgroundColor: colors[3], opacity, filter: 'none' }} />
    </>
  )
}
