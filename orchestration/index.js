/**
 * Orchestrator: classify intent and delegate to the appropriate subagent.
 * Same request/response contract as POST /api/chat.
 */
import { classifyIntent } from './router.js'
import { runInformative, runInformativeStream } from './subagents/informative.js'
import { runDocument, runDocumentStream } from './subagents/document.js'
import { runDiscovery, runDiscoveryStream } from './subagents/discovery.js'

const GENERIC_QUESTION = /^(what is|what are|how do|how does|explain|define|tell me about|describe|when do|when does)\b/i
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildBrandRegex(brandName = 'NineHertz') {
  const bn = String(brandName || 'NineHertz').trim()
  if (!bn) return /ninehertz|nine hertz/i

  // Support both "NineHertz" and "Nine Hertz" variants (camelcase split by whitespace).
  const spaced = bn
    .replace(/([a-z0-9])([A-Z])/g, '$1\\s*\\$2')
    .replace(/\s+/g, '\\s+')

  return new RegExp(`${escapeRegExp(bn)}|${spaced}`, 'i')
}

/**
 * Compute intent from last user message, PDF context length, and keyword-based intent.
 * Exported for unit tests.
 * @param {string} lastUserMessage
 * @param {string} pdfContext
 * @param {string} keywordIntent - result of classifyIntent(lastUserMessage)
 * @returns {'document' | 'informative' | 'discovery'}
 */
export function computeIntent (lastUserMessage, pdfContext, keywordIntent, brandName = 'NineHertz') {
  const hasRelevantPDF = (pdfContext || '').trim().length > 200
  const isGenericQuestion = GENERIC_QUESTION.test((lastUserMessage || '').trim())
  const asksAboutBrand = buildBrandRegex(brandName).test(lastUserMessage || '')
  // If keyword intent says "informative", do not override to "document".
  // Brand/company questions like "what is NineHertz" should be answered from
  // live site context (core + retrieved chunks), not from unrelated PDF content.
  if (keywordIntent === 'informative') return 'informative'

  // If keyword intent says "document", still prefer the document path only when we actually have PDF content.
  if (keywordIntent === 'document') return hasRelevantPDF ? 'document' : 'discovery'

  return hasRelevantPDF && isGenericQuestion && !asksAboutBrand ? 'document' : keywordIntent
}

/**
 * Build context and run the chosen subagent. Fallback to discovery on subagent error.
 *
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{
 *   requestId?: string,
 *   getCachedChunks: () => Promise<Array<{ text: string, url: string, label: string }>>,
 *   buildCore: (chunks: Array) => string,
 *   retrieveChunks: (chunks: Array, query: string, maxChars: number) => string[],
 *   retrieveRAGChunksForContext: (question: string, openaiApiKey: string) => Promise<string>,
 *   callClaude: (params: object) => Promise<object>,
 *   languageHint?: string,
 *   openaiApiKey: string,
 *   claudeModel: string,
 *   retrievedMaxChars?: number,
 * }} options
 * @returns {Promise<{ message: string, options: string[]|null, questionNum: number, plan: object|null }>}
 */
export async function orchestrate (messages, options) {
  const {
    requestId = '',
    getCachedChunks,
    buildCore,
    retrieveChunks,
    retrieveRAGChunksForContext,
    callClaude,
    languageHint = '',
    openaiApiKey,
    claudeModel,
    retrievedMaxChars = 15000,
    brandName = 'NineHertz',
    websiteUrl = '',
  } = options

  const log = (prefix, ...args) => {
    if (requestId) console.warn(`[${requestId}]`, prefix, ...args)
    else console.warn(prefix, ...args)
  }

  const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content ?? ''

  let chunks = []
  try {
    chunks = await getCachedChunks()
  } catch (e) {
    log('[Orchestration] getCachedChunks failed:', e?.message)
  }

  const core = buildCore(chunks)
  const retrievedList = retrieveChunks(chunks, lastUserMessage, retrievedMaxChars)
  const retrieved = retrievedList.length ? retrievedList.join('\n\n') : ''

  let pdfContext = ''

  // RAG-driven routing: if we have relevant PDF content and the question is generic
  // (what is, how does, explain, etc.), answer from documents — no keyword list needed per PDF topic
  const keywordIntent = classifyIntent(lastUserMessage)

  // Performance: for keyword intent "informative" (e.g. "what is NineHertz"),
  // the computeIntent() no longer needs PDF context. Skip expensive RAG calls.
  if (openaiApiKey && keywordIntent !== 'informative') {
    try {
      pdfContext = await retrieveRAGChunksForContext(lastUserMessage, openaiApiKey)
    } catch (e) {
      log('[RAG] chat context failed:', e?.message || e)
    }
  }

  const intent = computeIntent(lastUserMessage, pdfContext, keywordIntent, brandName)
  const intentReason = intent === 'document' ? 'document (RAG+generic)' : `${intent} (keyword)`
  if (requestId) {
    const hasRelevantPDF = pdfContext.trim().length > 200
    console.warn(`[${requestId}] intent=${intent} reason=${intentReason} pdfContextLen=${pdfContext.trim().length} hasRelevantPDF=${hasRelevantPDF}`)
  }

  const deps = { callClaude, claudeModel, languageHint, brandName, websiteUrl }

  const runWithFallback = async () => {
    try {
      if (intent === 'document') {
        return await runDocument(
          messages,
          { pdfContext },
          deps,
        )
      }
      if (intent === 'informative') {
        return await runInformative(
          messages,
          { core, retrieved },
          deps,
        )
      }
      const fullContext = [
        core,
        retrieved ? '\n\n--- Relevant excerpts for this question ---\n\n' + retrieved : '',
        pdfContext ? '\n\n--- PDF Document Content (SRS, specs, Trigas — answer from this when relevant) ---\n\n' + pdfContext : '',
      ].filter(Boolean).join('')
      return await runDiscovery(messages, { fullContext }, deps)
    } catch (err) {
      log(`[Orchestration] ${intent} subagent failed, falling back to discovery:`, err?.message)
      const fullContext = [
        core,
        retrieved ? '\n\n--- Relevant excerpts ---\n\n' + retrieved : '',
        pdfContext ? '\n\n--- PDF Document Content ---\n\n' + pdfContext : '',
      ].filter(Boolean).join('')
      return await runDiscovery(messages, { fullContext }, deps)
    }
  }

  return runWithFallback()
}

/**
 * Streaming orchestration: same intent/context as orchestrate, but streams SSE events
 * (type: 'text' with text delta, then type: 'done' with message/options/questionNum/plan, or type: 'error').
 *
 * @param {Array<{ role: string, content: string }>} messages
 * @param {object} options - same as orchestrate but callClaudeStream instead of callClaude, and sendSSE: (data) => void
 */
export async function orchestrateStream (messages, options) {
  const {
    requestId = '',
    getCachedChunks,
    buildCore,
    retrieveChunks,
    retrieveRAGChunksForContext,
    callClaude,
    callClaudeStream,
    languageHint = '',
    openaiApiKey,
    claudeModel,
    retrievedMaxChars = 15000,
    sendSSE,
    brandName = 'NineHertz',
    websiteUrl = '',
  } = options

  const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content ?? ''

  let chunks = []
  try {
    chunks = await getCachedChunks()
  } catch (e) {
    if (requestId) console.warn(`[${requestId}]`, '[Orchestration] getCachedChunks failed:', e?.message)
  }

  const core = buildCore(chunks)
  const retrievedList = retrieveChunks(chunks, lastUserMessage, retrievedMaxChars)
  const retrieved = retrievedList.length ? retrievedList.join('\n\n') : ''

  let pdfContext = ''
  const keywordIntent = classifyIntent(lastUserMessage)

  // Performance: for keyword intent "informative", skip expensive RAG retrieval.
  if (openaiApiKey && keywordIntent !== 'informative') {
    try {
      pdfContext = await retrieveRAGChunksForContext(lastUserMessage, openaiApiKey)
    } catch (e) {
      if (requestId) console.warn(`[${requestId}]`, '[RAG] chat context failed:', e?.message || e)
    }
  }

  const intent = computeIntent(lastUserMessage, pdfContext, keywordIntent, brandName)
  const deps = { callClaude, callClaudeStream, claudeModel, languageHint, brandName, websiteUrl }

  const runStream = async () => {
    try {
      if (intent === 'document') {
        return await runDocumentStream(messages, { pdfContext }, deps, { sendSSE })
      }
      if (intent === 'informative') {
        return await runInformativeStream(messages, { core, retrieved }, deps, { sendSSE })
      }
      const fullContext = [
        core,
        retrieved ? '\n\n--- Relevant excerpts for this question ---\n\n' + retrieved : '',
        pdfContext ? '\n\n--- PDF Document Content (SRS, specs, Trigas — answer from this when relevant) ---\n\n' + pdfContext : '',
      ].filter(Boolean).join('')
      return await runDiscoveryStream(messages, { fullContext }, deps, { sendSSE })
    } catch (err) {
      sendSSE({ type: 'error', message: err?.message || 'Stream failed' })
    }
  }

  await runStream()
}
