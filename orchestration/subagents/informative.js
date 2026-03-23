/**
 * Informative subagent: answers from NineHertz live data only (core + retrieved chunks).
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

function followUpOptionsJson(featureFlags = {}) {
  const opts = ['Explore a project', 'See case studies']
  if (featureFlags.callEnabled) opts.push('Book a call')
  return JSON.stringify(opts)
}

function buildSystemPrompt({ brandName = 'NineHertz', websiteUrl = '', assistantShortName = 'AI', featureFlags = {} }) {
  const site = (websiteUrl || '').replace(/\/$/, '')
  const safeBrand = escapeHtml(brandName)
  const safeShort = escapeHtml(assistantShortName)
  const optsExample = followUpOptionsJson(featureFlags)

  const contactPath = site ? `${site}/contact-us` : 'theninehertz.com/contact-us'
  return `You are ${safeShort} — ${safeBrand}'s AI assistant. You answer questions about ${safeBrand} (company, services, expertise, case studies, tech stack, location, contact) using ONLY the live data below. Do not invent facts.

When introducing yourself to the user, use this exact short name: **${safeShort}** (e.g. "I'm **${safeShort}**, ${safeBrand}'s AI assistant…"). Never use the placeholder "Hz".

## CRITICAL — Response Format
You MUST respond with valid JSON only. No text outside the JSON.

{
  "message": "your response (use **bold** for emphasis, keep under 55 words)",
  "options": ${optsExample} or null,
  "questionNum": 0,
  "plan": null
}

## Rules
- Answer ONLY from the ${safeBrand} Live Data below.
- **Location, address, office, "where are you based"**: If the live data has address/city/office, include it. If not, say full contact and location details are at **${contactPath}** and offer options ${optsExample}.
- For other missing details (e.g. phone): say you don't have that detail and point to ${contactPath}; offer options ${optsExample}.
- Do NOT offer "Book a call" or scheduling a call unless it appears in the options list above (it is omitted when voice call is disabled for this deployment).
- Use questionNum: 0, plan: null. Keep message under 55 words.
- ONLY return JSON. Nothing else.`
}

/**
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ core: string, retrieved: string }} context - core + retrieved excerpts (no PDF)
 * @param {{ callClaude: (params: object) => Promise<object>, claudeModel: string }} deps
 * @returns {Promise<{ message: string, options: string[]|null, questionNum: number, plan: object|null }>}
 */
export async function runInformative (messages, context, deps) {
  const { callClaude, claudeModel, languageHint = '', brandName = 'NineHertz', websiteUrl = '', assistantShortName = 'AI', featureFlags = {} } = deps
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content ?? ''
  const languageReference = languageHint || lastUserMessage
  const liveData = [
    context.core,
    context.retrieved ? '\n\n--- Relevant excerpts for this question ---\n\n' + context.retrieved : '',
  ].filter(Boolean).join('')

  const systemPrompt = `${buildSystemPrompt({ brandName, websiteUrl, assistantShortName, featureFlags })}

${buildSameLanguageRule(languageReference)}

## Live Data
${liveData.slice(0, 25000)}`

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
export async function runInformativeStream (messages, context, deps, { sendSSE }) {
  const { callClaudeStream, claudeModel, languageHint = '', brandName = 'NineHertz', websiteUrl = '', assistantShortName = 'AI', featureFlags = {} } = deps
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content ?? ''
  const languageReference = languageHint || lastUserMessage
  const liveData = [
    context.core,
    context.retrieved ? '\n\n--- Relevant excerpts for this question ---\n\n' + context.retrieved : '',
  ].filter(Boolean).join('')
  const systemPrompt = `${buildSystemPrompt({ brandName, websiteUrl, assistantShortName, featureFlags })}

${buildSameLanguageRule(languageReference)}

## Live Data
${liveData.slice(0, 25000)}`

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
