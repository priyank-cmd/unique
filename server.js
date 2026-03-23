import express from 'express'
import cors from 'cors'
import axios from 'axios'
import * as cheerio from 'cheerio'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI, { toFile } from 'openai'
import { config } from 'dotenv'
import { loadAndIndexPdfs, queryRAG, getStoreStats, retrieveRAGChunksForContext } from './rag.js'
import { orchestrate, orchestrateStream } from './orchestration/index.js'
import { buildSameLanguageRule, localizePlainText } from './language.js'
import {
  getMatchingCaseStudiesPrompt,
  getFlowAgentPrompt,
  getDesignConceptToStructuredPromptInputs,
  getCallAgentChatSystemPrompt,
  getDesignAgentPrompt,
  getLandingPagePrompt,
  getSrsPrompt,
} from './prompts.js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { MongoClient, ObjectId } from 'mongodb'
import multer from 'multer'
import { generateAndPushToGitHub } from './services/generator/index.js'
import { createSerialJobQueue } from './services/generator/jobQueue.js'

// Require Node 20+ (Vite 7 and some deps need it)
const major = parseInt(process.versions.node.split('.')[0], 10)
if (major < 20) {
  console.error('Node.js 20 or later is required. You have:', process.versions.node)
  console.error('Upgrade: https://nodejs.org/ or use nvm: nvm install 20 && nvm use 20')
  process.exit(1)
}

// Load .env from the directory where server.js lives (not cwd), so it works when started from any folder
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '.env')
config({ path: envPath, override: process.env.NODE_ENV !== 'production' })
const UPLOADS_DIR = join(__dirname, 'uploads')
const COMPANY_LOGO_DIR = join(UPLOADS_DIR, 'company-logos')
if (!existsSync(COMPANY_LOGO_DIR)) mkdirSync(COMPANY_LOGO_DIR, { recursive: true })

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' })) // raised for base64 audio payloads
app.use('/uploads', express.static(UPLOADS_DIR))

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
// Trim key; leading/trailing spaces or newlines in .env often cause 401
const openaiApiKey = process.env.OPENAI_API_KEY?.trim?.() || ''
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null

// ─── Admin Auth ──────────────────────────────────────────────────────────────
const DEFAULT_LOCAL_MONGODB_URI = 'mongodb://127.0.0.1:27017'
const MONGODB_URI = process.env.MONGODB_URI?.trim?.() || DEFAULT_LOCAL_MONGODB_URI
const ADMIN_DB_NAME = process.env.ADMIN_DB_NAME?.trim?.() || 'nhz_ai_admin'
const ADMIN_USERS_COLLECTION = 'admin_users'
const COMPANIES_COLLECTION = 'companies'
const PROJECT_GENERATION_JOBS_COLLECTION = 'project_generation_jobs'
const COMPANY_FEATURE_OPTIONS = ['chat', 'call', 'srs', 'multiLanguage']
const PROJECT_GENERATOR_FEATURE_OPTIONS = ['chat', 'srs', 'call']
// Admin session expiry for JWT-like bearer tokens.
// User requested: expire after 24 hours.
const ADMIN_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const ADMIN_AUTH_SECRET = process.env.ADMIN_AUTH_SECRET?.trim?.() || ''
const DEFAULT_ADMIN = {
  name: process.env.ADMIN_NAME?.trim?.() || 'Super Admin',
  email: (process.env.ADMIN_EMAIL?.trim?.() || '').toLowerCase(),
  password: process.env.ADMIN_PASSWORD?.trim?.() || '',
  role: 'admin',
}

// ─── Runtime feature gating (generated apps) ──────────────────────────────────
// Generated bundles store company features in `generator.config.json` at repo root.
// This server reads that file to ensure only the enabled feature UI/data appear.
const GENERATOR_CONFIG_CACHE_MS = 1500
let _resolvedGeneratorFeatures = null
let _resolvedGeneratorFlags = null
let _resolvedGeneratorCompanyWebsiteUrl = null
let _resolvedGeneratorCompanyName = null
let _resolvedGeneratorCompanyLogoUrl = null
let _resolvedGeneratorCompanyOtherUrls = null
let _resolvedGeneratorCacheTime = 0

/** Resolve a web path like `/uploads/company-logos/foo.png` to an absolute file under this app root. */
function resolvePublicPathToAbsolute(publicPath) {
  if (!publicPath || typeof publicPath !== 'string') return null
  const rel = publicPath.replace(/^\/+/, '')
  if (!rel || rel.includes('..')) return null
  const abs = join(__dirname, rel)
  if (!abs.startsWith(__dirname)) return null
  return existsSync(abs) ? abs : null
}

function normalizeCompanyFeatureTags(rawTags) {
  const rawArray = Array.isArray(rawTags)
    ? rawTags
    : typeof rawTags === 'string'
      ? rawTags.split(',').map((s) => s.trim())
      : []

  const out = []
  const seen = new Set()
  for (const raw of rawArray) {
    const f = String(raw ?? '').trim()
    if (!f) continue

    const canonical = COMPANY_FEATURE_OPTIONS.find((opt) => opt.toLowerCase() === f.toLowerCase())
    if (!canonical) continue

    const key = canonical.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(canonical)
  }

  // Enforce exclusivity: if `srs` is enabled, `multiLanguage` is disabled.
  const hasSrs = out.includes('srs')
  if (hasSrs) return out.filter((f) => f !== 'multiLanguage')
  return out
}

function resolveGeneratorFeatureData() {
  const now = Date.now()
  if (_resolvedGeneratorFeatures && _resolvedGeneratorFlags && now - _resolvedGeneratorCacheTime < GENERATOR_CONFIG_CACHE_MS) {
    return {
      companyFeatures: _resolvedGeneratorFeatures,
      enabled: _resolvedGeneratorFlags,
      companyWebsiteUrl: _resolvedGeneratorCompanyWebsiteUrl,
      companyName: _resolvedGeneratorCompanyName,
      companyLogoUrl: _resolvedGeneratorCompanyLogoUrl,
      companyOtherUrls: _resolvedGeneratorCompanyOtherUrls,
    }
  }

  try {
    const generatorConfigPath = join(__dirname, 'generator.config.json')
    if (!existsSync(generatorConfigPath)) {
      // Safe fallback: show only `chat` if generator config is missing.
      // This prevents unwanted `srs` / `multiLanguage` UI from appearing.
      const companyFeatures = ['chat']
      const enabled = {
        chatEnabled: companyFeatures.includes('chat'),
        callEnabled: companyFeatures.includes('call'),
        srsEnabled: companyFeatures.includes('srs'),
        multiLanguageEnabled: companyFeatures.includes('multiLanguage') && !companyFeatures.includes('srs'),
      }
      _resolvedGeneratorFeatures = companyFeatures
      _resolvedGeneratorFlags = enabled
      _resolvedGeneratorCompanyWebsiteUrl = process.env.SITE_BASE?.trim?.() || process.env.COMPANY_WEBSITE_URL?.trim?.() || 'https://theninehertz.com'
      _resolvedGeneratorCompanyName = process.env.COMPANY_NAME?.trim?.() || 'NineHertz'
      _resolvedGeneratorCompanyLogoUrl = ''
      _resolvedGeneratorCompanyOtherUrls = []
      const fromEnv = process.env.COMPANY_OTHER_URLS
      if (fromEnv && typeof fromEnv === 'string') {
        _resolvedGeneratorCompanyOtherUrls = fromEnv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      }
      _resolvedGeneratorCacheTime = now
      return {
        companyFeatures,
        enabled,
        companyWebsiteUrl: _resolvedGeneratorCompanyWebsiteUrl,
        companyName: _resolvedGeneratorCompanyName,
        companyLogoUrl: _resolvedGeneratorCompanyLogoUrl,
        companyOtherUrls: _resolvedGeneratorCompanyOtherUrls,
      }
    }

    const cfg = JSON.parse(readFileSync(generatorConfigPath, 'utf8'))
    const companyFeatures = normalizeCompanyFeatureTags(
      cfg?.companyFeatures ?? cfg?.features ?? cfg?.companyFeatureTags ?? cfg?.companyFeatureTagsForMetadata ?? [],
    )

    // Safe fallback: if config exists but is empty, assume only `chat`.
    const normalized = companyFeatures.length ? companyFeatures : ['chat']
    const enabled = {
      chatEnabled: normalized.includes('chat'),
      callEnabled: normalized.includes('call'),
      srsEnabled: normalized.includes('srs'),
      multiLanguageEnabled: normalized.includes('multiLanguage') && !normalized.includes('srs'),
    }

    _resolvedGeneratorFeatures = normalized
    _resolvedGeneratorFlags = enabled
    _resolvedGeneratorCompanyWebsiteUrl = typeof cfg?.companyWebsiteUrl === 'string' && cfg.companyWebsiteUrl.trim()
      ? cfg.companyWebsiteUrl.trim()
      : (process.env.SITE_BASE?.trim?.() || 'https://theninehertz.com')
    _resolvedGeneratorCompanyName = typeof cfg?.companyName === 'string' && cfg.companyName.trim()
      ? cfg.companyName.trim()
      : (process.env.COMPANY_NAME?.trim?.() || 'NineHertz')
    _resolvedGeneratorCompanyLogoUrl = typeof cfg?.companyLogoUrl === 'string' && cfg.companyLogoUrl.trim()
      ? cfg.companyLogoUrl.trim()
      : ''
    const rawOtherUrls = cfg?.companyOtherUrls ?? cfg?.otherUrls ?? []
    _resolvedGeneratorCompanyOtherUrls = Array.isArray(rawOtherUrls)
      ? rawOtherUrls.map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean)
      : []
    _resolvedGeneratorCacheTime = now
    return {
      companyFeatures: normalized,
      enabled,
      companyWebsiteUrl: _resolvedGeneratorCompanyWebsiteUrl,
      companyName: _resolvedGeneratorCompanyName,
      companyLogoUrl: _resolvedGeneratorCompanyLogoUrl,
      companyOtherUrls: _resolvedGeneratorCompanyOtherUrls,
    }
  } catch (e) {
    // Safe fallback: show only `chat` if generator config parsing fails.
    const companyFeatures = ['chat']
    const enabled = {
      chatEnabled: companyFeatures.includes('chat'),
      callEnabled: companyFeatures.includes('call'),
      srsEnabled: companyFeatures.includes('srs'),
      multiLanguageEnabled: companyFeatures.includes('multiLanguage') && !companyFeatures.includes('srs'),
    }
    _resolvedGeneratorFeatures = companyFeatures
    _resolvedGeneratorFlags = enabled
    _resolvedGeneratorCompanyWebsiteUrl = process.env.SITE_BASE?.trim?.() || process.env.COMPANY_WEBSITE_URL?.trim?.() || 'https://theninehertz.com'
    _resolvedGeneratorCompanyName = process.env.COMPANY_NAME?.trim?.() || 'NineHertz'
    _resolvedGeneratorCompanyLogoUrl = ''
    _resolvedGeneratorCompanyOtherUrls = []
    const fromEnv = process.env.COMPANY_OTHER_URLS
    if (fromEnv && typeof fromEnv === 'string') {
      _resolvedGeneratorCompanyOtherUrls = fromEnv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    _resolvedGeneratorCacheTime = now
    return {
      companyFeatures,
      enabled,
      companyWebsiteUrl: _resolvedGeneratorCompanyWebsiteUrl,
      companyName: _resolvedGeneratorCompanyName,
      companyLogoUrl: _resolvedGeneratorCompanyLogoUrl,
      companyOtherUrls: _resolvedGeneratorCompanyOtherUrls,
    }
  }
}

app.get('/api/generator-config', (req, res) => {
  const { companyFeatures, enabled, companyWebsiteUrl, companyName, companyLogoUrl, companyOtherUrls } = resolveGeneratorFeatureData()
  res.json({ success: true, companyFeatures, enabled, companyWebsiteUrl, companyName, companyLogoUrl, companyOtherUrls })
})

let mongoClientPromise = null
let adminSeedPromise = null
let companyIndexesPromise = null
let projectGenerationIndexesPromise = null

const companyLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, COMPANY_LOGO_DIR),
    filename: (_req, file, cb) => {
      const safeExt = extname(file.originalname || '').toLowerCase() || '.png'
      cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${safeExt}`)
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) cb(null, true)
    else cb(new Error('Only image uploads are allowed.'))
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
})

function validateAdminAuthConfig() {
  const missing = []
  if (!ADMIN_AUTH_SECRET) missing.push('ADMIN_AUTH_SECRET')
  if (!DEFAULT_ADMIN.email) missing.push('ADMIN_EMAIL')
  if (!DEFAULT_ADMIN.password) missing.push('ADMIN_PASSWORD')
  if (missing.length > 0) {
    throw new Error(`Missing required admin auth env vars: ${missing.join(', ')}`)
  }
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) return false
  const [salt, stored] = storedHash.split(':')
  const candidate = scryptSync(password, salt, 64).toString('hex')
  const storedBuf = Buffer.from(stored, 'hex')
  const candidateBuf = Buffer.from(candidate, 'hex')
  if (storedBuf.length !== candidateBuf.length) return false
  return timingSafeEqual(storedBuf, candidateBuf)
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function decodeBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signAdminToken(payload) {
  const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = encodeBase64Url(JSON.stringify(payload))
  const signature = createHmac('sha256', ADMIN_AUTH_SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') throw new Error('Missing token')
  const [header, body, signature] = token.split('.')
  if (!header || !body || !signature) throw new Error('Invalid token')
  const expectedSignature = createHmac('sha256', ADMIN_AUTH_SECRET).update(`${header}.${body}`).digest('base64url')
  const signatureBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expectedSignature)
  if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
    throw new Error('Invalid signature')
  }
  const payload = JSON.parse(decodeBase64Url(body))
  if (!payload?.exp || Date.now() >= payload.exp * 1000) throw new Error('Token expired')
  return payload
}

function buildAdminToken(user) {
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + Math.floor(ADMIN_TOKEN_TTL_MS / 1000)
  return {
    token: signAdminToken({
      sub: user._id?.toString?.() || user.email,
      email: user.email,
      name: user.name,
      role: user.role || 'admin',
      iat: now,
      exp: expiresAt,
    }),
    expiresAt: expiresAt * 1000,
  }
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) return ''
  return authHeader.slice(7).trim()
}

async function getMongoClient() {
  validateAdminAuthConfig()
  if (!mongoClientPromise) {
    const client = new MongoClient(MONGODB_URI)
    mongoClientPromise = client.connect().catch((err) => {
      mongoClientPromise = null
      throw err
    })
  }
  return mongoClientPromise
}

async function getAdminUsersCollection() {
  const client = await getMongoClient()
  return client.db(ADMIN_DB_NAME).collection(ADMIN_USERS_COLLECTION)
}

async function getCompaniesCollection() {
  const client = await getMongoClient()
  return client.db(ADMIN_DB_NAME).collection(COMPANIES_COLLECTION)
}

async function getProjectGenerationJobsCollection() {
  const client = await getMongoClient()
  return client.db(ADMIN_DB_NAME).collection(PROJECT_GENERATION_JOBS_COLLECTION)
}

async function ensureAdminSeeded() {
  if (!adminSeedPromise) {
    adminSeedPromise = (async () => {
      const collection = await getAdminUsersCollection()
      await collection.createIndex({ email: 1 }, { unique: true })
      const now = new Date()
      await collection.updateOne(
        { email: DEFAULT_ADMIN.email },
        {
          $set: {
            name: DEFAULT_ADMIN.name,
            email: DEFAULT_ADMIN.email,
            passwordHash: hashPassword(DEFAULT_ADMIN.password),
            role: DEFAULT_ADMIN.role,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true },
      )
      return true
    })().catch((err) => {
      adminSeedPromise = null
      throw err
    })
  }
  return adminSeedPromise
}

async function ensureCompanyIndexes() {
  if (!companyIndexesPromise) {
    companyIndexesPromise = (async () => {
      const collection = await getCompaniesCollection()
      await collection.createIndex({ email: 1 }, { unique: true })
      await collection.createIndex({ name: 1 })
      await collection.createIndex({ features: 1 })
      // Older companies may lack `projectGeneration`; API used to fake it in JSON only.
      // Persist defaults so MongoDB Compass matches GET /api/companies.
      const idle = defaultIdleProjectGeneration()
      const backfill = await collection.updateMany(
        { $or: [{ projectGeneration: { $exists: false } }, { projectGeneration: null }] },
        { $set: { projectGeneration: idle } },
      )
      if (backfill.modifiedCount > 0) {
        console.log(`   Company projectGeneration backfill: ${backfill.modifiedCount} document(s) updated.`)
      }
      return true
    })().catch((err) => {
      companyIndexesPromise = null
      throw err
    })
  }
  return companyIndexesPromise
}

async function ensureProjectGenerationIndexes() {
  if (!projectGenerationIndexesPromise) {
    projectGenerationIndexesPromise = (async () => {
      const collection = await getProjectGenerationJobsCollection()
      await collection.createIndex({ status: 1, createdAt: -1 })
      await collection.createIndex({ 'requestedBy.email': 1, createdAt: -1 })
      return true
    })().catch((err) => {
      projectGenerationIndexesPromise = null
      throw err
    })
  }
  return projectGenerationIndexesPromise
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseObjectId(value, fieldName = 'id') {
  const input = cleanString(value)
  if (!input) return null
  if (!ObjectId.isValid(input)) {
    const err = new Error(`Invalid ${fieldName}.`)
    err.status = 400
    throw err
  }
  return new ObjectId(input)
}

function normalizeProjectGeneratorFeatures(features) {
  if (!Array.isArray(features)) return []
  const unique = new Set(
    features
      .map((feature) => cleanString(feature).toLowerCase())
      .filter(Boolean),
  )
  return [...unique].filter((feature) => PROJECT_GENERATOR_FEATURE_OPTIONS.includes(feature))
}

/**
 * Parse company feature tags for repo generation (canonical casing).
 * Also enforces exclusivity: if both `srs` and `multiLanguage` are present, remove `multiLanguage`.
 * @returns {{ error?: string, features: string[] }}
 */
function parseCompanyFeaturesForGeneration(rawFeatures) {
  if (!Array.isArray(rawFeatures) || rawFeatures.length === 0) {
    return { error: 'features array is required and must not be empty (e.g. ["chat"]).', features: [] }
  }

  const seen = new Set()
  const features = []

  for (const raw of rawFeatures) {
    const f = cleanString(raw)
    if (!f) continue

    const canonical = COMPANY_FEATURE_OPTIONS.find((opt) => opt.toLowerCase() === f.toLowerCase())
    if (!canonical) {
      return { error: `Invalid feature "${f}". Allowed: ${COMPANY_FEATURE_OPTIONS.join(', ')}`, features: [] }
    }

    const dedupeKey = canonical.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    features.push(canonical)
  }

  if (features.length === 0) {
    return { error: 'features array is required and must not be empty (e.g. ["chat"]).', features: [] }
  }

  const hasSrs = features.includes('srs')
  const hasMultiLanguage = features.includes('multiLanguage')
  if (hasSrs && hasMultiLanguage) {
    return { features: features.filter((f) => f !== 'multiLanguage') }
  }

  return { features }
}

function sanitizeProjectGenerationJob(job) {
  if (!job) return null
  return {
    id: job._id,
    status: job.status,
    repoName: job.repoName,
    companyId: job.companyId || null,
    features: Array.isArray(job.features) ? job.features : Array.isArray(job.requestedFeatures) ? job.requestedFeatures : [],
    requestedFeatures: Array.isArray(job.requestedFeatures) ? job.requestedFeatures : [],
    private: !!job.private,
    repoUrl: job.repoUrl || null,
    outputDir: job.outputDir || null,
    source: job.source || null,
    error: job.error || null,
    createdAt: job.createdAt || null,
    updatedAt: job.updatedAt || null,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    requestedBy: job.requestedBy ? {
      email: job.requestedBy.email || '',
      name: job.requestedBy.name || '',
    } : null,
  }
}

/**
 * Default `projectGeneration` stored on each company document (MongoDB).
 * Not defined in services/generator — that folder only builds GitHub repos;
 * job state is written here via updateCompanyProjectGeneration / create company.
 */
function defaultIdleProjectGeneration() {
  return {
    status: 'idle',
    jobId: null,
    repoName: null,
    repoUrl: null,
    outputDir: null,
    source: null,
    error: null,
    updatedAt: null,
    startedAt: null,
    finishedAt: null,
  }
}

function sanitizeCompanyProjectGeneration(state) {
  if (!state || typeof state !== 'object') {
    return defaultIdleProjectGeneration()
  }

  return {
    status: state.status || 'idle',
    jobId: state.jobId || null,
    repoName: state.repoName || null,
    repoUrl: state.repoUrl || null,
    outputDir: state.outputDir || null,
    source: state.source || null,
    error: state.error || null,
    updatedAt: state.updatedAt || null,
    startedAt: state.startedAt || null,
    finishedAt: state.finishedAt || null,
  }
}

async function getCompanyById(companyId) {
  const collection = await getCompaniesCollection()
  return collection.findOne({ _id: parseObjectId(companyId, 'companyId') })
}

async function updateCompanyProjectGeneration(companyId, projectGeneration) {
  if (!companyId) return null
  const collection = await getCompaniesCollection()
  await collection.updateOne(
    { _id: parseObjectId(companyId, 'companyId') },
    {
      $set: {
        projectGeneration,
        updatedAt: new Date(),
      },
    },
  )
  return true
}

async function createProjectGenerationJob({ admin, company, requestedFeatures, features, repoName, isPrivate }) {
  await ensureProjectGenerationIndexes()
  const collection = await getProjectGenerationJobsCollection()
  const now = new Date()
  const job = {
    _id: randomUUID(),
    status: 'queued',
    repoName,
    requestedFeatures,
    features,
    private: isPrivate,
    companyId: company?._id?.toString?.() || null,
    companyName: company?.name || null,
    companyWebsiteUrl: company?.websiteUrl || null,
    companyOtherUrls: Array.isArray(company?.otherUrls) ? company.otherUrls : [],
    companyLogo: company?.logo || null,
    repoUrl: null,
    outputDir: null,
    source: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    requestedBy: {
      email: admin.email || '',
      name: admin.name || '',
    },
  }
  await collection.insertOne(job)
  if (job.companyId) {
    await updateCompanyProjectGeneration(job.companyId, {
      status: 'queued',
      jobId: job._id,
      repoName: job.repoName,
      repoUrl: null,
      outputDir: null,
      source: null,
      error: null,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
    })
  }
  return job
}

async function getProjectGenerationJob(jobId) {
  await ensureProjectGenerationIndexes()
  const collection = await getProjectGenerationJobsCollection()
  return collection.findOne({ _id: jobId })
}

async function updateProjectGenerationJob(jobId, update) {
  const collection = await getProjectGenerationJobsCollection()
  await collection.updateOne({ _id: jobId }, update)
  return getProjectGenerationJob(jobId)
}

async function processProjectGenerationJob(jobId) {
  const job = await getProjectGenerationJob(jobId)
  if (!job) return

  const startedAt = new Date()
  await updateProjectGenerationJob(jobId, {
    $set: {
      status: 'in_progress',
      updatedAt: startedAt,
      startedAt,
      finishedAt: null,
      error: null,
    },
  })
  await updateCompanyProjectGeneration(job.companyId, {
    status: 'in_progress',
    jobId: jobId,
    repoName: job.repoName,
    repoUrl: null,
    outputDir: null,
    source: null,
    error: null,
    updatedAt: startedAt,
    startedAt,
    finishedAt: null,
  })

  try {
    const token = process.env.GITHUB_TOKEN?.trim?.() || ''
    if (!token) {
      throw new Error('GITHUB_TOKEN is not set. Add it to .env to enable project generation and push.')
    }

    let companyName = job.companyName
    let companyWebsiteUrl = job.companyWebsiteUrl
    let companyOtherUrls = Array.isArray(job.companyOtherUrls) ? job.companyOtherUrls : []
    let companyLogoWebPath = job.companyLogo
    if (job.companyId) {
      const fresh = await getCompanyById(job.companyId)
      if (fresh) {
        if (!companyName && fresh.name) companyName = fresh.name
        if (!companyWebsiteUrl && fresh.websiteUrl) companyWebsiteUrl = fresh.websiteUrl
        if ((!companyOtherUrls || companyOtherUrls.length === 0) && Array.isArray(fresh.otherUrls)) companyOtherUrls = fresh.otherUrls
        if (!companyLogoWebPath && fresh.logo) companyLogoWebPath = fresh.logo
      }
    }
    const companyLogoAbsPath = resolvePublicPathToAbsolute(companyLogoWebPath)

    const result = await generateAndPushToGitHub(job.features, job.repoName, token, {
      private: !!job.private,
      companyFeatureTagsForMetadata: job.requestedFeatures,
      companyWebsiteUrl: companyWebsiteUrl || undefined,
      companyName: companyName || undefined,
      companyOtherUrls: companyOtherUrls && companyOtherUrls.length ? companyOtherUrls : undefined,
      companyLogoAbsPath: companyLogoAbsPath || undefined,
      mode: 'full',
    })

    const finishedAt = new Date()
    await updateProjectGenerationJob(jobId, {
      $set: {
        status: 'success',
        updatedAt: finishedAt,
        finishedAt,
        repoName: result.repoName || job.repoName,
        features: result.features,
        repoUrl: result.repoUrl,
        outputDir: result.outputDir,
        source: result.source || null,
        error: null,
      },
    })
    await updateCompanyProjectGeneration(job.companyId, {
      status: 'success',
      jobId: jobId,
      repoName: result.repoName || job.repoName,
      repoUrl: result.repoUrl,
      outputDir: result.outputDir,
      source: result.source || null,
      error: null,
      updatedAt: finishedAt,
      startedAt,
      finishedAt,
    })
  } catch (err) {
    const finishedAt = new Date()
    await updateProjectGenerationJob(jobId, {
      $set: {
        status: 'failed',
        updatedAt: finishedAt,
        finishedAt,
        error: err?.message || 'Project generation failed.',
      },
    })
    await updateCompanyProjectGeneration(job.companyId, {
      status: 'failed',
      jobId: jobId,
      repoName: job.repoName,
      repoUrl: null,
      outputDir: null,
      source: null,
      error: err?.message || 'Project generation failed.',
      updatedAt: finishedAt,
      startedAt,
      finishedAt,
    })
  }
}

const projectGenerationQueue = createSerialJobQueue(async (jobId) => {
  await processProjectGenerationJob(jobId)
})

function enqueueProjectGenerationJob(jobId) {
  projectGenerationQueue.enqueue(jobId)
}

async function resumePendingProjectGenerationJobs() {
  await ensureProjectGenerationIndexes()
  const collection = await getProjectGenerationJobsCollection()
  const now = new Date()

  await collection.updateMany(
    { status: 'in_progress' },
    {
      $set: {
        status: 'queued',
        updatedAt: now,
        startedAt: null,
        finishedAt: null,
        error: 'Retrying after server restart.',
      },
    },
  )

  const pendingJobs = await collection
    .find({ status: 'queued' })
    .sort({ createdAt: 1 })
    .toArray()

  pendingJobs.forEach((job) => enqueueProjectGenerationJob(job._id))
  return pendingJobs.length
}

function normalizeUrl(value) {
  const input = cleanString(value)
  if (!input) return ''
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`
  try {
    return new URL(withProtocol).toString()
  } catch {
    return ''
  }
}

function normalizeLogo(value) {
  const input = cleanString(value)
  if (!input) return ''
  if (input.startsWith('/uploads/')) return input
  return normalizeUrl(input)
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeCompanyPayload(body = {}) {
  const name = cleanString(body.name)
  const email = cleanString(body.email).toLowerCase()
  const countryCode = cleanString(body.countryCode)
  const phoneNumber = cleanString(body.phoneNumber)
  const logo = normalizeLogo(body.logo)
  const websiteUrl = normalizeUrl(body.websiteUrl)
  const otherUrls = Array.isArray(body.otherUrls)
    ? body.otherUrls.map((item) => normalizeUrl(item)).filter(Boolean)
    : []
  const features = Array.isArray(body.features)
    ? body.features
      .map((item) => cleanString(item))
      .filter(Boolean)
      .filter((item, index, list) => list.indexOf(item) === index)
    : []

  const errors = []
  if (!name) errors.push('name is required')
  if (!email) errors.push('email is required')
  else if (!isValidEmail(email)) errors.push('email must be valid')
  if (!countryCode) errors.push('countryCode is required')
  if (!phoneNumber) errors.push('phoneNumber is required')
  if (!cleanString(body.logo)) errors.push('logo is required')
  else if (!logo) errors.push('logo must be a valid uploaded path or URL')
  if (!cleanString(body.websiteUrl)) errors.push('websiteUrl is required')
  else if (!websiteUrl) errors.push('websiteUrl must be a valid URL')
  if (otherUrls.length === 0) errors.push('at least one otherUrl is required')
  if (Array.isArray(body.otherUrls) && otherUrls.length !== body.otherUrls.filter((item) => cleanString(item)).length) {
    errors.push('all otherUrls must be valid URLs')
  }
  if (features.length === 0) errors.push('at least one feature is required')
  if (features.some((item) => !COMPANY_FEATURE_OPTIONS.includes(item))) {
    errors.push(`features must be one of: ${COMPANY_FEATURE_OPTIONS.join(', ')}`)
  }

  return {
    errors,
    value: {
      name,
      email,
      countryCode,
      phoneNumber,
      logo,
      websiteUrl,
      otherUrls,
      features,
    },
  }
}

async function getAuthenticatedAdmin(req) {
  await ensureAdminSeeded()
  const token = getBearerToken(req)
  if (!token) {
    const err = new Error('Missing token.')
    err.status = 401
    throw err
  }

  const payload = verifyAdminToken(token)
  const collection = await getAdminUsersCollection()
  const admin = await collection.findOne({ email: payload.email })
  if (!admin) {
    const err = new Error('Admin account not found.')
    err.status = 401
    throw err
  }

  return admin
}

// ─── Shared Constants ───────────────────────────────────────────────────────
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'

function hasValidAnthropicKey() {
  const key = process.env.ANTHROPIC_API_KEY?.trim?.()
  return !!key && key !== 'your_anthropic_api_key_here'
}

async function callClaude(params, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await anthropic.messages.create(params)
    } catch (err) {
      const status = err?.status ?? err?.error?.status
      if (status === 529 && attempt < retries - 1) {
        const delay = 1000 * (attempt + 1)
        console.warn(`Claude overloaded (529), retrying in ${delay}ms... (attempt ${attempt + 1}/${retries})`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
}

function callClaudeStream(params) {
  return anthropic.messages.stream(params)
}

// ─── File-Based Cache Persistence ───────────────────────────────────────────
const CACHE_DIR = join(__dirname, '.cache')
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })

function loadCacheFile(filename) {
  try {
    return JSON.parse(readFileSync(join(CACHE_DIR, filename), 'utf8'))
  } catch { return null }
}

function saveCacheFile(filename, payload) {
  try {
    writeFileSync(join(CACHE_DIR, filename), JSON.stringify(payload))
  } catch (err) { console.warn(`⚠ Cache write failed (${filename}):`, err.message) }
}

// ─── Data Cache (with coalescing, stale-while-revalidate, file persistence) ─
const CACHE_TTL = 30 * 60 * 1000
const CACHE_STALE_DAYS = 7
const CACHE_STALE_MS = CACHE_STALE_DAYS * 24 * 60 * 60 * 1000

// Hybrid retrieval: core (always sent) + retrieved chunks (relevant to query)
const CORE_MAX_CHARS = 5000
const RETRIEVED_MAX_CHARS = 15000
const PRIORITY_PATHS = ['/', '/case-studies', '/services', '/industries', '/about-us', '/contact-us']

let cachedChunks = null // [{ text, url, label }, ...]
let cacheTime = 0
let pendingContextFetch = null

let cachedCaseStudies = null
let cachedCaseStudiesTime = 0
let pendingCaseStudiesFetch = null

/** Short assistant name for intros (first word of company name, not "Hz"). */
function deriveAssistantShortName(brandName) {
  const s = String(brandName || '').trim()
  if (!s) return 'AI'
  const first = s.split(/\s+/)[0]
  const cleaned = first.replace(/[^a-zA-Z0-9\u00C0-\u024F-]/g, '')
  return cleaned || 'AI'
}

/** Remove call-to-action options when `call` feature is off (model may still emit them). */
function filterChatPayloadForFeatures(payload, enabled) {
  if (!payload || !enabled || enabled.callEnabled) return payload
  const out = { ...payload }
  if (Array.isArray(out.options)) {
    out.options = out.options.filter((o) => !/book\s*a?\s*call|schedule\s*(a\s*)?call|scoping\s*call/i.test(String(o)))
    if (out.options.length === 0) out.options = null
  }
  return out
}

/** Normalized company site root (no trailing `?query` / `#hash`). Used for crawl + case studies. */
function getSiteBase() {
  const { companyWebsiteUrl } = resolveGeneratorFeatureData()
  const fallback = 'https://theninehertz.com'
  const raw = (companyWebsiteUrl || process.env.SITE_BASE?.trim?.() || fallback).trim()
  try {
    const u = new URL(raw)
    const path = (u.pathname || '/').replace(/\/$/, '')
    if (!path || path === '') return u.origin
    return `${u.origin}${path}`
  } catch {
    const cleaned = raw.split('?')[0].split('#')[0].replace(/\/$/, '')
    return cleaned || fallback
  }
}

/** Normalized company crawl bases for case-study scraping (companyWebsiteUrl + companyOtherUrls). */
function getSiteBases() {
  const { companyWebsiteUrl, companyOtherUrls } = resolveGeneratorFeatureData()
  const fallback = 'https://theninehertz.com'
  const inputs = [companyWebsiteUrl, ...(Array.isArray(companyOtherUrls) ? companyOtherUrls : [])]
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter(Boolean)
  const out = []
  for (const raw of inputs.length ? inputs : [fallback]) {
    try {
      const u = new URL(raw)
      const path = (u.pathname || '/').replace(/\/$/, '')
      if (!path || path === '') out.push(u.origin)
      else out.push(`${u.origin}${path}`)
    } catch {
      const cleaned = String(raw).split('?')[0].split('#')[0].replace(/\/$/, '')
      if (cleaned) out.push(cleaned)
    }
  }
  return [...new Set(out)].filter(Boolean)
}

// Restore caches from disk on startup if file exists (no TTL — only fetch again after 7 days).
// If cached content belongs to a different site, ignore it so we don't keep showing wrong-company data.
; (function restoreFromDisk() {
    const siteBase = getSiteBase()
    const siteBases = getSiteBases()
    const ctx = loadCacheFile('context.json')
    if (ctx?.time) {
      if (Array.isArray(ctx.chunks) && ctx.chunks.length > 0) {
        const matchesSite = ctx.chunks.some((c) => typeof c?.url === 'string' && siteBases.some((b) => c.url.startsWith(b)))
        if (matchesSite) {
          cachedChunks = ctx.chunks
          cacheTime = ctx.time
        } else {
          cachedChunks = null
          cacheTime = 0
        }
        if (cachedChunks) {
          const total = cachedChunks.reduce((s, c) => s + (c.text?.length || 0), 0)
          const ageSec = Math.round((Date.now() - cacheTime) / 1000)
          console.log(`✓ Chunks restored from disk (${cachedChunks.length} chunks, ${total} chars, age ${ageSec}s)`)
        }
      } else if (ctx.data && typeof ctx.data === 'string') {
        cachedChunks = [{ text: ctx.data, url: `${siteBase}/`, label: 'Legacy' }]
        cacheTime = ctx.time
        console.log(`✓ Legacy context migrated to single chunk (${ctx.data.length} chars)`)
      }
    }
    const cs = loadCacheFile('case-studies.json')
    if (cs?.data && cs?.time) {
      const cachedBases = Array.isArray(cs.bases) ? cs.bases : null
      const currentBases = siteBases || []

      // If cached bases are known, reuse only when they match exactly.
      if (cachedBases) {
        const a = new Set(cachedBases)
        const b = new Set(currentBases)
        const sameSize = a.size === b.size
        const sameItems = sameSize && [...a].every((x) => b.has(x))
        if (!sameItems) {
          cachedCaseStudies = null
          cachedCaseStudiesTime = 0
        } else {
          cachedCaseStudies = cs.data
        }
      } else {
        // Back-compat: reuse only if any cached URL belongs to current bases.
        const matchesSite = cs.data.some((c) => typeof c?.url === 'string' && currentBases.some((base) => c.url.startsWith(base)))
        if (matchesSite) {
          cachedCaseStudies = cs.data
          cachedCaseStudiesTime = cs.time
        } else {
          cachedCaseStudies = null
          cachedCaseStudiesTime = 0
        }
      }

      if (cachedCaseStudies) {
        cachedCaseStudiesTime = cs.time
        console.log(`✓ Case studies restored from disk (${cachedCaseStudies.length} entries)`)
      }
    }
  })()
// Configurable cap so all pages can be crawled; set CRAWL_MAX_PAGES in .env (default 2000)
const MAX_PAGES = Math.min(10000, Math.max(1, parseInt(process.env.CRAWL_MAX_PAGES, 10) || 2000))

/**
 * Normalize href to same-origin URL; return { path, url } or null.
 * Strips query string and hash so we dedupe by path.
 */
function normalizeInternalUrl(href, baseUrl) {
  if (!href || typeof href !== 'string') return null
  const u = href.trim()
  if (!u || u.startsWith('#')) return null
  try {
    const full = new URL(u, baseUrl).href
    // Restrict to the same origin + same base-path root as the page we are crawling.
    // This allows multi-base crawling (company website + otherUrls).
    const baseU = new URL(baseUrl)
    const basePath = (baseU.pathname || '/').replace(/\/$/, '')
    const allowedPrefix = !basePath || basePath === '/'
      ? baseU.origin
      : `${baseU.origin}${basePath}`
    if (!full.startsWith(allowedPrefix)) return null
    const parsed = new URL(full)
    const path = parsed.pathname.replace(/\/$/, '') || '/'
    return { path, url: parsed.origin + parsed.pathname }
  } catch { return null }
}

function pathToLabel(path) {
  if (path === '/') return 'Homepage'
  const slug = path.replace(/^\//, '').replace(/\/$/, '')
  const last = slug.split('/').pop() || slug
  return last.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Sitemap discovery (all pages the site declares) ─────────────────────────
const SITEMAP_PATHS = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml', '/wp-sitemap.xml', '/sitemap_index.xml']

/**
 * Parse XML sitemap: extract <loc> URLs. Handles both <urlset> and <sitemapindex>.
 * Returns array of absolute URLs (same-origin only).
 */
function parseSitemapXml(xmlBody, baseUrl) {
  const urls = []
  const $ = cheerio.load(xmlBody, { xmlMode: true })
  $('url loc').each((_, el) => {
    const loc = $(el).text().trim()
    if (loc && loc.startsWith(getSiteBase())) urls.push(loc)
  })
  const sitemapRefs = []
  $('sitemap loc').each((_, el) => {
    const loc = $(el).text().trim()
    if (loc) sitemapRefs.push(loc)
  })
  return { urls, sitemapRefs }
}

/**
 * Fetch a sitemap URL and return all same-origin page URLs (follows sitemap index if needed).
 */
async function fetchSitemapUrls(sitemapUrl, visited = new Set()) {
  if (visited.has(sitemapUrl)) return []
  visited.add(sitemapUrl)
  const out = []
  try {
    const { data } = await axios.get(sitemapUrl, {
      timeout: 60000,
      // timeout: 15000,

      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/xml, text/xml, */*' },
    })
    const { urls, sitemapRefs } = parseSitemapXml(data, sitemapUrl)
    out.push(...urls)
    for (const ref of sitemapRefs) {
      const child = await fetchSitemapUrls(ref, visited)
      out.push(...child)
    }
  } catch (err) {
    console.warn(`⚠ Sitemap fetch ${sitemapUrl}:`, err.message)
  }
  return out
}

/**
 * Discover URLs from sitemap(s). Tries common sitemap paths; returns { url, label }[].
 */
async function discoverPagesFromSitemap(siteBase, maxUrls = 800) {
  const seenPath = new Set()
  const list = []
  for (const path of SITEMAP_PATHS) {
    const sitemapUrl = siteBase + path
    const urls = await fetchSitemapUrls(sitemapUrl)
    for (const url of urls) {
      try {
        const parsed = new URL(url)
        if (!url.startsWith(siteBase)) continue
        const p = parsed.pathname.replace(/\/$/, '') || '/'
        if (seenPath.has(p)) continue
        seenPath.add(p)
        list.push({ url: parsed.origin + parsed.pathname, path: p, label: pathToLabel(p) })
        if (list.length >= maxUrls) return list
      } catch { /* skip invalid */ }
    }
    if (list.length > 0) break
  }
  return list
}

/**
 * Discover pages by following links from homepage (BFS). Stops at MAX_PAGES.
 */
async function discoverPagesFromLinks(siteBase) {
  const seen = new Set()
  const list = []
  const queue = [{ url: `${siteBase}/`, path: '/' }]

  while (queue.length > 0 && seen.size < MAX_PAGES) {
    const { url, path } = queue.shift()
    if (seen.has(path)) continue
    seen.add(path)
    list.push({ url, path, label: pathToLabel(path) })

    try {
      const { data } = await axios.get(url, {
        timeout: 60000,
        headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
      })
      const $ = cheerio.load(data)
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        const norm = normalizeInternalUrl(href, url)
        if (!norm || seen.has(norm.path)) return
        queue.push({ url: norm.url, path: norm.path })
      })
    } catch (err) {
      console.warn(`⚠ Discovery fetch ${path}:`, err.message)
    }
  }
  return list
}

/**
 * Discover all pages: sitemap first (full site list). If sitemap has enough URLs, skip
 * link-following so we can start priority fetch immediately; otherwise merge link discovery.
 */
async function discoverAllPages(siteBase, maxPages = MAX_PAGES) {
  let list = await discoverPagesFromSitemap(siteBase, Math.min(1000, maxPages))
  if (list.length > 0) {
    console.log(`✓ Sitemap: ${list.length} URLs discovered (${siteBase})`)
  }
  // When sitemap already has plenty, skip link discovery (can take minutes) so priority fetch can start now
  if (list.length < 50) {
    const fromLinks = await discoverPagesFromLinks(siteBase)
    const byPath = new Map(list.map((p) => [p.path, p]))
    for (const p of fromLinks) {
      if (!byPath.has(p.path)) byPath.set(p.path, p)
    }
    list = Array.from(byPath.values())
  }

  const priority = ['/', '/case-studies', '/services', '/industries', '/about-us', '/contact-us']
  const byPathOrdered = new Map(list.map((p) => [p.path, p]))
  const ordered = []
  for (const p of priority) {
    const key = p === '/' ? '/' : p.replace(/\/$/, '')
    if (byPathOrdered.has(key)) {
      ordered.push(byPathOrdered.get(key))
      byPathOrdered.delete(key)
    }
  }
  byPathOrdered.forEach((p) => ordered.push(p))

  const out = ordered.slice(0, MAX_PAGES)
  const finalOut = out.slice(0, maxPages)
  console.log(`✓ Discovered ${finalOut.length} pages to fetch (max ${maxPages}) (${siteBase})`)
  return finalOut
}

async function fetchPage(url, label, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data } = await axios.get(url, {
        timeout: 120000,
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html',
        },
      })
      const $ = cheerio.load(data)
      $('script, style, nav, footer, header, iframe, noscript').remove()

      const headings = []
      $('h1, h2, h3').each((_, el) => {
        const text = $(el).text().trim()
        if (text.length > 3 && text.length < 120) headings.push(text)
      })

      const paragraphs = []
      $('p, li').each((_, el) => {
        const text = $(el).text().trim()
        if (text.length > 30 && text.length < 500) paragraphs.push(text)
      })

      const content = [
        `\n=== ${label} (${url}) ===`,
        headings.length ? `\nSECTIONS:\n${headings.slice(0, 25).join('\n')}` : '',
        paragraphs.length ? `\nCONTENT:\n${paragraphs.slice(0, 35).join('\n')}` : '',
      ].join('\n')

      console.log(`✓ Fetched ${label} (${headings.length} headings, ${paragraphs.length} paragraphs)`)
      return content
    } catch (err) {
      if (attempt < retries) {
        const delay = attempt * 2000 // Exponential backoff: 2s, 4s, 6s
        console.warn(`⚠ Retry ${attempt}/${retries} for ${label} after ${delay}ms: ${err.message}`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      console.warn(`⚠ Failed to fetch ${label} after ${retries} attempts: ${err.message}`)
      return `\n=== ${label} ===\n[Could not fetch live data]`
    }
  }
}

// Fetch priority pages first so chat can respond in ~5–10s; then fetch the rest in background.
const PRIORITY_FETCH_COUNT = 6

async function fetchAndCacheContext() {
  const bases = getSiteBases()
  console.log('🔄 Discovering and fetching pages for:', bases.join(', '))

  const perBaseMax = bases.length > 0 ? Math.max(1, Math.floor(MAX_PAGES / bases.length)) : MAX_PAGES

  const discoveredByBase = []
  for (const base of bases.length ? bases : [getSiteBase()]) {
    const pages = await discoverAllPages(base, perBaseMax)
    discoveredByBase.push({ base, pages })
  }

  const uniqueByUrl = new Map()
  const priorityToFetch = []
  const perBasePriority = bases.length > 0 ? Math.max(2, Math.ceil(PRIORITY_FETCH_COUNT / bases.length)) : PRIORITY_FETCH_COUNT

  for (const { pages } of discoveredByBase) {
    for (const p of pages.slice(0, perBasePriority)) {
      if (!p?.url) continue
      const key = String(p.url).replace(/\/$/, '')
      if (uniqueByUrl.has(key)) continue
      uniqueByUrl.set(key, true)
      priorityToFetch.push({ url: p.url, label: p.label })
    }
  }

  // If we still don't have enough priority pages, fill from the rest (any base).
  if (priorityToFetch.length < PRIORITY_FETCH_COUNT) {
    for (const { pages } of discoveredByBase) {
      for (const p of pages) {
        if (priorityToFetch.length >= PRIORITY_FETCH_COUNT) break
        if (!p?.url) continue
        const key = String(p.url).replace(/\/$/, '')
        if (uniqueByUrl.has(key)) continue
        uniqueByUrl.set(key, true)
        priorityToFetch.push({ url: p.url, label: p.label })
      }
      if (priorityToFetch.length >= PRIORITY_FETCH_COUNT) break
    }
  }

  // Build restToFetch by subtracting priority pages.
  const priorityUrlSet = new Set(priorityToFetch.map((p) => String(p.url).replace(/\/$/, '')))
  const restToFetch = []
  for (const { pages } of discoveredByBase) {
    for (const p of pages) {
      if (!p?.url) continue
      const key = String(p.url).replace(/\/$/, '')
      if (priorityUrlSet.has(key)) continue
      restToFetch.push({ url: p.url, label: p.label })
    }
  }

  if (priorityToFetch.length === 0) {
    console.warn('⚠ No pages discovered; using fallback seed list')
    const fallbackBases = bases.length ? bases : [getSiteBase()]
    for (const b of fallbackBases) {
      priorityToFetch.push(
        { url: `${b}/`, label: 'Homepage' },
        { url: `${b}/case-studies`, label: 'Case Studies' },
      )
      if (priorityToFetch.length >= PRIORITY_FETCH_COUNT) break
    }
  }

  const priorityPages = await Promise.all(priorityToFetch.map((p) => fetchPage(p.url, p.label)))
  cachedChunks = priorityToFetch.map((p, i) => ({ text: priorityPages[i], url: p.url, label: p.label }))
  cacheTime = Date.now()
  saveCacheFile('context.json', { chunks: cachedChunks, time: cacheTime })
  const total = cachedChunks.reduce((s, c) => s + (c.text?.length || 0), 0)
  console.log(`✓ Priority chunks ready (${cachedChunks.length} pages) — chat can respond now; fetching rest in background...`)
  if (restToFetch.length > 0) {
    // Process in batches to avoid overwhelming the server
    const BATCH_SIZE = 10
    const BATCH_DELAY = 2000 // 2 seconds between batches

      ; (async () => {
        try {
          const restPages = []
          for (let i = 0; i < restToFetch.length; i += BATCH_SIZE) {
            const batch = restToFetch.slice(i, i + BATCH_SIZE)
            const batchResults = await Promise.all(batch.map((p) => fetchPage(p.url, p.label)))
            restPages.push(...batchResults)

            // Add delay between batches (except for the last one)
            if (i + BATCH_SIZE < restToFetch.length) {
              await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
            }
          }

          const restChunks = restToFetch.map((p, i) => ({ text: restPages[i], url: p.url, label: p.label }))
          const byPath = new Map(cachedChunks.map((c) => [pathFromUrl(c.url), c]))
          for (const c of restChunks) {
            const path = pathFromUrl(c.url)
            if (!byPath.has(path)) byPath.set(path, c)
          }
          cachedChunks = Array.from(byPath.values())
          cacheTime = Date.now()
          saveCacheFile('context.json', { chunks: cachedChunks, time: cacheTime })
          const fullTotal = cachedChunks.reduce((s, c) => s + (c.text?.length || 0), 0)
          console.log(`✓ All chunks ready (${cachedChunks.length} chunks, ${fullTotal} chars)`)
        } catch (err) {
          console.warn('⚠ Background full fetch failed:', err?.message || err)
        }
      })()
  }
  return cachedChunks
}

function refreshContextInBackground() {
  if (pendingContextFetch) return
  pendingContextFetch = fetchAndCacheContext()
    .catch(err => console.warn('⚠ Background context refresh failed:', err.message))
    .finally(() => { pendingContextFetch = null })
}

function pathFromUrl(url) {
  try {
    return new URL(url).pathname.replace(/\/$/, '') || '/'
  } catch { return '/' }
}

/** Build the small "core" context always sent: priority pages first, up to CORE_MAX_CHARS. */
function buildCore(chunks) {
  if (!chunks?.length) return ''
  const parts = []
  let total = 0
  const bases = getSiteBases()

  for (const p of PRIORITY_PATHS) {
    const key = p === '/' ? '/' : p.replace(/\/$/, '')

    // Avoid mixing content across multiple crawl bases by filtering chunks
    // to the configured bases before selecting the priority page content.
    const candidates = chunks.filter((c) => {
      const url = c?.url
      if (typeof url !== 'string') return false
      const matchesBase = bases.some((b) => url.startsWith(b))
      if (!matchesBase) return false
      return pathFromUrl(url) === key
    })

    if (!candidates.length || total >= CORE_MAX_CHARS) continue
    const chunk = candidates.sort((a, b) => (b?.text?.length || 0) - (a?.text?.length || 0))[0]
    const slice = (chunk?.text || '').slice(0, CORE_MAX_CHARS - total)
    parts.push(slice)
    total += slice.length
  }
  return parts.join('\n\n')
}

/** Simple keyword retrieval: score chunks by how many query words they contain, return top until maxChars. */
function retrieveChunks(chunks, query, maxChars) {
  if (!chunks?.length || !query || typeof query !== 'string') return []
  const words = query.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2)
  if (words.length === 0) return []

  const scored = chunks.map((c) => {
    const text = (c.text || '').toLowerCase()
    const score = words.filter((w) => text.includes(w)).length
    return { chunk: c, score }
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score)

  const out = []
  let len = 0
  for (const { chunk } of scored) {
    if (len >= maxChars) break
    const take = chunk.text.slice(0, maxChars - len)
    out.push(take)
    len += take.length
  }
  return out
}

async function getCachedChunks() {
  if (cachedChunks && Date.now() - cacheTime < CACHE_STALE_MS) return cachedChunks
  if (cachedChunks) {
    refreshContextInBackground()
    return cachedChunks
  }
  if (pendingContextFetch) return pendingContextFetch
  pendingContextFetch = fetchAndCacheContext().finally(() => { pendingContextFetch = null })
  return pendingContextFetch
}

// ─── Case Studies (NineHertz website) ────────────────────────────────────────

/** Return plain text only; reject HTML tags and invalid titles. */
function sanitizeCaseStudyTitle(raw) {
  if (typeof raw !== 'string') return ''
  let t = raw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  if (t.includes('<') || t.includes('>') || t.length < 4) return ''
  if (t.length > 200) t = t.slice(0, 200)
  return t
}

function isValidCaseStudyTitle(title) {
  return title && title.length >= 4 && !title.includes('<') && !title.includes('>') && !/^\s*https?:\/\//i.test(title)
}

/** Paths that often host work / stories on non–NineHertz sites */
const CASE_STUDY_PAGE_CANDIDATES = [
  '/case-studies',
  '/case-studies/',
  '/case-study',
  '/portfolio',
  '/portfolio/',
  '/our-work',
  '/our-work/',
  '/work',
  '/work/',
  '/projects',
  '/projects/',
  '/project',
]

const PORTFOLIO_PATH_RE = /\/(case-stud(?:y|ies)|portfolio|our-work|work|projects?|clients?|success)(\/|$)/i

/**
 * Extract same-origin “work / case study / portfolio” links from HTML (configured company site only).
 */
function extractPortfolioLinksFromHtml(html, siteBase) {
  const $ = cheerio.load(html)
  const list = []
  const seenUrl = new Set()
  const baseNorm = siteBase.replace(/\/$/, '')

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim()
    if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) return
    let absolute
    try {
      absolute = new URL(href, `${baseNorm}/`).href.split('#')[0].split('?')[0]
    } catch { return }
    if (!absolute.startsWith(baseNorm)) return
    const pathname = (() => {
      try { return new URL(absolute).pathname } catch { return '' }
    })()
    if (!pathname || pathname === '/') return
    if (!PORTFOLIO_PATH_RE.test(pathname) && pathname.split('/').filter(Boolean).length < 2) return
    if (/\.(pdf|zip|jpg|png|gif|svg|css|js)$/i.test(pathname)) return

    const norm = absolute.replace(/\/$/, '')
    if (seenUrl.has(norm)) return
    seenUrl.add(norm)

    const $el = $(el)
    const linkText = $el.text().trim()
    const ignoredLinkTexts = new Set(['learn more', 'see more', 'read more', 'all', 'view more', 'more'])
    const meaningfulLinkText = linkText && !ignoredLinkTexts.has(linkText.toLowerCase())
      ? sanitizeCaseStudyTitle(linkText)
      : ''

    const rawTitle = meaningfulLinkText ||
      $el.closest('article, .case-study, li').find('h2, h3').first().text().trim() ||
      $el.closest('div').find('h2, h3').first().text().trim() ||
      ''

    const slug = pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-') || 'item'
    const title = sanitizeCaseStudyTitle(rawTitle) || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    if (!isValidCaseStudyTitle(title)) return

    const $container = $el.closest('article, .case-study, li').first().length
      ? $el.closest('article, .case-study, li').first()
      : $el.closest('div').first()
    const $img = $el.find('img').first().length ? $el.find('img').first() : $container.find('img').first()
    const imageUrl =
      $img.attr('data-lazy-src') ||
      $img.attr('data-src') ||
      $img.attr('data-original') ||
      ($img.attr('src') && !$img.attr('src').includes('data:image') ? $img.attr('src') : '') ||
      ''

    list.push({ title, url: absolute, slug, imageUrl: imageUrl || null })
  })

  return list
}

async function scrapeCaseStudies() {
  const bases = getSiteBases()

  // Dedupe across all bases by normalized URL.
  const seenUrls = new Set()
  const seenSlugs = new Set()
  const combined = []

  const hardBudgetMs = parseInt(process.env.CASE_STUDY_SCRAPE_BUDGET_MS, 10) || 12000
  const startedAt = Date.now()
  const timeUp = () => Date.now() - startedAt >= hardBudgetMs

  const maxTotal = 30
  const maxPerBase = bases.length > 0 ? Math.max(6, Math.ceil(maxTotal / bases.length) + 2) : maxTotal
  const maxPagesPerBase = 3
  const axiosTimeoutMs = 20000

  for (const base of bases) {
    if (timeUp()) break
    const baseNorm = base.replace(/\/$/, '')
    let perBaseAdded = 0
    let pagesTried = 0

    // Important: don't start with homepage.
    // Prefer dedicated case-study/portfolio pages first, and only fall back to homepage last.
    const tryUrls = [
      ...new Set([
        ...CASE_STUDY_PAGE_CANDIDATES.map((p) => baseNorm + p),
        `${baseNorm}/`,
      ]),
    ]

    for (const pageUrl of tryUrls) {
      if (combined.length >= maxTotal) break
      if (pagesTried >= maxPagesPerBase) break
      if (perBaseAdded >= maxPerBase) break
      if (timeUp()) break

      try {
        pagesTried++
        const { data } = await axios.get(pageUrl, {
          timeout: axiosTimeoutMs,
          headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
        })
        const found = extractPortfolioLinksFromHtml(data, baseNorm)

        for (const item of found || []) {
          if (!isValidCaseStudyTitle(item.title)) continue
          const normUrl = String(item.url || '').replace(/\/$/, '')
          if (!normUrl || seenUrls.has(normUrl)) continue
          if (item.slug && seenSlugs.has(item.slug)) continue

          seenUrls.add(normUrl)
          if (item.slug) seenSlugs.add(item.slug)
          combined.push(item)
          perBaseAdded++

          if (combined.length >= maxTotal) break
          if (perBaseAdded >= maxPerBase) break
        }
      } catch {
        // try next candidate path
      }
    }

    // Keep legacy `theninehertz.com` examples as a small fallback.
    if (baseNorm.includes('theninehertz.com') && perBaseAdded < maxPerBase) {
      const known = [
        {
          title: 'CRM SaaS Solution for a Growing E-commerce Platform',
          url: 'https://theninehertz.com/case-studies/crm-saas-solution-for-e-commerce-platform',
          slug: 'crm-saas-solution-for-e-commerce-platform',
          imageUrl: null,
        },
        {
          title: 'Empowering Financial Success through Automated Trading Software',
          url: 'https://theninehertz.com/case-studies/empowering-financial-success-through-automated-trading-software',
          slug: 'empowering-financial-success-through-automated-trading-software',
          imageUrl: null,
        },
      ]
      for (const k of known) {
        if (combined.length >= maxTotal) break
        if (perBaseAdded >= maxPerBase) break
        if (timeUp()) break
        const normUrl = String(k.url || '').replace(/\/$/, '')
        if (!normUrl || seenUrls.has(normUrl) || (k.slug && seenSlugs.has(k.slug))) continue
        seenUrls.add(normUrl)
        if (k.slug) seenSlugs.add(k.slug)
        combined.push(k)
        perBaseAdded++
      }
    }

    if (combined.length >= maxTotal) break
    if (timeUp()) break
  }

  cachedCaseStudies = combined.filter((c) => isValidCaseStudyTitle(c.title)).slice(0, 30)
  cachedCaseStudiesTime = Date.now()
  saveCacheFile('case-studies.json', { data: cachedCaseStudies, time: cachedCaseStudiesTime, bases: getSiteBases() })
  console.log(`✓ Case studies list ready (${cachedCaseStudies.length} entries)`)
  return cachedCaseStudies
}

function refreshCaseStudiesInBackground() {
  if (pendingCaseStudiesFetch) return
  pendingCaseStudiesFetch = scrapeCaseStudies()
    .catch(err => console.warn('⚠ Background case studies refresh failed:', err.message))
    .finally(() => { pendingCaseStudiesFetch = null })
}

async function fetchCaseStudiesList() {
  if (cachedCaseStudies && Date.now() - cachedCaseStudiesTime < CACHE_STALE_MS) {
    return cachedCaseStudies
  }

  if (cachedCaseStudies) {
    refreshCaseStudiesInBackground()
    return cachedCaseStudies
  }

  // Cold start — coalesce concurrent requests
  if (pendingCaseStudiesFetch) return pendingCaseStudiesFetch
  try {
    pendingCaseStudiesFetch = scrapeCaseStudies()
    const result = await pendingCaseStudiesFetch
    pendingCaseStudiesFetch = null
    return result
  } catch (err) {
    pendingCaseStudiesFetch = null
    console.warn('⚠ Failed to fetch case studies:', err.message)
    return cachedCaseStudies || []
  }
}

/** Find case study in list by title (exact or partial). */
function findCaseStudyByTitle(list, title) {
  if (!title || !list.length) return null
  const t = title.trim().toLowerCase()
  return list.find((c) => c.title.toLowerCase() === t || c.title.toLowerCase().includes(t) || t.includes(c.title.toLowerCase())) || null
}


async function getMatchingCaseStudies(messages = [], plan = null) {
  const list = await fetchCaseStudiesList()
  const planMatch = plan?.caseStudyMatch || ''
  const planMatchEntry = planMatch ? findCaseStudyByTitle(list, planMatch) : null
  const fallback = list.slice(0, 4)
  if (!list.length) return []

  if (!hasValidAnthropicKey()) {
    if (planMatchEntry) return [planMatchEntry, ...list.filter((c) => c.slug !== planMatchEntry.slug).slice(0, 3)]
    return fallback
  }

  // ✅ FIXED: use LAST user message as primary
  const userMessages = messages.filter(m => m.role === 'user')
  const primaryQuery = userMessages[userMessages.length - 1]?.content || ''
  const userOnlySummary = userMessages.map(m => m.content).join('\n')
  const planTitle = plan?.title || ''
  const { system: systemPrompt, user: userContent } = getMatchingCaseStudiesPrompt(
    list,
    primaryQuery,
    userOnlySummary,
    planTitle,
    planMatch,
  )

  try {
    const raw = await callClaude({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })

    const text = (raw.content[0].text || '').trim().replace(/```\w*\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(text)

    if (!Array.isArray(parsed) || parsed.length === 0) {
      if (planMatchEntry) return [planMatchEntry, ...list.filter((c) => c.slug !== planMatchEntry.slug).slice(0, 3)]
      return fallback
    }

    // ✅ FIXED: validate URLs strictly against real list
    const validUrls = new Set(list.map(c => c.url.replace(/\/$/, '')))

    const out = parsed.slice(0, 5).map((p) => {
      const rawUrl = (p.url || '').trim().replace(/\/$/, '')
      const rawTitle = (p.title || '').trim()

      // If URL exists in list, use it directly
      if (validUrls.has(rawUrl)) {
        const full = list.find(c => c.url.replace(/\/$/, '') === rawUrl)
        return { title: full.title, url: full.url }
      }

      // URL is hallucinated — try to recover by title
      const found = findCaseStudyByTitle(list, rawTitle)
      if (found) return { title: found.title, url: found.url }

      return null // reject completely
    }).filter(Boolean)

    // ✅ Deduplicate
    const deduped = []
    const seenUrls = new Set()
    for (const c of out) {
      const norm = c.url.replace(/\/$/, '')
      if (seenUrls.has(norm)) continue
      seenUrls.add(norm)
      deduped.push(c)
    }

    // ✅ Broadened fallback if too few results
    if (deduped.length < 2) {
      const keywords = primaryQuery.toLowerCase().split(' ').filter(w => w.length > 4)
      const broadMatches = list.filter(c =>
        !seenUrls.has(c.url.replace(/\/$/, '')) &&
        keywords.some(kw => c.title.toLowerCase().includes(kw))
      ).slice(0, 3 - deduped.length)
      deduped.push(...broadMatches)
      broadMatches.forEach(c => seenUrls.add(c.url.replace(/\/$/, '')))
    }

    if (deduped.length === 0 && planMatchEntry) return [planMatchEntry, ...list.filter((c) => c.slug !== planMatchEntry.slug).slice(0, 3)]
    if (deduped.length === 0) return fallback

    if (planMatchEntry && !seenUrls.has(planMatchEntry.url.replace(/\/$/, ''))) {
      return [planMatchEntry, ...deduped.slice(0, 4)]
    }

    return deduped

  } catch (err) {
    console.warn('Case studies match fallback:', err.message)
    if (planMatchEntry) return [planMatchEntry, ...list.filter((c) => c.slug !== planMatchEntry.slug).slice(0, 3)]
    return fallback
  }
}
/** Extract the FIRST complete balanced-brace JSON object from any text.
 *  Handles markdown code fences, trailing prose, and nested objects correctly. */
function extractFirstJSON(text) {
  // Strip code fences first
  const stripped = text.replace(/```\w*\n?/g, '').replace(/\n?```/g, '')
  const start = stripped.indexOf('{')
  if (start === -1) return null
  let depth = 0, inString = false, escape = false
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

function parseStructuredResponse(rawText) {
  // Try direct JSON first
  try { return JSON.parse(rawText.trim()) } catch { }

  // Use balanced-brace extractor (handles code fences + trailing prose)
  const jsonStr = extractFirstJSON(rawText)
  if (jsonStr) {
    try { return JSON.parse(jsonStr) } catch { }
  }

  // Fallback: wrap raw text
  return { message: rawText, options: null, questionNum: 0, plan: null }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

app.post('/api/admin/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' })
  }

  try {
    await ensureAdminSeeded()
    const collection = await getAdminUsersCollection()
    const admin = await collection.findOne({ email })
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const { token, expiresAt } = buildAdminToken(admin)
    res.json({
      token,
      expiresAt,
      user: {
        id: admin._id?.toString?.() || admin.email,
        name: admin.name,
        email: admin.email,
        role: admin.role || 'admin',
      },
    })
  } catch (err) {
    console.error('[Admin Auth] login error:', err?.message || err)
    res.status(500).json({ error: 'Unable to login right now.' })
  }
})

app.get('/api/admin/session', async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing token.' })
  }

  try {
    await ensureAdminSeeded()
    const payload = verifyAdminToken(token)
    const collection = await getAdminUsersCollection()
    const admin = await collection.findOne({ email: payload.email })
    if (!admin) {
      return res.status(401).json({ error: 'Admin account not found.' })
    }

    res.json({
      user: {
        id: admin._id?.toString?.() || admin.email,
        name: admin.name,
        email: admin.email,
        role: admin.role || 'admin',
      },
      expiresAt: payload.exp * 1000,
    })
  } catch (err) {
    const status = err?.message === 'Token expired' ? 401 : 401
    res.status(status).json({ error: err?.message === 'Token expired' ? 'Session expired.' : 'Invalid token.' })
  }
})

app.post('/api/companies', async (req, res) => {
  try {
    const admin = await getAuthenticatedAdmin(req)
    await ensureCompanyIndexes()

    const { errors, value } = normalizeCompanyPayload(req.body || {})
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed.', details: errors })
    }

    const now = new Date()
    const companyDoc = {
      ...value,
      projectGeneration: defaultIdleProjectGeneration(),
      createdAt: now,
      updatedAt: now,
      createdBy: admin.email,
    }

    const collection = await getCompaniesCollection()
    const result = await collection.insertOne(companyDoc)

    res.status(201).json({
      success: true,
      company: {
        id: result.insertedId.toString(),
        ...companyDoc,
      },
    })
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'A company with this email already exists.' })
    }
    if (err?.status === 401) {
      return res.status(401).json({ error: err.message })
    }
    console.error('[Company] create error:', err?.message || err)
    res.status(500).json({ error: 'Unable to create company right now.' })
  }
})

app.get('/api/companies', async (req, res) => {
  try {
    await getAuthenticatedAdmin(req)
    await ensureCompanyIndexes()

    const collection = await getCompaniesCollection()
    const companies = await collection
      .find(
        {},
        {
          projection: {
            name: 1,
            email: 1,
            countryCode: 1,
            phoneNumber: 1,
            logo: 1,
            websiteUrl: 1,
            otherUrls: 1,
            features: 1,
            projectGeneration: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      )
      .sort({ createdAt: -1 })
      .toArray()

    res.json({
      success: true,
      companies: companies.map((c) => ({
        id: c._id?.toString?.() || '',
        name: c.name,
        email: c.email,
        countryCode: c.countryCode,
        phoneNumber: c.phoneNumber,
        logo: c.logo,
        websiteUrl: c.websiteUrl,
        otherUrls: c.otherUrls || [],
        features: c.features || [],
        projectGeneration: sanitizeCompanyProjectGeneration(c.projectGeneration),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    })
  } catch (err) {
    if (err?.status === 401) {
      return res.status(401).json({ error: err.message })
    }
    console.error('[Company] list error:', err?.message || err)
    res.status(500).json({ error: 'Unable to fetch companies right now.' })
  }
})

app.delete('/api/companies/:companyId', async (req, res) => {
  try {
    await getAuthenticatedAdmin(req)
    const companyId = cleanString(req.params?.companyId)
    if (!companyId) return res.status(400).json({ error: 'companyId is required.' })

    const company = await getCompanyById(companyId)
    if (!company) return res.status(404).json({ error: 'Company not found.' })

    const companiesCollection = await getCompaniesCollection()
    await companiesCollection.deleteOne({ _id: parseObjectId(companyId, 'companyId') })

    // Best-effort cleanup: remove generation jobs for this company.
    try {
      const jobsCollection = await getProjectGenerationJobsCollection()
      await jobsCollection.deleteMany({ companyId })
    } catch {
      // Non-fatal
    }

    res.json({ success: true })
  } catch (err) {
    if (err?.status === 401) return res.status(401).json({ error: err.message })
    console.error('[Company] delete error:', err?.message || err)
    res.status(500).json({ error: 'Unable to delete company.' })
  }
})

app.post('/api/companies/upload-logo', async (req, res) => {
  try {
    await getAuthenticatedAdmin(req)
    const uploadResult = await new Promise((resolve, reject) => {
      companyLogoUpload.single('logo')(req, res, (err) => {
        if (err) return reject(err)
        resolve(req.file || null)
      })
    })

    if (!uploadResult) {
      return res.status(400).json({ error: 'Logo file is required.' })
    }

    res.status(201).json({
      success: true,
      logo: {
        fileName: uploadResult.filename,
        url: `/uploads/company-logos/${uploadResult.filename}`,
      },
    })
  } catch (err) {
    if (err?.status === 401) {
      return res.status(401).json({ error: err.message })
    }
    console.error('[Company] logo upload error:', err?.message || err)
    res.status(400).json({ error: err?.message || 'Unable to upload logo.' })
  }
})

// ─── Project generator (admin only, requires GITHUB_TOKEN) ───────────────────
app.post('/api/generate-project', async (req, res) => {
  try {
    const admin = await getAuthenticatedAdmin(req)
    const { features, repoName, private: isPrivate = false, companyId = '' } = req.body || {}
    const company = companyId ? await getCompanyById(companyId) : null
    if (companyId && !company) {
      return res.status(404).json({ error: 'Company not found.' })
    }
    const rawFeatures = Array.isArray(features) && features.length > 0 ? features : (company?.features || [])
    const parsed = parseCompanyFeaturesForGeneration(rawFeatures)
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error })
    }
    const requestedNormalized = parsed.features
    const selectedFeatures = normalizeProjectGeneratorFeatures(requestedNormalized)
    if (selectedFeatures.length === 0) {
      return res.status(400).json({
        error: `Repo generation needs at least one of these modules: ${PROJECT_GENERATOR_FEATURE_OPTIONS.join(', ')}.`,
      })
    }
    const companyRepoName = cleanString(company?.name).toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '')
    const name = typeof repoName === 'string' ? repoName.trim() : (companyRepoName || '')
    if (!name) {
      return res.status(400).json({ error: 'repoName is required (e.g. "chat-only-project").' })
    }
    if (typeof isPrivate !== 'boolean') {
      return res.status(400).json({ error: 'private must be a boolean when provided.' })
    }
    const token = process.env.GITHUB_TOKEN?.trim?.() || ''
    if (!token) {
      return res.status(503).json({ error: 'GITHUB_TOKEN is not set. Add it to .env to enable project generation and push.' })
    }
    const job = await createProjectGenerationJob({
      admin,
      company,
      requestedFeatures: requestedNormalized,
      features: selectedFeatures,
      repoName: name,
      isPrivate,
    })
    enqueueProjectGenerationJob(job._id)
    res.status(202).json({
      success: true,
      message: 'Project generation queued.',
      job: sanitizeProjectGenerationJob(job),
    })
  } catch (err) {
    if (err?.status === 401) {
      return res.status(401).json({ error: err.message })
    }
    console.error('[GenerateProject] error:', err?.message || err)
    res.status(500).json({ error: err?.message || 'Project generation or GitHub push failed.' })
  }
})

app.get('/api/generate-project/:jobId/status', async (req, res) => {
  try {
    await getAuthenticatedAdmin(req)
    const jobId = cleanString(req.params?.jobId)
    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required.' })
    }

    const job = await getProjectGenerationJob(jobId)
    if (!job) {
      return res.status(404).json({ error: 'Project generation job not found.' })
    }

    res.json({
      success: true,
      job: sanitizeProjectGenerationJob(job),
    })
  } catch (err) {
    if (err?.status === 401) {
      return res.status(401).json({ error: err.message })
    }
    console.error('[GenerateProjectStatus] error:', err?.message || err)
    res.status(500).json({ error: err?.message || 'Unable to fetch project generation status.' })
  }
})

app.get('/api/health', (req, res) => {
  const contextChars = cachedChunks?.reduce((s, c) => s + (c.text?.length || 0), 0) ?? 0
  res.json({
    status: 'ok',
    context: { cached: !!cachedChunks, chunks: cachedChunks?.length ?? 0, ageMs: cachedChunks ? Date.now() - cacheTime : null, totalChars: contextChars, coreMaxChars: CORE_MAX_CHARS, retrievedMaxChars: RETRIEVED_MAX_CHARS },
    caseStudies: { cached: !!cachedCaseStudies, ageMs: cachedCaseStudies ? Date.now() - cachedCaseStudiesTime : null, count: cachedCaseStudies?.length ?? 0 },
    ttlMs: CACHE_STALE_MS,
  })
})

app.get('/api/refresh', async (req, res) => {
  cachedChunks = null
  cacheTime = 0
  cachedCaseStudies = null
  cachedCaseStudiesTime = 0
  await Promise.all([fetchAndCacheContext(), scrapeCaseStudies().catch(() => { })])
  const totalChars = cachedChunks?.reduce((s, c) => s + (c.text?.length || 0), 0) ?? 0
  res.json({ success: true, chunks: cachedChunks?.length ?? 0, contextChars: totalChars, caseStudies: cachedCaseStudies?.length ?? 0 })
})

app.post('/api/chat', async (req, res) => {
  const { messages, languageHint = '' } = req.body

  const { enabled, companyName, companyWebsiteUrl } = resolveGeneratorFeatureData()
  if (!enabled.chatEnabled) return res.status(403).json({ error: 'chat feature disabled' })

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' })
  }

  if (!hasValidAnthropicKey()) {
    return res.json({
      message: '⚠️ **API key not configured.**\n\nOpen `.env`, set `ANTHROPIC_API_KEY` to your key from the Anthropic console, then restart the server.',
      options: null,
      questionNum: 0,
      plan: null,
    })
  }

  const requestId = randomUUID().slice(0, 8)
  try {
    const parsed = await orchestrate(messages, {
      requestId,
      getCachedChunks,
      buildCore,
      retrieveChunks,
      retrieveRAGChunksForContext,
      callClaude,
      languageHint,
      openaiApiKey,
      claudeModel: CLAUDE_MODEL,
      retrievedMaxChars: RETRIEVED_MAX_CHARS,
      brandName: companyName,
      websiteUrl: companyWebsiteUrl,
      assistantShortName: deriveAssistantShortName(companyName),
      featureFlags: enabled,
    })

    const filtered = filterChatPayloadForFeatures(parsed, enabled)
    res.json({
      message: filtered.message || '',
      options: Array.isArray(filtered.options) ? filtered.options : null,
      questionNum: typeof filtered.questionNum === 'number' ? filtered.questionNum : 0,
      plan: filtered.plan || null,
    })
  } catch (err) {
    const status = err?.status ?? err?.error?.status
    console.error(`[${requestId}] Chat error:`, status, err.message)
    const msg = status === 529
      ? "Claude's servers are temporarily overloaded. Please wait a moment and try again."
      : status === 401
        ? "Invalid API key. Please check `ANTHROPIC_API_KEY` in `.env` and restart the server."
        : "I'm having a connection issue. Please try again in a moment."
    res.status(500).json({
      message: msg,
      options: null,
      questionNum: 0,
      plan: null,
    })
  }
})

app.post('/api/chat/stream', async (req, res) => {
  const { messages, languageHint = '' } = req.body

  const { enabled, companyName, companyWebsiteUrl } = resolveGeneratorFeatureData()
  if (!enabled.chatEnabled) return res.status(403).json({ error: 'chat feature disabled' })

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' })
  }

  if (!hasValidAnthropicKey()) {
    return res.status(400).json({ error: 'API key not configured' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const requestId = randomUUID().slice(0, 8)
  const sendSSE = (data) => {
    try {
      if (data?.type === 'done' && data.message !== undefined) {
        const f = filterChatPayloadForFeatures(data, enabled)
        res.write(`data: ${JSON.stringify(f)}\n\n`)
      } else {
        res.write(`data: ${JSON.stringify(data)}\n\n`)
      }
      res.flush?.()
    } catch (e) {
      console.warn(`[${requestId}] SSE write failed:`, e?.message)
    }
  }

  try {
    await orchestrateStream(messages, {
      requestId,
      getCachedChunks,
      buildCore,
      retrieveChunks,
      retrieveRAGChunksForContext,
      callClaude,
      callClaudeStream,
      languageHint,
      openaiApiKey,
      claudeModel: CLAUDE_MODEL,
      retrievedMaxChars: RETRIEVED_MAX_CHARS,
      sendSSE,
      brandName: companyName,
      websiteUrl: companyWebsiteUrl,
      assistantShortName: deriveAssistantShortName(companyName),
      featureFlags: enabled,
    })
  } catch (err) {
    sendSSE({ type: 'error', message: err?.message || 'Stream failed' })
  } finally {
    res.end()
  }
})

app.post('/api/localize', async (req, res) => {
  const { text = '', languageHint = '' } = req.body || {}

  const { enabled } = resolveGeneratorFeatureData()
  if (!enabled.multiLanguageEnabled) return res.json({ text })

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text required' })
  }

  if (!hasValidAnthropicKey()) {
    return res.json({ text })
  }

  try {
    const localizedText = await localizePlainText(text, languageHint || text, {
      callClaude,
      claudeModel: CLAUDE_MODEL,
    })
    res.json({ text: localizedText || text })
  } catch (err) {
    console.error('[Localize] error:', err.message)
    res.json({ text })
  }
})

// ─── Case Studies API ─────────────────────────────────────────────────────────
app.get('/api/case-studies', async (req, res) => {
  try {
    const list = await fetchCaseStudiesList()
    res.json({ caseStudies: list })
  } catch (err) {
    res.status(500).json({ caseStudies: [], error: err.message })
  }
})

app.post('/api/case-studies/match', async (req, res) => {
  const requestId = randomUUID().slice(0, 8)
  try {
    const { messages = [], plan = null } = req.body || {}
    const matched = await getMatchingCaseStudies(messages, plan)
    const list = await fetchCaseStudiesList()
    const byUrl = new Map(list.map((c) => [c.url.replace(/\/$/, ''), c]))
    const caseStudies = matched.map((m) => {
      const full = byUrl.get((m.url || '').replace(/\/$/, ''))
      return full
        ? { title: full.title, url: full.url, slug: full.slug, imageUrl: full.imageUrl ?? null }
        : { title: m.title, url: m.url, slug: null, imageUrl: null }
    }).filter((c) => c.title && c.url)
    res.json({ caseStudies })
  } catch (err) {
    console.warn('Case studies match error:', err.message)
    const list = await fetchCaseStudiesList().catch(() => [])
    res.json({ caseStudies: list.slice(0, 4) })
  }
})

// ─── Flow Agent: simple FRD + 4–5 AI design concepts ───────────────────────────
function parseFlowAgentResponse(rawText) {
  try {
    const parsed = JSON.parse(rawText.trim())
    return parsed
  } catch { }
  const codeMatch = rawText.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
  if (codeMatch) {
    try {
      return JSON.parse(codeMatch[1].trim())
    } catch { }
  }
  const braceMatch = rawText.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0])
    } catch { }
  }
  return { frd: '', designs: [] }
}

app.post('/api/flow-agent', async (req, res) => {
  const { messages = [], plan = null } = req.body
  const { companyName, companyWebsiteUrl } = resolveGeneratorFeatureData()

  if (!hasValidAnthropicKey()) {
    return res.json({ frd: '', designs: [], error: 'API key not configured' })
  }

  const conversationSummary = Array.isArray(messages)
    ? messages.slice(-16).map((m) => `${m.role}: ${m.content}`).join('\n')
    : ''
  const planBlock = plan && typeof plan === 'object'
    ? `\nProject plan summary: ${plan.title || ''}. Pillar: ${plan.pillar || ''}. Phases: ${(plan.phases || []).map((p) => p.name).join(', ')}. Tech: ${(plan.techStack || []).join(', ')}.`
    : ''

  const { system: systemPrompt, user: userContent } = getFlowAgentPrompt(conversationSummary, planBlock, { brandName: companyName, websiteUrl: companyWebsiteUrl })

  try {
    const raw = await callClaude({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })
    const rawText = raw.content[0].text
    const parsed = parseFlowAgentResponse(rawText)
    const frd = typeof parsed.frd === 'string' ? parsed.frd : ''
    const designs = Array.isArray(parsed.designs) ? parsed.designs.slice(0, 5) : []
    res.json({ frd, designs })
  } catch (err) {
    console.error('Flow agent error:', err.message)
    res.status(500).json({ frd: '', designs: [], error: err.message })
  }
})

// ─── Flow Agent: LLM → Structured UI Spec → Image Model (correct pipeline) ─────
/** Turn a design concept into a structured, DALL·E-ready image prompt via LLM. */
async function designConceptToStructuredPrompt(design, index) {
  const { companyName, companyWebsiteUrl } = resolveGeneratorFeatureData()
  const title = design?.title || `Design ${index + 1}`
  const desc = design?.description || ''
  const { system: systemPrompt, user: userContent } = getDesignConceptToStructuredPromptInputs(design, index, { brandName: companyName, websiteUrl: companyWebsiteUrl })

  const raw = await callClaude({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 520,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })
  const text = (raw.content[0].text || '').trim().replace(/^["']|["']$/g, '').slice(0, 3800)
  return text || `Professional UI mockup: ${title}. ${desc}. Clean, high-fidelity single screen, minimal placeholder text, modern app or dashboard style.`
}

// ─── Flow Agent: generate real design mockup images (DALL·E 3) ─────────────────
// Pipeline: User idea → LLM (structured UI spec) → Image model → clean UI
app.post('/api/flow-agent/images', async (req, res) => {
  const { designs = [] } = req.body 
  if (!Array.isArray(designs) || designs.length === 0) {
    return res.status(400).json({ images: [], error: 'designs array required' })
  }
  if (!openai || !openaiApiKey) {
    return res.json({
      images: [],
      error: 'OpenAI API key not set. Add OPENAI_API_KEY to .env for real design mockups.',
    })
  }
  const hasAnthropic = hasValidAnthropicKey()
  const results = []
  for (let i = 0; i < Math.min(designs.length, 5); i++) {
    const d = designs[i]
    const title = d?.title || `Design ${i + 1}`
    const desc = d?.description || ''
    let prompt
    try {
      if (hasAnthropic) {
        prompt = await designConceptToStructuredPrompt(d, i)
      } else {
        prompt = `Professional UI/UX mockup screenshot of a modern software application screen. Concept: "${title}". ${desc}. Clean, high-fidelity interface design, single screen, no text in the image except minimal placeholder labels. Realistic app or web dashboard style.`
      }
      const resp = await openai.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
        quality: 'standard',
      })
      const b64 = resp.data?.[0]?.b64_json
      if (b64) {
        results.push({ index: i, dataUrl: `data:image/png;base64,${b64}` })
      }
    } catch (err) {
      const status = err?.status ?? err?.response?.status
      const msg = err?.message ?? String(err)
      const is401 = status === 401 || msg.toLowerCase().includes('401') || msg.toLowerCase().includes('incorrect api key') || msg.toLowerCase().includes('invalid_api_key')
      const userMessage = is401
        ? 'OpenAI returned 401 Unauthorized. Check: (1) OPENAI_API_KEY in .env has no extra spaces or quotes, (2) Key is valid at platform.openai.com, (3) Billing is set up and key has Image generation permission.'
        : msg
      console.warn(`Flow agent image ${i} error:`, msg)
      results.push({ index: i, error: userMessage })
    }
  }
  res.json({ images: results })
})

// ─── Call Agent: SRS Discovery Call ─────────────────────────────────────────

// ─── Whisper STT ─────────────────────────────────────────────────────────────
app.post('/api/transcribe', async (req, res) => {
  const { audio, mimeType = 'audio/webm', locale = '' } = req.body
  if (!audio) return res.status(400).json({ text: '', error: 'audio payload required' })

  const { enabled } = resolveGeneratorFeatureData()
  if (!enabled.callEnabled) return res.status(403).json({ text: '', error: 'call feature disabled' })

  if (!openai) return res.status(503).json({ text: '', error: 'OpenAI API key not configured — add OPENAI_API_KEY to .env' })

  try {
    const buffer = Buffer.from(audio, 'base64')
    // Derive file extension from mimeType for Whisper
    const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
      : mimeType.includes('ogg') ? 'ogg'
        : 'webm'
    const file = await toFile(buffer, `recording.${ext}`, { type: mimeType })
    const language = typeof locale === 'string' && locale.trim()
      ? locale.trim().split('-')[0].toLowerCase()
      : ''
    const transcriptionParams = {
      file,
      model: 'whisper-1',
      ...(language ? { language } : {}),
    }
    const result = await openai.audio.transcriptions.create(transcriptionParams)
    res.json({ text: (result.text || '').trim() })
  } catch (err) {
    console.error('[Whisper] transcription error:', err.message)
    res.status(500).json({ text: '', error: err.message })
  }
})

app.post('/api/call-agent/chat', async (req, res) => {
  const { message, callHistory = [], chatMessages = [], plan = null, languageHint = '' } = req.body

  const { enabled, companyName, companyWebsiteUrl } = resolveGeneratorFeatureData()
  if (!enabled.callEnabled) {
    return res.json({
      response: 'Call feature is disabled for this company.',
      isCallComplete: true,
      coveredAreas: [],
      extractedInfo: {},
    })
  }

  const languageReference = (typeof languageHint === 'string' && languageHint.trim()) || message
  const sameLanguageRule = buildSameLanguageRule(languageReference, 'response')

  if (!hasValidAnthropicKey()) {
    return res.json({ response: 'API key not set. Please check your .env file.', isCallComplete: false, coveredAreas: [], extractedInfo: {} })
  }

  const chatCtx = Array.isArray(chatMessages)
    ? chatMessages.slice(-10).map((m) => `${m.role}: ${m.content}`).join('\n')
    : ''
  const planCtx = plan
    ? `Existing project plan: "${plan.title}" | Pillar: ${plan.pillar} | Timeline: ${plan.estimatedTimeline || 'TBD'} | Tech: ${(plan.techStack || []).join(', ')}`
    : 'No project plan yet — all areas open for discovery.'

  const callCtxForPrompt = Array.isArray(callHistory) && callHistory.length > 0
    ? callHistory.map((h) => `${h.speaker === 'user' ? 'Client' : 'Alex'}: ${h.text}`).join('\n')
    : 'This is the very first message.'

  const systemPrompt = getCallAgentChatSystemPrompt({ planCtx, chatCtx, callCtxForPrompt, sameLanguageRule, brandName: companyName, websiteUrl: companyWebsiteUrl })

  const callMsgs = Array.isArray(callHistory)
    ? callHistory.map((h) => ({ role: h.speaker === 'user' ? 'user' : 'assistant', content: h.text }))
    : []

  try {
    const userMessage = typeof message === 'string' && message.trim()
      ? message.trim()
      : 'Begin the discovery call now with a short greeting and the first question.'
    const raw = await callClaude({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: [...callMsgs, { role: 'user', content: userMessage }],
    })
    const rawText = (raw.content[0].text || '').trim()
    // ── Multi-strategy extraction (robust against truncated / malformed JSON) ──
    let spokenText = ''
    let isComplete = false
    let areas = []

    // Strategy 1: full JSON parse via balanced-brace extractor
    const chatJsonStr = extractFirstJSON(rawText)
    if (chatJsonStr) {
      try {
        const p = JSON.parse(chatJsonStr)
        spokenText = typeof p.response === 'string' ? p.response.trim() : ''
        isComplete = Boolean(p.isCallComplete)
        areas = Array.isArray(p.coveredAreas) ? p.coveredAreas : []
      } catch { /* fall through to strategy 2 */ }
    }

    // Strategy 2: regex field extraction — works even on truncated / malformed JSON
    if (!spokenText) {
      const rText = rawText.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      const rDone = rawText.match(/"isCallComplete"\s*:\s*true/)
      const AREA_NAMES = ['BUSINESS_GOAL', 'TARGET_USERS', 'CORE_FEATURES', 'INTEGRATIONS', 'TIMELINE', 'BUDGET_TEAM',
        'USER_WORKFLOWS', 'KEY_DATA', 'PLATFORM', 'PERFORMANCE', 'COMPLIANCE', 'EXISTING_SYSTEMS']
      const rAreas = AREA_NAMES.filter(a => rawText.includes(`"${a}"`))
      if (rText) {
        spokenText = rText[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\'/g, "'").trim()
        isComplete = Boolean(rDone)
        areas = rAreas
      }
    }

    // Strategy 3: plain-text fallback (Claude ignored JSON format entirely)
    if (!spokenText) {
      spokenText = rawText.replace(/[{}"]/g, '').replace(/^\s*response\s*:\s*/i, '').slice(0, 220).trim()
    }

    // Final sanity-check: if spoken text still looks like JSON, discard it
    const finalText = spokenText && !spokenText.trimStart().startsWith('{')
      ? spokenText
      : 'Could you tell me a bit more about that?'

    res.json({
      response: finalText,
      isCallComplete: isComplete,
      coveredAreas: areas,
      extractedInfo: {},
    })
  } catch (err) {
    console.error('Call agent chat error:', err.message)
    res.status(500).json({ response: "Sorry, I'm having a brief technical issue. Please go ahead.", isCallComplete: false, coveredAreas: [], extractedInfo: {} })
  }
})

// ─── Design Agent: SRS → 5-6 creative UI page specs ─────────────────────────
app.post('/api/design-agent', async (req, res) => {
  const { srs } = req.body
  if (!srs) return res.status(400).json({ pages: [], error: 'SRS required' })
  if (!hasValidAnthropicKey()) {
    return res.status(503).json({ pages: [], error: 'API key not configured' })
  }

  const { companyName, companyWebsiteUrl } = resolveGeneratorFeatureData()

  // system prompt + user content are generated dynamically via prompts.js

  const ctx = [
    `Project: ${srs.title || 'Untitled'}`,
    srs.businessObjective ? `Goal: ${srs.businessObjective}` : '',
    srs.executiveSummary ? `Summary: ${srs.executiveSummary}` : '',
    srs.targetUsers?.length ? `Users: ${srs.targetUsers.map(u => u.persona).join(', ')}` : '',
    srs.functionalRequirements?.length ? `Features: ${srs.functionalRequirements.map(f => f.module).join(', ')}` : '',
    srs.systemArchitecture?.frontend?.length ? `Frontend: ${srs.systemArchitecture.frontend.join(', ')}` : '',
    srs.pillar ? `Pillar: ${srs.pillar}` : '',
    srs.estimatedTimeline ? `Timeline: ${srs.estimatedTimeline}` : '',
  ].filter(Boolean).join('\n')

  const { system: systemPrompt, user: userContent } = getDesignAgentPrompt(ctx, { brandName: companyName, websiteUrl: companyWebsiteUrl })

  try {
    const raw = await callClaude({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })
    const rawText = (raw.content[0].text || '').trim()
    const start = rawText.indexOf('[')
    const end = rawText.lastIndexOf(']')
    let pages = []
    if (start !== -1 && end !== -1) {
      try { pages = JSON.parse(rawText.slice(start, end + 1)) } catch (e) {
        console.error('[DesignAgent] JSON parse error:', e.message)
      }
    }
    res.json({ pages: Array.isArray(pages) ? pages.slice(0, 6) : [] })
  } catch (err) {
    console.error('[DesignAgent] error:', err.message)
    res.status(500).json({ pages: [], error: err.message })
  }
})

// ─── Landing Page Generator ───────────────────────────────────────────────────
app.post('/api/landing-page', async (req, res) => {
  const { srs } = req.body
  if (!srs) return res.status(400).json({ html: '', error: 'SRS required' })
  if (!hasValidAnthropicKey())
    return res.status(503).json({ html: '', error: 'API key not configured' })

  const { companyName, companyWebsiteUrl } = resolveGeneratorFeatureData()

  const ctx = [
    `Product: ${srs.title || 'Untitled'}`,
    srs.businessObjective ? `Goal: ${srs.businessObjective}` : '',
    srs.executiveSummary ? `Summary: ${srs.executiveSummary}` : '',
    srs.targetUsers?.length
      ? `Target users: ${srs.targetUsers.map(u => u.persona).join(', ')}` : '',
    srs.scope?.inScope?.length
      ? `Key features: ${srs.scope.inScope.slice(0, 6).join(', ')}` : '',
    srs.systemArchitecture?.frontend?.length
      ? `Frontend: ${srs.systemArchitecture.frontend.join(', ')}` : '',
    srs.pillar ? `Project pillar: ${srs.pillar}` : '',
    srs.estimatedTimeline ? `Timeline: ${srs.estimatedTimeline}` : '',
  ].filter(Boolean).join('\n')

  // system prompt + user content are generated dynamically via prompts.js
  const { system: systemPrompt, user: userContent } = getLandingPagePrompt(ctx, { brandName: companyName, websiteUrl: companyWebsiteUrl })

  try {
    const raw = await callClaude({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })
    let html = (raw.content[0].text || '').trim()
    // Strip accidental markdown fences if Claude added them
    html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim()
    res.json({ html })
  } catch (err) {
    console.error('[LandingPage] error:', err.message)
    res.status(500).json({ html: '', error: err.message })
  }
})

app.post('/api/call-agent/plan', async (req, res) => {
  const { callTranscript = [], chatMessages = [], existingPlan = null } = req.body

  const { enabled, companyName, companyWebsiteUrl } = resolveGeneratorFeatureData()
  if (!enabled.srsEnabled) return res.json({ srs: null, plan: existingPlan, enhanced: false })

  if (!hasValidAnthropicKey()) {
    return res.json({ srs: null, plan: existingPlan, enhanced: false })
  }

  const callCtx = Array.isArray(callTranscript)
    ? callTranscript.map((t) => `${t.speaker === 'ai' ? `Alex (${companyName} BA)` : 'Client'}: ${t.text}`).join('\n')
    : ''
  const chatCtx = Array.isArray(chatMessages)
    ? chatMessages.slice(-12).map((m) => `${m.role}: ${m.content}`).join('\n')
    : ''

  const { system: srsSystemPromptDynamic, user: srsUserContent } = getSrsPrompt({
    chatCtx,
    callCtx,
    brandName: companyName,
    websiteUrl: companyWebsiteUrl,
    assistantShortName: deriveAssistantShortName(companyName),
  })

  try {
    const raw = await callClaude({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: srsSystemPromptDynamic,
      messages: [{ role: 'user', content: srsUserContent }],
    })
    const rawText = (raw.content[0].text || '').trim()
    let srs = null
    const srsJsonStr = extractFirstJSON(rawText)
    if (!srsJsonStr) console.warn('SRS: extractFirstJSON returned null — response may be malformed or truncated')
    try { srs = srsJsonStr ? JSON.parse(srsJsonStr) : null } catch (parseErr) {
      console.warn('SRS JSON.parse failed:', parseErr.message, '| JSON snippet:', srsJsonStr?.slice(0, 100))
    }

    // Also derive a legacy plan from the SRS for backward compatibility
    let plan = existingPlan
    if (srs && srs.title && Array.isArray(srs.phases) && srs.phases.length > 0) {
      plan = {
        title: srs.title,
        pillar: srs.pillar || 'BUILD',
        caseStudyMatch: srs.caseStudyMatch || '',
        expertiseSummary: srs.executiveSummary ? srs.executiveSummary.slice(0, 160) : '',
        phases: srs.phases,
        techStack: [
          ...(srs.systemArchitecture?.frontend || []),
          ...(srs.systemArchitecture?.backend || []),
          ...(srs.systemArchitecture?.database || []),
        ].slice(0, 8),
        estimatedTimeline: srs.estimatedTimeline || '',
        nextStep: srs.nextStep || '',
      }
    }

    if (srs && srs.title) {
      res.json({ srs, plan, enhanced: true })
    } else {
      console.warn('SRS generation failed, falling back to existing plan')
      res.json({ srs: null, plan: existingPlan, enhanced: false })
    }
  } catch (err) {
    console.error('Call plan/SRS error:', err.message)
    res.json({ srs: null, plan: existingPlan, enhanced: false })
  }
})

// ─── OpenAI TTS ───────────────────────────────────────────────────────────────
/**
 * Map a BCP-47 locale to the OpenAI TTS voice that sounds most natural for it.
 * OpenAI voices: alloy | echo | fable | onyx | nova | shimmer
 *   alloy   — neutral, clear American
 *   echo    — male, American
 *   fable   — expressive, slightly British-accented
 *   onyx    — deep, authoritative male
 *   nova    — warm, friendly female  ← great all-rounder
 *   shimmer — gentle, clear female
 */
function localeToOpenAIVoice(locale) {
  const l = (locale || 'en-US').toLowerCase()
  if (l.startsWith('en-gb') || l.startsWith('en-au') || l.startsWith('en-nz')) return 'fable'
  if (l.startsWith('en-in') || l.startsWith('hi')) return 'nova'
  if (l.startsWith('zh') || l.startsWith('ja') || l.startsWith('ko')) return 'shimmer'
  if (l.startsWith('fr') || l.startsWith('it') || l.startsWith('pt')) return 'shimmer'
  if (l.startsWith('de') || l.startsWith('nl') || l.startsWith('ru')) return 'onyx'
  if (l.startsWith('es') || l.startsWith('ar') || l.startsWith('tr')) return 'nova'
  // en-US / en-CA and everything else
  return 'nova'
}

app.get('/api/rag/stats', (req, res) => {
  res.json({ ok: true, ...getStoreStats(), ready: getStoreStats().totalChunks > 0 })
})

app.post('/api/rag/query', async (req, res) => {
  const { question } = req.body || {}
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'question (string) required' })
  }
  const oai = process.env.OPENAI_API_KEY?.trim?.()
  const anth = process.env.ANTHROPIC_API_KEY?.trim?.()
  if (!oai || !anth) return res.status(503).json({ error: 'Need OPENAI_API_KEY + ANTHROPIC_API_KEY' })
  try {
    const result = await queryRAG(question, oai, anth)
    res.json({ answer: result.answer, sources: result.sources || [], ok: true })
  } catch (err) {
    console.error('[RAG] query error:', err?.message)
    res.status(500).json({ error: err?.message })
  }
})

app.post('/api/tts', async (req, res) => {
  const { text, locale = 'en-US' } = req.body
  if (!text) return res.status(400).json({ error: 'text required' })

  const { enabled } = resolveGeneratorFeatureData()
  if (!enabled.callEnabled) return res.status(403).json({ error: 'call feature disabled' })

  if (!openai) return res.status(503).json({ error: 'OpenAI API key not configured — add OPENAI_API_KEY to .env' })

  try {
    const voice = localeToOpenAIVoice(locale)
    const response = await openai.audio.speech.create({
      model: 'tts-1',       // lower latency than tts-1-hd for voice calls
      voice,
      input: text,
      speed: 0.98,
    })
    const buffer = Buffer.from(await response.arrayBuffer())
    res.set('Content-Type', 'audio/mpeg')
    res.set('Cache-Control', 'no-store')
    res.send(buffer)
  } catch (err) {
    console.error('[TTS] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001
const server = app.listen(PORT, () => {
  console.log(`\n🚀 NineHertz API server → http://localhost:${PORT}`)
  if (openaiApiKey) console.log('   OpenAI API key loaded.')
  else console.log('   OPENAI_API_KEY not set.')
  console.log(`   MongoDB: ${process.env.MONGODB_URI?.trim?.() ? 'using configured URI' : `defaulting to ${DEFAULT_LOCAL_MONGODB_URI}`}`)
  console.log(`   Admin DB: ${ADMIN_DB_NAME}`)
  ensureAdminSeeded()
    .then(() => console.log(`   Admin auth ready (${DEFAULT_ADMIN.email})`))
    .catch((err) => console.warn('   ⚠ Admin auth setup failed:', err?.message || err))
  ensureCompanyIndexes()
    .then(() => console.log('   Company module ready.'))
    .catch((err) => console.warn('   ⚠ Company module setup failed:', err?.message || err))
  ensureProjectGenerationIndexes()
    .then(() => resumePendingProjectGenerationJobs())
    .then((count) => console.log(`   Project generator queue ready (${count} pending job${count === 1 ? '' : 's'} resumed).`))
    .catch((err) => console.warn('   ⚠ Project generator queue failed:', err?.message || err))
  console.log('   (Keep this terminal open; Ctrl+C to stop.)\n')
  console.log('   Warming context cache...')
  getCachedChunks()
    .then((chunks) => {
      if (chunks?.length) {
        console.log(`   Context ready (${chunks.length} chunks).`)
        if (cacheTime && Date.now() - cacheTime >= CACHE_STALE_MS) {
          refreshContextInBackground()
          refreshCaseStudiesInBackground()
        }
      }
    })
    .catch((err) => console.warn('   Context warm-up failed:', err?.message))
  const oai = process.env.OPENAI_API_KEY?.trim?.()
  const anth = process.env.ANTHROPIC_API_KEY?.trim?.()
  if (oai && anth) {
    console.log('   Indexing PDFs for RAG...')
    loadAndIndexPdfs(oai)
      .then((r) => console.log(`   ✓ RAG ready: ${r.pdfCount} PDFs, ${r.chunksIndexed} chunks indexed.`))
      .catch((err) => console.warn('   ⚠ RAG indexing failed:', err?.message))
  }
})
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use. Stop the other process or set PORT=3002 in .env`)
  } else {
    console.error('\n❌ Server error:', err.message)
  }
  process.exit(1)
})
