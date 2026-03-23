/**
 * RAG Pipeline with LangGraph
 * Static PDFs → Text Extraction (pdf2json) → Chunking → Embeddings → Vector Store
 * Query: Retrieve → Build Context → LLM (answer strictly from PDF content)
 *
 * Uses pdf2json (Node-compatible). For pdf-parse, swap extractTextFromPdf.
 */
import PDFParser from 'pdf2json'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { OpenAIEmbeddings } from '@langchain/openai'
import { StateGraph, Annotation, END, START } from '@langchain/langgraph'
import { ChatAnthropic } from '@langchain/anthropic'
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PDF_DIRS = [join(__dirname, 'pdf'), join(__dirname, 'pdfs'), join(__dirname, 'src', 'pdf')]
// Tunable: larger chunks can improve context continuity; overlap reduces boundary cuts. Re-index after changing.
const CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE) || 1200
const CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP) || 250
const TOP_K = Number(process.env.RAG_TOP_K) || 8
const MAX_CONTEXT_CHARS = Number(process.env.RAG_MAX_CONTEXT_CHARS) || 10000
const RAG_BOOST_TERMS = ['trigas', 'student', 'housing', 'rental', 'srs', 'login', 'sign', 'customer', 'transporter', 'driver']

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

let vectorStore = []
let embeddingsModel = null

function getEmbeddings(apiKey) {
  if (!embeddingsModel) {
    embeddingsModel = new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: 'text-embedding-3-small',
    })
  }
  return embeddingsModel
}

async function extractTextFromPdf(buffer) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, 1)
    parser.on('pdfParser_dataError', (err) => reject(err?.parserError || new Error('PDF parse error')))
    parser.on('pdfParser_dataReady', () => resolve(parser.getRawTextContent() || ''))
    parser.parseBuffer(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer), 0)
  })
}

async function chunkText(text, metadata = {}) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    separators: ['\n\n', '\n', '. ', ' ', ''],
  })
  const chunks = await splitter.splitText(text)
  return chunks.map((content) => ({ content, metadata: { ...metadata } }))
}

export async function loadAndIndexPdfs(openaiApiKey) {
  if (!openaiApiKey) throw new Error('OPENAI_API_KEY required for embeddings')
  const pathByKey = new Map()
  for (const dir of PDF_DIRS) {
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      if (!name.toLowerCase().endsWith('.pdf')) continue
      const key = name.toLowerCase()
      if (!pathByKey.has(key)) pathByKey.set(key, { path: join(dir, name), name })
    }
  }
  const pdfPaths = [...pathByKey.values()]
  if (pdfPaths.length === 0) {
    if (!existsSync(PDF_DIRS[0])) mkdirSync(PDF_DIRS[0], { recursive: true })
    throw new Error(`No PDFs in pdf/ or pdfs/. Add files (e.g. srs.pdf) and restart.`)
  }
  vectorStore = []
  const embeddings = getEmbeddings(openaiApiKey)
  const allChunks = []

  for (const { path: filePath, name } of pdfPaths) {
    const buffer = readFileSync(filePath)
    const text = await extractTextFromPdf(buffer)
    if (!text || text.trim().length < 20) {
      console.warn(`[RAG] Skipped ${name}: no extractable text`)
      continue
    }
    const docs = await chunkText(text, { source: name })
    for (const doc of docs) allChunks.push(doc)
  }

  if (allChunks.length === 0) throw new Error('No text extracted from PDFs')
  const texts = allChunks.map((c) => c.content)
  const vectors = await embeddings.embedDocuments(texts)

  for (let i = 0; i < allChunks.length; i++) {
    vectorStore.push({
      content: allChunks[i].content,
      embedding: vectors[i],
      source: allChunks[i].metadata?.source || 'unknown',
    })
  }
  return { chunksIndexed: allChunks.length, pdfCount: pdfPaths.length }
}

const RAGState = Annotation.Root({
  question: Annotation(),
  retrievedChunks: Annotation(),
  context: Annotation(),
  answer: Annotation(),
})

function createRetrieveNode(openaiApiKey) {
  return async (state) => {
    if (vectorStore.length === 0) return { retrievedChunks: [] }
    const embeddings = getEmbeddings(openaiApiKey)
    const [queryVector] = await embeddings.embedDocuments([state.question])
    const q = state.question.toLowerCase()
    const scored = vectorStore.map((c) => {
      let score = cosineSimilarity(queryVector, c.embedding)
      const ct = c.content.toLowerCase()
      for (const term of RAG_BOOST_TERMS) {
        if (q.includes(term) && ct.includes(term)) score += 0.1
      }
      return { ...c, score }
    })
    scored.sort((a, b) => b.score - a.score)
    let totalChars = 0
    const chunks = []
    for (const s of scored.slice(0, TOP_K * 2)) {
      if (totalChars + s.content.length > MAX_CONTEXT_CHARS) break
      chunks.push({ content: s.content, source: s.source })
      totalChars += s.content.length
    }
    return { retrievedChunks: chunks }
  }
}

function createBuildContextNode() {
  return (state) => ({
    context: (state.retrievedChunks || [])
      .map((r) => `[Source: ${r.source}]\n${r.content}`)
      .join('\n\n---\n\n'),
  })
}

function createGenerateNode(anthropicApiKey) {
  const llm = new ChatAnthropic({
    anthropicApiKey,
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 500,
  })
  return async (state) => {
    const systemPrompt = `Answer ONLY using the PDF content below. Do NOT use outside knowledge. If not found, say "I couldn't find that in the documents." Be concise. Cite source when relevant.\n\n## PDF Content\n${state.context || ''}`
    const res = await llm.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: state.question },
    ])
    return { answer: res.content?.toString() || 'No response.' }
  }
}

export function getRAGGraph(openaiApiKey, anthropicApiKey) {
  const workflow = new StateGraph(RAGState)
    .addNode('retrieve', createRetrieveNode(openaiApiKey))
    .addNode('build_context', createBuildContextNode())
    .addNode('generate', createGenerateNode(anthropicApiKey))
    .addEdge(START, 'retrieve')
    .addEdge('retrieve', 'build_context')
    .addEdge('build_context', 'generate')
    .addEdge('generate', END)
  return workflow.compile()
}

export async function queryRAG(question, openaiApiKey, anthropicApiKey) {
  const graph = getRAGGraph(openaiApiKey, anthropicApiKey)
  const result = await graph.invoke({ question })
  return {
    answer: result.answer,
    sources: [...new Set((result.retrievedChunks || []).map((r) => r.source))],
  }
}

export function getStoreStats() {
  return { totalChunks: vectorStore.length }
}

export async function retrieveRAGChunksForContext(question, openaiApiKey, maxChars = 10000) {
  if (vectorStore.length === 0 || !question?.trim()) return ''
  const embeddings = getEmbeddings(openaiApiKey)
  const [queryVector] = await embeddings.embedDocuments([question.trim()])
  const q = question.toLowerCase()
  const scored = vectorStore.map((c) => {
    let score = cosineSimilarity(queryVector, c.embedding)
    const ct = c.content.toLowerCase()
    for (const term of RAG_BOOST_TERMS) {
      if (q.includes(term) && ct.includes(term)) score += 0.1
    }
    return { ...c, score }
  })
  scored.sort((a, b) => b.score - a.score)
  let totalChars = 0
  const chunks = []
  for (const s of scored.slice(0, TOP_K * 3)) {
    if (totalChars + s.content.length > maxChars) break
    chunks.push({ content: s.content, source: s.source })
    totalChars += s.content.length
  }
  if (chunks.length === 0) return ''
  return chunks.map((r) => `[Source: ${r.source}]\n${r.content}`).join('\n\n---\n\n')
}
