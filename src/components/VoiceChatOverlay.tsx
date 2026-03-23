import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Volume2, X } from 'lucide-react'

interface Props {
  isListening: boolean
  isSpeaking: boolean
  interimText: string
  detectedLocale: string  // human-readable label e.g. "Indian English"
  onStop: () => void      // close / deactivate voice mode
  onTapMic: () => void   // tap to re-start listening when idle
  isDarkTheme?: boolean  // theme flag
}

// Animated sound-wave bars shown while AI is speaking
function SoundBars() {
  const bars = [0.6, 1, 0.7, 1, 0.5, 0.85, 0.65]
  return (
    <div className="flex items-center gap-[3px]">
      {bars.map((h, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{ width: 3, background: '#60A5FA' }}
          animate={{ height: [4, h * 20, 4] }}
          transition={{
            duration: 0.7,
            repeat: Infinity,
            delay: i * 0.09,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

// Pulsing mic rings shown while listening
function ListeningRings() {
  return (
    <div className="relative flex items-center justify-center">
      {[1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-blue-400/40"
          animate={{ scale: [1, 1.6 + i * 0.3], opacity: [0.5, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.35, ease: 'easeOut' }}
          style={{ width: 36, height: 36 }}
        />
      ))}
      <div className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', boxShadow: '0 0 16px rgba(37,99,235,0.55)' }}>
        <Mic size={16} className="text-white" />
      </div>
    </div>
  )
}

export default function VoiceChatOverlay({ isListening, isSpeaking, interimText, detectedLocale, onStop, onTapMic, isDarkTheme = true }: Props) {
  const isIdle = !isListening && !isSpeaking

  const statusLabel = isListening
    ? 'Listening…'
    : isSpeaking
    ? 'Speaking…'
    : 'Tap mic to speak'

  return (
    <AnimatePresence>
      <motion.div
        key="voice-overlay"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.22 }}
        className="flex-shrink-0 px-4 pb-2"
        style={{ maxWidth: 672, margin: '0 auto', width: '100%' }}
      >
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-2xl"
          style={{
            background: isDarkTheme ? 'rgba(255,255,255,0.05)' : '#322e2e',
            border: isDarkTheme ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Left: icon + animation */}
          <button
            onClick={isIdle ? onTapMic : undefined}
            className="flex-shrink-0"
            title={isIdle ? 'Tap to speak' : undefined}
          >
            {isSpeaking ? (
              <div className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)' }}>
                <Volume2 size={15} className="text-blue-400" />
              </div>
            ) : isListening ? (
              <ListeningRings />
            ) : (
              /* idle — tap to speak */
              <div className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <Mic size={15} className="text-white/50" />
              </div>
            )}
          </button>

          {/* Center: status + transcript */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isSpeaking && <SoundBars />}
              <p className="text-[12px] font-medium"
                style={{ color: isListening ? '#60A5FA' : isSpeaking ? '#93C5FD' : 'rgba(255,255,255,0.35)' }}>
                {statusLabel}
              </p>
            </div>
            {interimText && (
              <p className="text-[11px] text-white/55 mt-0.5 truncate">{interimText}</p>
            )}
          </div>

          {/* Right: detected locale badge + close */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(37,99,235,0.18)', color: '#60A5FA', border: '1px solid rgba(37,99,235,0.25)' }}>
                Voice
              </span>
              <span className="text-[9px] text-white/30 pr-1">{detectedLocale}</span>
            </div>
            <button
              onClick={onStop}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
              style={{ color: 'rgba(255,255,255,0.35)' }}
              title="Exit voice mode"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
