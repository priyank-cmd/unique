import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User } from 'lucide-react'
import ChatBot from './components/ChatBot'
import DotAnimation from './components/DotAnimation'

// ─── Theme definitions (exact Caffeine.ai colors) ─────────────────────────────

interface AppTheme {
  id: string
  name: string
  // backgrounds
  bgPrimary: string
  bgSecondary: string
  bgTertiary: string
  // text
  textPrimary: string
  textSecondary: string
  textTertiary: string
  // brand
  brand: string
  brandDark: string
  // borders
  borderPrimary: string
  borderSecondary: string
  // circle decoration
  circleColor: string
  circleOpacity: number
  // misc
  isDark: boolean
  gridColor: string
}

const THEMES: AppTheme[] = [
  {
    id: 'cyberbunker',
    name: 'Cyber Bunker',
    bgPrimary:    '#0B0B0C',
    bgSecondary:  '#1d1d1d',
    bgTertiary:   '#2b2b2b',
    textPrimary:  '#ffffff',
    textSecondary:'#f6f6f6',
    textTertiary: '#d1d1d1',
    brand:        '#ddf730',
    brandDark:    '#bedd05',
    borderPrimary:'#767676',
    borderSecondary:'#4f4f4f',
    circleColor:  '#ddf730',
    circleOpacity: 0.38,
    isDark: true,
    gridColor: 'rgba(221,247,48,0.55)',
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    bgPrimary:    '#ffffff',
    bgSecondary:  '#fbfbfb',
    bgTertiary:   '#e7e7e7',
    textPrimary:  '#121212',
    textSecondary:'#3d3d3d',
    textTertiary: '#767676',
    brand:        '#0ac164',
    brandDark:    '#0b8a4b',
    borderPrimary:'#b0b0b0',
    borderSecondary:'#e7e7e7',
    circleColor:  '#0ac164',
    circleOpacity: 0.16,
    isDark: false,
    gridColor: 'rgba(10,193,100,0.3)',
  },
  {
    id: 'royalblue',
    name: 'Royal Blue',
    bgPrimary:    '#0b0e14',
    bgSecondary:  '#141924',
    bgTertiary:   '#293348',
    textPrimary:  '#f6f7ff',
    textSecondary:'#d1d7e7',
    textTertiary: '#a0aece',
    brand:        '#a0aece',
    brandDark:    '#798eba',
    borderPrimary:'#798eba',
    borderSecondary:'#35435f',
    circleColor:  '#a0aece',
    circleOpacity: 0.22,
    isDark: true,
    gridColor: 'rgba(160,174,206,0.35)',
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    bgPrimary:    '#0c1212',
    bgSecondary:  '#151d1e',
    bgTertiary:   '#293536',
    textPrimary:  '#f0fbfc',
    textSecondary:'#a8d1d4',
    textTertiary: '#7d9b9e',
    brand:        '#7d9b9e',
    brandDark:    '#678183',
    borderPrimary:'#678183',
    borderSecondary:'#3c4c4d',
    circleColor:  '#7d9b9e',
    circleOpacity: 0.2,
    isDark: true,
    gridColor: 'rgba(125,155,158,0.3)',
  },
]

// ─── SVG Social Icons ─────────────────────────────────────────────────────────

// Icon components removed - using image files from /assets/icons instead
/* const IconYoutube = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.75 15.5v-7l6.25 3.5-6.25 3.5z"/>
  </svg>
)

const IconTiktok = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.16 8.16 0 0 0 4.78 1.52V6.82a4.85 4.85 0 0 1-1.02-.13z"/>
  </svg>
)

const IconX = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
)

const IconInstagram = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
)

const IconDiscord = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
)

const IconLinkedin = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
) */

// ─── Brand Logo ────────────────────────────────────────────────────────────
const NhzLogo = ({
  size = 40,
  logoSrc,
  alt,
}: {
  size?: number
  logoSrc?: string
  alt?: string
}) => {
  const src = typeof logoSrc === 'string' && logoSrc.trim() ? logoSrc.trim() : '/assets/icons/Logo_Dark.png'
  const label = typeof alt === 'string' && alt.trim() ? alt.trim() : 'Company logo'

  return (
    <div className="relative flex-shrink-0 select-none" style={{ width: size, height: size }}>
      <img
        src={src}
        alt={label}
        className="w-full h-full object-contain"
        style={{ width: size, height: size }}
      />
    </div>
  )
}

// ─── Background components ────────────────────────────────────────────────────

function ThemeBg({ theme }: { theme: AppTheme }) {
  // Tokyo: dark atmospheric background
  if (theme.id === 'tokyo') {
    return (
      <>
        <motion.div className="absolute inset-0"
          animate={{ background: [
            'linear-gradient(160deg,#0c1212 0%,#0f1718 45%,#0c1212 100%)',
            'linear-gradient(155deg,#0f1718 0%,#0c1212 45%,#111a1a 100%)',
            'linear-gradient(160deg,#0c1212 0%,#0f1718 45%,#0c1212 100%)',
          ]}}
          transition={{ duration: 14, repeat: Infinity, repeatType: 'reverse' }}
        />
        {/* subtle teal glow */}
        <div className="absolute pointer-events-none"
          style={{ width: '60vmin', height: '60vmin', background: 'radial-gradient(circle,rgba(125,155,158,0.08) 0%,transparent 70%)', top: '-5%', right: '-5%', filter: 'blur(60px)' }} />
        <div className="absolute pointer-events-none"
          style={{ width: '50vmin', height: '50vmin', background: 'radial-gradient(circle,rgba(125,155,158,0.06) 0%,transparent 70%)', bottom: '0%', left: '10%', filter: 'blur(70px)' }} />
      </>
    )
  }

  // Minimalist (light)
  if (theme.id === 'minimalist') {
    return (
      <>
        <div className="absolute inset-0" style={{ background: '#ffffff' }} />
        {/* green glow top-right */}
        {/* <div className="absolute pointer-events-none"
          style={{ width: '55vmin', height: '55vmin', background: 'radial-gradient(circle,rgba(10,193,100,0.1) 0%,transparent 70%)', top: '-10%', right: '-8%', filter: 'blur(55px)' }} /> */}
      </>
    )
  }

  // Cyber Bunker: dark background + neon center glow
  if (theme.id === 'cyberbunker') {
    return (
      <>
        <div className="absolute inset-0" style={{ background: '#0B0B0C' }} />
        {/* neon glow in center */}
        <div className="absolute pointer-events-none"
          style={{ width: '60vmin', height: '60vmin', background: 'radial-gradient(circle,rgba(221,247,48,0.07) 0%,transparent 68%)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', filter: 'blur(50px)' }} />
      </>
    )
  }

  // Royal Blue
  return (
    <>
      <motion.div className="absolute inset-0"
        animate={{ background: [
          'linear-gradient(160deg,#0b0e14 0%,#0e1220 45%,#0b0e14 100%)',
          'linear-gradient(155deg,#0e1220 0%,#0b0e14 45%,#111828 100%)',
          'linear-gradient(160deg,#0b0e14 0%,#0e1220 45%,#0b0e14 100%)',
        ]}}
        transition={{ duration: 14, repeat: Infinity, repeatType: 'reverse' }}
      />
      {/* blue glow */}
      <div className="absolute pointer-events-none"
        style={{ width: '58vmin', height: '58vmin', background: 'radial-gradient(circle,rgba(160,174,206,0.08) 0%,transparent 70%)', top: '-8%', right: '-8%', filter: 'blur(60px)' }} />
    </>
  )
}

// ─── Dot grid ─────────────────────────────────────────────────────────────────

function DotGrid({ theme }: { theme: AppTheme }) {
  return (
    <motion.div className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage: `radial-gradient(${theme.gridColor} 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
      }}
      animate={{ opacity: [0.03, 0.06, 0.03] }}
      transition={{ duration: 8, repeat: Infinity, repeatType: 'reverse' }}
    />
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'nhz-theme'

export default function App() {
  const [themeId, setThemeId] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'cyberbunker' } catch { return 'cyberbunker' }
  })
  const [chatActive, setChatActive] = useState(false)
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]

  // White-label header logo for generated repos (company icon uploaded from Admin).
  const [homeLogoSrc, setHomeLogoSrc] = useState<string>('/assets/icons/Logo_Dark.png')
  const [homeLogoAlt, setHomeLogoAlt] = useState<string>('Company logo')

  useEffect(() => {
    let cancelled = false
    async function loadBrand() {
      try {
        const API_BASE = import.meta.env.VITE_API_URL || ''
        const res = await fetch(`${API_BASE}/api/generator-config`, { method: 'GET' })
        if (!res.ok) return
        const data = await res.json().catch(() => null)
        if (cancelled || !data) return

        const logoUrl =
          typeof data?.companyLogoUrl === 'string' && data.companyLogoUrl.trim()
            ? data.companyLogoUrl.trim()
            : ''
        const companyName =
          typeof data?.companyName === 'string' && data.companyName.trim()
            ? data.companyName.trim()
            : ''

        if (logoUrl) {
          setHomeLogoSrc(logoUrl)
          setHomeLogoAlt(companyName ? `${companyName} logo` : 'Company logo')
        }
      } catch {
        /* keep default */
      }
    }
    void loadBrand()
    return () => {
      cancelled = true
    }
  }, [])

  const selectTheme = (id: string) => {
    setThemeId(id)
    try { localStorage.setItem(STORAGE_KEY, id) } catch { /* ignore quota / private mode */ }
  }

  const handleChatActive = useCallback((active: boolean) => {
    setChatActive(active)
  }, [])

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top,0px)',
      }}>

      {/* ── Background ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.div key={themeId} className="absolute inset-0"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0 }}>
            <ThemeBg theme={theme} />
            <DotGrid theme={theme} />
            {!chatActive && <DotAnimation theme={theme} />}
          </motion.div>
        </AnimatePresence>
        {/* vignette for dark themes */}
        {theme.isDark && (
          <div className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 85% 75% at 50% 50%,transparent 40%,rgba(0,0,0,0.4) 100%)' }} />
        )}
      </div>

      {/* ── Header (hidden when chat is active — inner ChatBot header takes over) ── */}
      {!chatActive && <header className="relative z-50 flex-shrink-0 flex items-center justify-between px-5 sm:px-7"
        style={{
          height: '52px',
        }}>
        {/* Logo */}
        <NhzLogo size={64} logoSrc={homeLogoSrc} alt={homeLogoAlt} />

        {/* Right nav */}
        <div className="flex items-center gap-4">
          {/* info link */}
          <a
            href="https://theninehertz.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-medium transition-opacity hover:opacity-70 hidden sm:block"
            style={{ color: theme.textTertiary }}
          >
            Info
          </a>

          {/* Dark/Light toggle — Moon when dark, Sun when light */}
          <button
            onClick={() => selectTheme(theme.isDark ? 'minimalist' : 'cyberbunker')}
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
            title={theme.isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            <span className="text-[12px] font-medium" style={{ color: theme.textTertiary }}>Dark</span>
            <div className="relative flex-shrink-0 overflow-hidden" style={{ width: 44, height: 24, borderRadius: 22, background: theme.isDark ? '#4B5563' : '#D1D5DB', transition: 'background 0.2s' }}>
              <motion.div
                className="flex items-center justify-center"
                style={{ position: 'absolute', top: 2, width: 20, height: 20 }}
                animate={{ left: theme.isDark ? 22 : 2 }}
                transition={{ duration: 0.15 }}
              >
                <img
                  src={theme.isDark ? '/assets/icons/Moon.png' : '/assets/icons/Sun.png'}
                  alt={theme.isDark ? 'Dark theme' : 'Light theme'}
                  className="w-full h-full object-contain pointer-events-none"
                />
              </motion.div>
            </div>
          </button>

          {/* User avatar */}
          <motion.button
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-75"
            animate={{ background: theme.bgTertiary, color: theme.textTertiary }}
            transition={{ duration: 0.4 }}
          >
            <User size={13} />
          </motion.button>
        </div>
      </header>}

      {/* ── Chat (main content) ── */}
      <div className="flex-1 min-h-0 overflow-hidden relative z-10"
        style={{ background:'transparent'}}>
        <ChatBot fullScreen onChatActive={handleChatActive} isDarkTheme={theme.isDark} />
      </div>

      {/* ── Footer ── */}
      <footer className="relative z-50 flex-shrink-0 flex items-center justify-between px-5 sm:px-7"
        style={{
          height: '40px',
          borderTop: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
        }}>
        {/* Links */}
        <div className="flex items-center gap-4">
          {[
            { label: 'Privacy Policy', href: 'https://theninehertz.com/privacy-policy' },
            { label: 'Terms of Use',   href: 'https://theninehertz.com/terms-of-use' },
          ].map(({ label, href }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              className="text-[10.5px] transition-opacity hover:opacity-70"
              style={{ color: theme.textTertiary }}>
              {label}
            </a>
          ))}
        </div>

        {/* Social icons */}
        <div className="flex items-center gap-3.5">
          {[
          { icon: '/assets/icons/Facebook.png',  href: 'https://facebook.com/theninehertz' },
            { icon: '/assets/icons/Instagram.png', href: 'https://instagram.com/theninehertz' },
            { icon: '/assets/icons/Linkedin.png',  href: 'https://linkedin.com/company/theninehertz' },
            { icon: '/assets/icons/Twitter.png',   href: 'https://x.com/theninehertz' },
            { icon: '/assets/icons/Youtube.png',   href: 'https://youtube.com/@theninehertz' },
          ].map(({ icon, href }, i) => (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer"
              className="transition-opacity hover:opacity-70">
              <img 
                src={icon} 
                alt="" 
                className="w-[13px] h-[13px] object-contain"
                style={{ 
                  filter: theme.isDark ? 'brightness(0) invert(1)' : 'brightness(0) saturate(0)',
                  opacity: theme.isDark ? 0.8 : 0.6
                }}
              />
            </a>
          ))}
        </div>
      </footer>
    </div>
  )
}
