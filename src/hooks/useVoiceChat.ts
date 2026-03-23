import { useState, useRef, useCallback, useEffect } from 'react'

interface Options {
  onTranscript: (text: string) => void
}

interface VoiceChatHook {
  isSupported: boolean
  isListening: boolean
  isSpeaking: boolean
  interimText: string
  detectedLocale: string
  startListening: () => void
  stopListening: () => void
  speak: (text: string, onEnd?: () => void) => void
  stopAll: () => void
}

// ── Module-level AudioContext ──────────────────────────────────────────────────
// Created once per page load; stays "unlocked" after the first user gesture.
// This is the key fix: `new Audio().play()` gets blocked by autoplay policy
// when called outside a user gesture, but AudioContext does not — as long as
// it was created (or resumed) at least once from a user gesture.
let sharedAudioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return sharedAudioCtx
  } catch {
    return null
  }
}

/** Call this inside any user-gesture handler to unlock the AudioContext (required for mobile TTS). */
export function unlockAudioContext(): void {
  try {
    const ctx = getAudioContext()
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
  } catch {}
}

/** Fetch TTS audio only (for prefetch). Returns ArrayBuffer or null. */
export async function fetchTTSAsArrayBuffer(
  text: string,
  locale: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, locale }),
      signal,
    })
    if (!res.ok) return null
    if (signal?.aborted) return null
    return await res.arrayBuffer()
  } catch (err: any) {
    if (err?.name === 'AbortError') return null
    return null
  }
}

/** Decode and play a pre-fetched TTS buffer. Returns true if played. */
export async function playTTSFromArrayBuffer(
  arrayBuffer: ArrayBuffer,
  options?: {
    signal?: AbortSignal
    sourceRef?: { current: AudioBufferSourceNode | null }
    onEnd?: () => void
  },
): Promise<boolean> {
  const { signal, sourceRef, onEnd } = options ?? {}
  try {
    const ctx = getAudioContext()
    if (!ctx || signal?.aborted) return false
    if (ctx.state === 'suspended') await ctx.resume()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    if (signal?.aborted) return false
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    if (sourceRef) sourceRef.current = source
    source.onended = () => {
      if (sourceRef) sourceRef.current = null
      onEnd?.()
    }
    source.start(0)
    return true
  } catch {
    return false
  }
}

/** Play TTS via /api/tts and AudioContext. Returns true if played, false if fetch failed (caller can fallback to SpeechSynthesis). */
export async function playTTSFromAPI(
  text: string,
  locale: string,
  options?: {
    signal?: AbortSignal
    sourceRef?: { current: AudioBufferSourceNode | null }
    onStart?: () => void
    onEnd?: () => void
  },
): Promise<boolean> {
  const { signal, sourceRef, onStart, onEnd } = options ?? {}
  try {
    const arrayBuffer = await fetchTTSAsArrayBuffer(text, locale, signal)
    if (!arrayBuffer) return false
    const ctx = getAudioContext()
    if (!ctx || signal?.aborted) return false
    if (ctx.state === 'suspended') await ctx.resume()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    if (signal?.aborted) return false
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    if (sourceRef) sourceRef.current = source
    onStart?.()
    source.onended = () => {
      if (sourceRef) sourceRef.current = null
      onEnd?.()
    }
    source.start(0)
    return true
  } catch (err: any) {
    if (err?.name === 'AbortError') return false
    return false
  }
}

export function prepareForSpeechExport(text: string): string {
  return prepareForSpeech(text)
}

// ── Locale helpers ─────────────────────────────────────────────────────────────

function getUserLocale(): string {
  if (typeof navigator === 'undefined') return 'en-US'
  return navigator.language || (navigator.languages && navigator.languages[0]) || 'en-US'
}

function localeLabel(locale: string): string {
  const map: Record<string, string> = {
    // 'en-IN': 'Indian English', 'hi-IN': 'Hindi',
    'en-GB': 'British English', 'en-AU': 'Australian English',
    // 'en-US': 'American English', 'en-CA': 'Canadian English',
    // 'zh-CN': 'Chinese (Mandarin)', 'zh-TW': 'Chinese (Traditional)',
    // 'ja-JP': 'Japanese', 'ko-KR': 'Korean',
    // 'fr-FR': 'French', 'de-DE': 'German',
    'es-ES': 'Spanish (Spain)', 'es-MX': 'Spanish (Mexico)',
    // 'pt-BR': 'Portuguese (Brazil)', 'pt-PT': 'Portuguese',
    // 'ar-SA': 'Arabic', 'ru-RU': 'Russian',
    // 'it-IT': 'Italian', 'nl-NL': 'Dutch',
    // 'pl-PL': 'Polish', 'tr-TR': 'Turkish',
    // 'sv-SE': 'Swedish', 'da-DK': 'Danish',
    // 'fi-FI': 'Finnish', 'nb-NO': 'Norwegian',
  }
  return map[locale] || locale
}

// ── Text pre-processing ────────────────────────────────────────────────────────

function prepareForSpeech(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '. ')
    .replace(/^\s*\d+\.\s+/gm, '. ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\bAPI\b/g, 'A P I')
    .replace(/\bUI\b/g,  'U I')
    .replace(/\bUX\b/g,  'U X')
    .replace(/\bDB\b/g,  'database')
    .replace(/\bCRM\b/g, 'C R M')
    .replace(/\bERP\b/g, 'E R P')
    .replace(/\bAI\b/g,  'A I')
    .replace(/\bSDK\b/g, 'S D K')
    .trim()
    .slice(0, 700)
}

// ── API base ───────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// ── OpenAI TTS via AudioContext ────────────────────────────────────────────────
/**
 * Fetches audio from /api/tts and plays it through the Web AudioContext.
 * AudioContext bypasses browser autoplay restrictions once it has been
 * unlocked by a user gesture (which we do in startListening).
 */
async function speakWithOpenAI(
  text: string,
  locale: string,
  sourceRef: { current: AudioBufferSourceNode | null },
  onStart: () => void,
  onEnd: () => void,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, locale }),
      signal,
    })
    if (!res.ok) {
      console.warn('[TTS] Server returned', res.status, '— falling back to browser TTS')
      return false
    }

    if (signal?.aborted) return false

    const arrayBuffer = await res.arrayBuffer()
    const ctx = getAudioContext()
    if (!ctx || signal?.aborted) return false

    if (ctx.state === 'suspended') await ctx.resume()

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

    if (signal?.aborted) return false

    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)

    sourceRef.current = source
    onStart()

    source.onended = () => { sourceRef.current = null; onEnd() }
    source.start(0)

    return true
  } catch (err: any) {
    if (err?.name === 'AbortError') return false
    console.warn('[TTS] OpenAI playback failed, using browser fallback:', err)
    return false
  }
}

// ── Browser TTS fallback ──────────────────────────────────────────────────────

function scoreVoice(voice: SpeechSynthesisVoice, locale: string): number {
  let score = 0
  const name = voice.name.toLowerCase()
  const lang = voice.lang

  if (lang === locale)                                           score += 200
  else if (lang.split('-')[0] === locale.split('-')[0])         score += 80
  if (!voice.localService)                                       score += 60
  if (name.includes('natural'))                                  score += 55
  if (name.includes('neural'))                                   score += 50
  if (name.includes('premium'))                                  score += 45
  if (name.includes('enhanced'))                                 score += 40
  if (name.includes('google'))                                   score += 38
  if (name.includes('microsoft') && name.includes('natural'))    score += 52
  if (locale.startsWith('en-IN') || locale.startsWith('hi')) {
    if (name.includes('rishi'))        score += 30
    if (name.includes('lekha'))        score += 28
    if (name.includes('google hindi')) score += 35
  }
  if (locale === 'en-GB') {
    if (name.includes('daniel'))               score += 30
    if (name.includes('google uk english'))    score += 35
  }
  if (locale === 'en-US') {
    if (name.includes('samantha'))             score += 28
    if (name.includes('google us english'))    score += 35
    if (name.includes('aria'))                 score += 30
  }
  if (name === 'microsoft zira desktop - english (united states)') score -= 30
  if (name === 'microsoft david desktop - english (united states)') score -= 30
  return score
}

function findBestVoice(locale: string, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null
  let best: SpeechSynthesisVoice | null = null
  let bestScore = -Infinity
  for (const v of voices) {
    const s = scoreVoice(v, locale)
    if (s > bestScore) { bestScore = s; best = v }
  }
  return best
}

function speakWithBrowser(
  text: string,
  locale: string,
  voices: SpeechSynthesisVoice[],
  onStart: () => void,
  onEnd: () => void,
): void {
  if (!('speechSynthesis' in window)) { onEnd(); return }
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate   = 0.92
  utterance.pitch  = 1.0
  utterance.volume = 1.0
  const best = findBestVoice(locale, voices.length ? voices : window.speechSynthesis.getVoices())
  if (best) { utterance.voice = best; utterance.lang = best.lang }
  else       { utterance.lang = locale }
  utterance.onstart = onStart
  utterance.onend   = () => onEnd()
  utterance.onerror = () => onEnd()
  window.speechSynthesis.speak(utterance)
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVoiceChat({ onTranscript }: Options): VoiceChatHook {
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking,  setIsSpeaking]  = useState(false)
  const [interimText, setInterimText] = useState('')
  const [voices, setVoices]           = useState<SpeechSynthesisVoice[]>([])

  const recognitionRef  = useRef<any>(null)
  const sourceRef       = useRef<AudioBufferSourceNode | null>(null)
  const ttsAbortRef     = useRef<AbortController | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])

  const locale         = getUserLocale()
  const detectedLocale = localeLabel(locale)

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) &&
    'speechSynthesis' in window

  // Load browser TTS voices (used only as fallback)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const load = () => {
      const v = window.speechSynthesis.getVoices()
      if (v.length) setVoices(v)
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  // ── Stop TTS ──────────────────────────────────────────────────────────────
  const stopSpeaking = useCallback(() => {
    // Abort any in-flight TTS fetch before it can start playing
    ttsAbortRef.current?.abort()
    ttsAbortRef.current = null
    // Stop AudioContext source (OpenAI TTS)
    if (sourceRef.current) {
      try { sourceRef.current.stop() } catch {}
      sourceRef.current = null
    }
    // Stop browser TTS (fallback)
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    setIsSpeaking(false)
  }, [])

  // ── Stop STT ──────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setIsListening(false)
    setInterimText('')
  }, [])

  // ── Start STT ─────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!isSupported) return
    stopSpeaking()

    // ✅ Unlock AudioContext HERE — this is a direct user-gesture call path.
    // Once unlocked, subsequent programmatic audio (AI speaking) will play fine.
    unlockAudioContext()

    if (recognitionRef.current) recognitionRef.current.stop()

    const SR  = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const rec = new SR()
    rec.continuous     = false
    rec.interimResults = true
    rec.lang           = locale

    recognitionRef.current = rec
    rec.onstart  = () => { setIsListening(true);  setInterimText('') }
    rec.onresult = (e: any) => {
      let interim = '', final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      setInterimText(final || interim)
      if (final) { onTranscriptRef.current(final.trim()); setInterimText('') }
    }
    rec.onend   = () => { setIsListening(false); setInterimText('') }
    rec.onerror = (e: any) => {
      setIsListening(false)
      setInterimText('')
      if (e?.error === 'not-allowed') console.warn('[Voice] Microphone access denied. Allow mic in browser settings.')
      else if (e?.error) console.warn('[Voice] Speech recognition error:', e.error)
    }
    rec.start()
  }, [isSupported, locale, stopSpeaking])

  // ── Speak ─────────────────────────────────────────────────────────────────
  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      stopSpeaking()

      const controller = new AbortController()
      ttsAbortRef.current = controller

      const clean   = prepareForSpeech(text)
      const onStart = () => setIsSpeaking(true)
      const onDone  = () => { setIsSpeaking(false); ttsAbortRef.current = null; onEnd?.() }

      speakWithOpenAI(clean, locale, sourceRef, onStart, onDone, controller.signal).then((ok) => {
        if (!ok && !controller.signal.aborted) {
          speakWithBrowser(clean, locale, voices, onStart, onDone)
        }
      })
    },
    [locale, voices, stopSpeaking],
  )

  // ── Stop all ──────────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    stopSpeaking()
    stopListening()
  }, [stopSpeaking, stopListening])

  useEffect(() => () => stopAll(), [stopAll])

  return { isSupported, isListening, isSpeaking, interimText, detectedLocale, startListening, stopListening, speak, stopAll }
}
