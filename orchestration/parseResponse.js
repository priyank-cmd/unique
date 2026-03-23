/**
 * Extract first complete JSON object from LLM text (handles code fences and trailing text).
 */
function extractFirstJSON (text) {
  if (typeof text !== 'string') return null
  const stripped = text.replace(/```\w*\n?/g, '').replace(/\n?```/g, '')
  const start = stripped.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}') { depth--; if (depth === 0) return stripped.slice(start, i + 1) }
  }
  return null
}

/**
 * Parse chat response into { message, options, questionNum, plan }.
 */
export function parseChatResponse (rawText) {
  if (typeof rawText !== 'string') return { message: '', options: null, questionNum: 0, plan: null }
  const trimmed = rawText.trim()
  try {
    const parsed = JSON.parse(trimmed)
    return normalizeParsed(parsed)
  } catch {}
  const jsonStr = extractFirstJSON(rawText)
  if (jsonStr) {
    try {
      return normalizeParsed(JSON.parse(jsonStr))
    } catch {}
  }
  return { message: trimmed, options: null, questionNum: 0, plan: null }
}

function normalizeParsed (p) {
  return {
    message: p?.message ?? '',
    options: Array.isArray(p?.options) ? p.options : null,
    questionNum: typeof p?.questionNum === 'number' ? p.questionNum : 0,
    plan: p?.plan ?? null,
  }
}
