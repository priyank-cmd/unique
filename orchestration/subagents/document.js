/**
 * Document subagent: answers ONLY from RAG PDF content.
 */
import { parseChatResponse } from '../parseResponse.js'
import { buildSameLanguageRule, enforceChatPayloadLanguage } from '../../language.js'

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]))
}

function docFollowUpOptions(featureFlags = {}) {
  const opts = ['Explore a project', 'See case studies']
  if (featureFlags.callEnabled) opts.push('Book a call')
  return JSON.stringify(opts)
}

function buildSystemPrompt({ brandName = 'NineHertz', assistantShortName = 'AI', featureFlags = {} }) {
  const safeShort = escapeHtml(assistantShortName)
  const opts = docFollowUpOptions(featureFlags)
  return `You are ${safeShort} — ${escapeHtml(brandName)}'s AI assistant. Answer ONLY using the PDF content below. Do NOT use outside knowledge. Be specific (e.g. field counts, feature names). When using specific facts, mention the source document (e.g. "According to the Employee Awareness Guide…" or "Per the SRS…"). If the answer is not in the PDF, say "I couldn't find that in the documents."

Use short name **${safeShort}** when referring to yourself — never "Hz".

## CRITICAL — Response Format
You MUST respond with valid JSON only. No text outside the JSON.

{
  "message": "your response (use **bold** for emphasis, keep under 55 words)",
  "options": ${opts},
  "questionNum": 0,
  "plan": null
}

## Rules
- Answer ONLY from the PDF Document Content below. Use questionNum: 0. Options must be exactly: ${opts}.
- Do NOT include "Book a call" unless it appears in that list.
- ONLY return JSON. Nothing else.`
}

/**
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ pdfContext: string }} context - RAG-retrieved PDF content only
 * @param {{ callClaude: (params: object) => Promise<object>, claudeModel: string }} deps
 * @returns {Promise<{ message: string, options: string[]|null, questionNum: number, plan: object|null }>}
 */
export async function runDocument (messages, context, deps) {
  const { callClaude, claudeModel, languageHint = '', brandName = 'NineHertz', assistantShortName = 'AI', featureFlags = {} } = deps
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content ?? ''
  const languageReference = languageHint || lastUserMessage
  if (!context.pdfContext || !context.pdfContext.trim()) {
    return enforceChatPayloadLanguage({
      message: "I don't have any PDF documents loaded to answer from. Add SRS or project docs and try again. Document search is currently unavailable; I can still help with general or project questions.",
      options: JSON.parse(docFollowUpOptions(featureFlags)),
      questionNum: 0,
      plan: null,
    }, languageReference, deps)
  }

  const systemPrompt = `${buildSystemPrompt({ brandName, assistantShortName, featureFlags })}

${buildSameLanguageRule(languageReference)}

## PDF Document Content
${context.pdfContext.slice(0, 15000)}`

  const raw = await callClaude({
    model: claudeModel,
    max_tokens: 600,
    system: systemPrompt,
    messages: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
  })

  const rawText = raw?.content?.[0]?.text ?? ''
  return enforceChatPayloadLanguage(parseChatResponse(rawText), languageReference, deps)
}

/**
 * Stream version: send SSE text deltas then a final done event.
 * @param {{ sendSSE: (data: object) => void }} opts
 */
export async function runDocumentStream (messages, context, deps, { sendSSE }) {
  const { callClaudeStream, claudeModel, languageHint = '', brandName = 'NineHertz', assistantShortName = 'AI', featureFlags = {} } = deps
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content ?? ''
  const languageReference = languageHint || lastUserMessage
  if (!context.pdfContext || !context.pdfContext.trim()) {
    const fallback = await enforceChatPayloadLanguage({
      message: "I don't have any PDF documents loaded to answer from. Add SRS or project docs and try again. Document search is currently unavailable; I can still help with general or project questions.",
      options: JSON.parse(docFollowUpOptions(featureFlags)),
      questionNum: 0,
      plan: null,
    }, languageReference, deps)
    sendSSE({
      type: 'done',
      ...fallback,
    })
    return
  }
  const systemPrompt = `${buildSystemPrompt({ brandName, assistantShortName, featureFlags })}

${buildSameLanguageRule(languageReference)}

## PDF Document Content
${context.pdfContext.slice(0, 15000)}`

  const stream = callClaudeStream({
    model: claudeModel,
    max_tokens: 600,
    system: systemPrompt,
    messages: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
  })
  stream.on('text', (delta) => sendSSE({ type: 'text', text: delta }))
  try {
    const rawText = await stream.finalText()
    const parsed = await enforceChatPayloadLanguage(parseChatResponse(rawText), languageReference, deps)
    sendSSE({ type: 'done', ...parsed })
  } catch (err) {
    sendSSE({ type: 'error', message: err?.message || 'Stream failed' })
  }
}
