/**
 * Discovery subagent: guided Q1 → Q2 → Q3 → plan. Uses full context (core + retrieved + PDF).
 */
import { parseChatResponse } from '../parseResponse.js'
import { buildSameLanguageRule, enforceChatPayloadLanguage } from '../../language.js'

const DISCOVERY_MAX_TOKENS = 1400
const DISCOVERY_RETRY_MAX_TOKENS = 2600

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]))
}

function buildDiscoverySystemBase({ brandName = 'NineHertz', websiteUrl = '', assistantShortName = 'AI', featureFlags = {} }) {
  const safeBrand = escapeHtml(brandName)
  const safeShort = escapeHtml(assistantShortName)
  const site = (websiteUrl || '').replace(/\/$/, '')
  const contactPath = site ? `${site}/contact` : 'theninehertz.com/contact'
  const callEnabled = !!featureFlags.callEnabled
  const postPlanOptions = callEnabled
    ? '["Ask a question", "Get cost estimate", "Book a call"]'
    : '["Ask a question", "Get cost estimate"]'
  const nextStepHint = callEnabled
    ? `Book a free 30-min scoping call with ${safeBrand}`
    : `Continue planning in chat or visit ${safeBrand}'s website for next steps`

  return `You are ${safeShort} — ${safeBrand}'s AI assistant. You run **guided discovery** for users who want to build or scope a project. Use ONLY the live data and any PDF content below to inform your answers and plan.

When you introduce yourself, use the name **${safeShort}** (never "Hz").

## CRITICAL — Response Format
You MUST respond with valid JSON only. No text outside the JSON.

{
  "message": "your response (use **bold** for emphasis, keep under 55 words)",
  "options": ["opt1", "opt2", "opt3", "opt4"] or null,
  "questionNum": 1,
  "plan": null
}

## Discovery flow
1. User mentions a project → Acknowledge with ${safeBrand} expertise (1 sentence) → ask Q1
2. After Q1 answered → ask Q2
3. After Q2 answered → ask Q3
4. After Q3 answered → generate plan (set questionNum to 0, include plan object)

Ask ONE question per turn. Use options array whenever asking a question.

Q1 (questionNum:1): Industry/niche — if already clear from context, skip to Q2
Q2 (questionNum:2): Primary pain point / goal right now
Q3 (questionNum:3): Current development stage

Stage options must cover these 4 meanings, but MUST be written in the user's language:
- building from scratch (MVP)
- upgrading existing system
- scaling fast
- adding AI capabilities

## Plan Generation (after Q3 — set questionNum:0)
Include a plan object in the JSON:

{
  "message": "Here's your personalised roadmap based on ${safeBrand}'s expertise: 🗺️",
  "options": ${postPlanOptions},
  "questionNum": 0,
  "plan": {
    "title": "descriptive project title",
    "pillar": "BUILD" or "RUN" or "EVOLVE",
    "caseStudyMatch": "name of closest ${safeBrand} case study from context (exact name if found)",
    "expertiseSummary": "${safeBrand} has delivered X for Y type clients — one specific claim",
    "phases": [
      { "num": 1, "name": "Discovery & Architecture", "duration": "1-2 weeks", "tasks": ["Requirements & stakeholder workshops", "System architecture design", "API & data contracts"] },
      { "num": 2, "name": "Core Development", "duration": "8-12 weeks", "tasks": ["Backend APIs & business logic", "Frontend UI & dashboards", "Third-party integrations", "Database design & optimisation"] },
      { "num": 3, "name": "Launch & Evolve", "duration": "2-3 weeks", "tasks": ["QA & load testing", "Cloud deployment & monitoring", "AI feature roadmap planning"] }
    ],
    "techStack": ["React", "Node.js", "PostgreSQL", "AWS"],
    "estimatedTimeline": "11-17 weeks",
    "nextStep": "${nextStepHint}"
  }
}

## Rules
- ONLY return JSON. Nothing else.
- Keep message under 55 words (excluding plan)
- Options: max 4 items, each under 32 characters
${callEnabled ? '' : '- Do NOT include "Book a call" or phone/voice scheduling in options (calls are disabled for this deployment).\n'}- Do not leave option labels or stock phrases in English when the user is speaking Hindi/Hinglish.
- Plan tasks: make them project-specific and actionable
- Tech stack: choose realistically for the project type
- Only reference case studies you found in the live data above
- If user sends a message after plan is shown, answer helpfully (questionNum: 0, plan: null)`
}

function isLikelyTruncatedDiscoveryJson (rawText, parsed) {
  const trimmed = typeof rawText === 'string' ? rawText.trim() : ''
  return !!trimmed && trimmed.startsWith('{') && parsed?.message === trimmed && !parsed?.plan
}

async function generateDiscoveryPayload (messages, systemPrompt, deps) {
  const { callClaude, claudeModel } = deps
  const messageHistory = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }))

  const callDiscovery = async (maxTokens, extraInstruction = '') => {
    const raw = await callClaude({
      model: claudeModel,
      max_tokens: maxTokens,
      system: extraInstruction ? `${systemPrompt}\n\n${extraInstruction}` : systemPrompt,
      messages: messageHistory,
    })
    const rawText = raw?.content?.[0]?.text ?? ''
    return { raw, rawText, parsed: parseChatResponse(rawText) }
  }

  let result = await callDiscovery(DISCOVERY_MAX_TOKENS)
  const shouldRetry = result?.raw?.stop_reason === 'max_tokens' || isLikelyTruncatedDiscoveryJson(result.rawText, result.parsed)

  if (shouldRetry) {
    result = await callDiscovery(
      DISCOVERY_RETRY_MAX_TOKENS,
      'IMPORTANT: Your previous reply was truncated. Regenerate the full response from scratch as one complete valid JSON object. Do not cut off any field.',
    )
  }

  return result.parsed
}

/**
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ fullContext: string }} context - core + retrieved + pdfContext combined (same as current chat)
 * @param {{ callClaude: (params: object) => Promise<object>, claudeModel: string }} deps
 * @returns {Promise<{ message: string, options: string[]|null, questionNum: number, plan: object|null }>}
 */
export async function runDiscovery (messages, context, deps) {
  const { callClaude, claudeModel, languageHint = '', brandName = 'NineHertz', websiteUrl = '', assistantShortName = 'AI', featureFlags = {} } = deps
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content ?? ''
  const languageReference = languageHint || lastUserMessage

  const systemPrompt = `${buildDiscoverySystemBase({ brandName, websiteUrl, assistantShortName, featureFlags })}

${buildSameLanguageRule(languageReference)}

## Live Data (core + relevant excerpts + PDF when relevant)
${(context.fullContext || '').slice(0, 25000)}`

  const parsed = await generateDiscoveryPayload(messages, systemPrompt, { callClaude, claudeModel })
  return enforceChatPayloadLanguage(parsed, languageReference, deps)
}

/**
 * Stream version: send SSE text deltas then a final done event.
 * @param {{ sendSSE: (data: object) => void }} opts
 */
export async function runDiscoveryStream (messages, context, deps, { sendSSE }) {
  const { callClaudeStream, callClaude, claudeModel, languageHint = '', brandName = 'NineHertz', websiteUrl = '', assistantShortName = 'AI', featureFlags = {} } = deps
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content ?? ''
  const languageReference = languageHint || lastUserMessage
  const systemPrompt = `${buildDiscoverySystemBase({ brandName, websiteUrl, assistantShortName, featureFlags })}

${buildSameLanguageRule(languageReference)}

## Live Data (core + relevant excerpts + PDF when relevant)
${(context.fullContext || '').slice(0, 25000)}`

  if (typeof callClaude === 'function') {
    try {
      const parsed = await generateDiscoveryPayload(messages, systemPrompt, { callClaude, claudeModel })
      const localized = await enforceChatPayloadLanguage(parsed, languageReference, deps)
      sendSSE({ type: 'done', ...localized })
    } catch (err) {
      sendSSE({ type: 'error', message: err?.message || 'Stream failed' })
    }
    return
  }

  const stream = callClaudeStream({
    model: claudeModel,
    max_tokens: DISCOVERY_RETRY_MAX_TOKENS,
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
