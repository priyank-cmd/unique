function compactMessage(text, maxLength = 240) {
  if (typeof text !== 'string') return ''
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export function buildSameLanguageRule(latestUserMessage, responseField = 'message') {
  const sample = compactMessage(latestUserMessage)
  return `## Language
- Detect the language of the user's latest message and write the "${responseField}" value entirely in that same language.
- Apply this to all user-facing text you generate, including "options" labels and plan text.
- Match the user's script and style too.
- Never switch languages unless the user switches first.
- If the user writes a non-English language in Latin script, keep the reply in that same Latin-script style instead of switching scripts.
${sample ? `- Mirror the user's wording style from this message: ${JSON.stringify(sample)}` : '- If the language is unclear, default to English.'}`
}

export async function enforceChatPayloadLanguage(payload, latestUserMessage, deps = {}) {
  const { callClaude, claudeModel } = deps
  const sample = compactMessage(latestUserMessage)

  if (!payload || typeof payload !== 'object' || !sample || typeof callClaude !== 'function' || !claudeModel) {
    return payload
  }

  // Performance optimization: the main system prompts already instruct the model to match
  // the user's language. For typical ASCII/English turns, avoid an extra LLM rewrite call.
  const isAsciiOnly = /^[\x00-\x7F]+$/.test(sample)
  if (isAsciiOnly) return payload

  const systemPrompt = `You rewrite an assistant JSON response so it matches the user's language exactly.

Rules:
- Return ONLY valid JSON.
- Keep the same JSON structure and the same non-user-facing values.
- Rewrite all user-facing strings: "message", option labels, and user-facing plan fields.
- Preserve JSON keys, numbers, arrays, nulls, and booleans.
- Preserve proper nouns, brand names, tech names, acronyms, and URLs where needed.
- Detect the user's language, script, and tone from their latest message.
- If the user wrote in a non-English language, rewrite ALL user-facing strings into that same language.
- If the user wrote that language in Latin script, keep Latin script. Do not switch scripts unless the user did.
- If the payload already matches the user's language and style, return it with only minimal cleanup.
- Never leave stock labels or mixed-language option text in the wrong language.`

  try {
    const raw = await callClaude({
      model: claudeModel,
      max_tokens: 900,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Latest user message: ${JSON.stringify(sample)}

Rewrite this JSON:
${JSON.stringify(payload)}`,
      }],
    })

    const text = raw?.content?.[0]?.text?.trim?.() || ''
    if (!text) return payload
    return JSON.parse(text)
  } catch {
    return payload
  }
}

export async function localizePlainText(text, latestUserMessage, deps = {}) {
  const { callClaude, claudeModel } = deps
  const sample = compactMessage(latestUserMessage)
  const sourceText = typeof text === 'string' ? text.trim() : ''

  if (!sourceText || !sample || typeof callClaude !== 'function' || !claudeModel) {
    return sourceText
  }

  const systemPrompt = `You rewrite assistant text so it matches the user's language exactly.

Rules:
- Return ONLY the rewritten plain text. No JSON, no markdown fences, no explanation.
- Detect the user's language, script, and tone from their latest message.
- Rewrite the text fully into that same language and style.
- If the user wrote a non-English language in Latin script, keep Latin script.
- Preserve brand names, acronyms, product names, and URLs where needed.
- If the text already matches the user's language and style, return it with only minimal cleanup.`

  try {
    const raw = await callClaude({
      model: claudeModel,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Latest user message: ${JSON.stringify(sample)}

Rewrite this text:
${JSON.stringify(sourceText)}`,
      }],
    })

    return raw?.content?.[0]?.text?.trim?.() || sourceText
  } catch {
    return sourceText
  }
}
