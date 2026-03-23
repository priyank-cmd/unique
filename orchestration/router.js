/**
 * Rule-based intent classifier for chat orchestration.
 * Returns 'document' | 'informative' | 'discovery'.
 */
const DOCUMENT_TERMS = [
  'trigas', 'srs', 'login', 'sign in', 'sign up', 'specs', 'specification',
  'pdf', 'document', 'doc ', ' requirements', 'functional requirements',
  'student housing', 'rental', 'transporter', 'driver',
]
const INFORMATIVE_TERMS = [
  'what', 'who', 'where', 'ninehertz', 'nine hertz', 'contact', 'about',
  'services', 'case stud', 'expertise', 'location', 'address', 'office',
  'based', 'phone', 'email', 'tech stack', 'technologies', 'company',
]

function normalize (str) {
  if (typeof str !== 'string') return ''
  return str.toLowerCase().trim()
}

/**
 * @param {string} lastUserMessage - The latest user message content
 * @returns {'document' | 'informative' | 'discovery'}
 */
export function classifyIntent (lastUserMessage) {
  const q = normalize(lastUserMessage)
  if (!q) return 'discovery'

  for (const term of DOCUMENT_TERMS) {
    if (q.includes(term)) return 'document'
  }
  for (const term of INFORMATIVE_TERMS) {
    if (q.includes(term)) return 'informative'
  }

  return 'discovery'
}
