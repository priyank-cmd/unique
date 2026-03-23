/**
 * Generates a project bundle for GitHub (or disk).
 *
 * - **full** (default): mirrors this repo (9hz-ai) — real `server.js`, `orchestration/`, React `src/`,
 *   RAG, etc. Same stack as production after `npm install` + `.env`.
 * - **minimal**: small stub template + dynamic `server.js` (for tests / lightweight demos).
 *
 * Set `GENERATOR_MIRROR_MODE=minimal` or pass `{ mode: 'minimal' }` to use the stub.
 */
import fse from 'fs-extra'
import { join, dirname, resolve, extname } from 'path'
import { fileURLToPath } from 'url'
import { buildServerJs } from './buildServerJs.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..', '..')
const TEMPLATE_DIR = join(__dirname, 'template')
const TEMPLATE_SRC_DIR = join(TEMPLATE_DIR, 'src')
const TEMPLATE_CORE_DIR = join(TEMPLATE_SRC_DIR, 'core')
const TEMPLATE_MODULES_DIR = join(TEMPLATE_SRC_DIR, 'modules')
const APP_CORE_DIR = join(PROJECT_ROOT, 'src', 'core')
const APP_MODULES_DIR = join(PROJECT_ROOT, 'src', 'modules')
const PACKAGE_TEMPLATE_PATH = join(__dirname, 'packageTemplate.json')
const ENV_EXAMPLE_PATH = join(__dirname, 'envExample.txt')
const ALLOWED_FEATURES = ['chat', 'srs', 'call']

function normalizeFeatures(features) {
  if (!Array.isArray(features)) return []
  const set = new Set(features.map((feature) => String(feature).toLowerCase().trim()).filter(Boolean))
  return [...set].filter((feature) => ALLOWED_FEATURES.includes(feature))
}

function normalizeProjectName(projectName) {
  const safeName = String(projectName || 'generated-project')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return safeName || 'generated-project'
}

function resolveGeneratorOptions(outDirOrOptions) {
  if (typeof outDirOrOptions === 'string') {
    return {
      outputDir: resolve(outDirOrOptions),
      overwrite: true,
      projectName: 'generated-project',
      mode: undefined,
    }
  }

  const options = outDirOrOptions || {}
  const projectName = normalizeProjectName(options.projectName)
  const outputDir = resolve(options.outputDir || join(process.cwd(), 'generated-project'))

  return {
    outputDir,
    overwrite: options.overwrite ?? true,
    projectName,
    mode: options.mode,
  }
}

async function ensureOutputDirectory(outputDir, overwrite) {
  const exists = await fse.pathExists(outputDir)
  if (exists && !overwrite) {
    throw new Error(`Output directory already exists: ${outputDir}`)
  }

  if (exists) {
    await fse.emptyDir(outputDir)
    return
  }

  await fse.ensureDir(outputDir)
}

async function resolveSourceLayout(selected) {
  const appCoreExists = await fse.pathExists(APP_CORE_DIR)
  const appModulesExist = await fse.pathExists(APP_MODULES_DIR)
  const appHasAllSelectedModules = appModulesExist
    && (await Promise.all(selected.map((feature) => fse.pathExists(join(APP_MODULES_DIR, feature))))).every(Boolean)

  if (appCoreExists && appHasAllSelectedModules) {
    return {
      coreDir: APP_CORE_DIR,
      modulesDir: APP_MODULES_DIR,
      source: 'project-src',
    }
  }

  return {
    coreDir: TEMPLATE_CORE_DIR,
    modulesDir: TEMPLATE_MODULES_DIR,
    source: 'generator-template',
  }
}

async function collectFilesFromDirectory(sourceDir, targetPrefix = '') {
  const out = {}
  const entries = await fse.readdir(sourceDir, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name)
    const relativePath = targetPrefix ? `${targetPrefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      const nested = await collectFilesFromDirectory(sourcePath, relativePath)
      Object.assign(out, nested)
      continue
    }

    if (!entry.isFile()) continue
    out[relativePath.replaceAll('\\', '/')] = await fse.readFile(sourcePath, 'utf8')
  }

  return out
}

function buildProjectReadme(projectName, selected) {
  return `# ${projectName}

Generated backend project with selected features: ${selected.join(', ')}.

## Included structure

- \`src/core\` - shared config and utilities
- \`src/modules\` - selected feature modules only
- \`server.js\` - dynamic backend entry

## Run locally

1. Copy \`.env.example\` to \`.env\`
2. Install dependencies with \`npm install\`
3. Start the server with \`npm run dev\`

## Selected features

${selected.map((feature) => `- ${feature}`).join('\n')}
`
}

function buildProjectGitignore() {
  return `node_modules
.env
.DS_Store
`
}

function buildProjectManifest(selected, source) {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      features: selected,
      source,
    },
    null,
    2,
  )
}

/** Directories never copied in full-app mirror (install/build/runtime artifacts). */
const EXCLUDE_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'uploads',
  '.cache',
  'dist',
  'coverage',
  '.turbo',
  'build',
  'out',
])

/** Extra dirs to skip (IDE / local tooling — may contain tokens or noise). */
const EXTRA_EXCLUDE_DIR_NAMES = new Set([
  '.claude',
  '.cursor',
  '.vscode',
  '.idea',
  '.continue',
  '__pycache__',
  '.pytest_cache',
])

/**
 * Skip names that often contain pasted secrets or trigger GitHub push protection.
 * Any `.env*` except `.env.example` (e.g. `.env`, `.env.local`, `.env.backup`, `.envrc`).
 */
function shouldExcludeMirrorFileName(name) {
  if (name.startsWith('.env') && name !== '.env.example') return true
  if (name.startsWith('Untitled')) return true
  if (/\.pem$/i.test(name)) return true
  if (name === 'id_rsa' || name === 'id_ed25519' || name === 'known_hosts') return true
  if (name === 'credentials.json' || name === 'serviceAccountKey.json') return true
  return false
}

const MAX_MIRROR_FILE_BYTES = 95 * 1024 * 1024

const LOGO_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])

/**
 * Copy admin-uploaded company logo into `public/brand-logo.*` so the cloned repo shows the right brand
 * (the mirror excludes `uploads/` by default).
 * @param {Record<string, Buffer>} files
 * @param {string} [companyLogoAbsPath]
 * @returns {Promise<string>} public URL path e.g. `/brand-logo.png` or ''
 */
async function maybeBundleCompanyLogo(files, companyLogoAbsPath) {
  if (!companyLogoAbsPath || typeof companyLogoAbsPath !== 'string') return ''
  try {
    const buf = await fse.readFile(companyLogoAbsPath)
    let ext = extname(companyLogoAbsPath).toLowerCase()
    if (!LOGO_EXTS.has(ext)) ext = '.png'
    const outName = `brand-logo${ext}`
    files[`public/${outName}`] = buf
    return `/${outName}`
  } catch (e) {
    console.warn('[Generator] Could not bundle company logo:', e?.message || e)
    return ''
  }
}

/**
 * Recursively collect all project files as Buffers (supports PDFs, etc.).
 * @param {string} rootAbs
 * @returns {Promise<Record<string, Buffer>>}
 */
async function collectFullWorkspaceMirror(rootAbs) {
  const files = {}
  const rootResolved = resolve(rootAbs)
  /** Omit `pdfs/` by default: large docs can trip GitHub secret scanning; set GENERATOR_MIRROR_INCLUDE_PDFS=1 to bundle them. */
  const includePdfs = process.env.GENERATOR_MIRROR_INCLUDE_PDFS === '1'

  async function walkRelative(relDir) {
    const absDir = join(rootResolved, relDir)
    const entries = await fse.readdir(absDir, { withFileTypes: true })
    for (const ent of entries) {
      const rel = relDir ? `${relDir}/${ent.name}` : ent.name
      const posixRel = rel.replaceAll('\\', '/')
      if (ent.isDirectory()) {
        if (EXCLUDE_DIR_NAMES.has(ent.name)) continue
        if (EXTRA_EXCLUDE_DIR_NAMES.has(ent.name)) continue
        if (!includePdfs && ent.name === 'pdfs') continue
        await walkRelative(rel)
      } else if (ent.isFile()) {
        if (shouldExcludeMirrorFileName(ent.name)) continue
        const absFile = join(rootResolved, rel)
        let stat
        try {
          stat = await fse.lstat(absFile)
        } catch {
          continue
        }
        if (stat.isSymbolicLink()) continue
        if (stat.size > MAX_MIRROR_FILE_BYTES) {
          console.warn(`[Generator] Skipping file (too large, ${stat.size} bytes): ${posixRel}`)
          continue
        }
        files[posixRel] = await fse.readFile(absFile)
      }
    }
  }

  await walkRelative('')
  return files
}

function buildCloneInstructionsMarkdown() {
  return `# After cloning this repository

This is a **full snapshot** of the NineHertz AI app: **Express** (\`server.js\`) + **Vite React** (\`src/\`), orchestration, RAG, admin-style APIs, etc. — the same codebase you run locally.

## Setup

1. Use **Node.js 20+**.
2. \`cp .env.example .env\` and set keys (\`MONGODB_URI\`, \`ADMIN_AUTH_SECRET\`, \`ADMIN_EMAIL\`, \`ADMIN_PASSWORD\`, \`ANTHROPIC_API_KEY\`, \`OPENAI_API_KEY\`, \`GITHUB_TOKEN\` if needed, etc.).
3. Install:
   \`\`\`bash
   npm install --legacy-peer-deps
   \`\`\`
4. Run API + chat UI:
   \`\`\`bash
   npm run dev
   \`\`\`
   Or \`npm run dev:server\` / \`npm run dev:frontend\` separately.

## Notes

- \`uploads/\` and \`.cache/\` are not in the repo; they are created at runtime.
- \`pdfs/\` may be omitted from the GitHub bundle by default (see \`pdfs/README.md\` in the repo). Add PDFs locally for RAG, or set \`GENERATOR_MIRROR_INCLUDE_PDFS=1\` on the generator host to include them.
- \`generator.config.json\` records **company feature tags** from the admin when this repo was created; the app still exposes the full API surface like the source project.
`
}

/**
 * Full mirror of PROJECT_ROOT for GitHub / export (all features work like source).
 */
async function buildFullAppMirrorBundle(features, options = {}) {
  const selected = normalizeFeatures(features)
  if (selected.length === 0) {
    throw new Error('At least one feature is required (chat, srs, or call).')
  }
  const projectName = normalizeProjectName(options.projectName)
  const rawMeta = options.companyFeatureTagsForMetadata
  const companyFeaturesMeta = Array.isArray(rawMeta)
    ? [...new Set(rawMeta.map((s) => String(s || '').trim()).filter(Boolean))]
    : selected
  const files = await collectFullWorkspaceMirror(PROJECT_ROOT)

  /** Always ship placeholder-only env template (never a dev machine’s filled `.env.example`). */
  const safeEnvExamplePath = join(__dirname, 'safeDotEnvExample.full.txt')
  if (await fse.pathExists(safeEnvExamplePath)) {
    files['.env.example'] = await fse.readFile(safeEnvExamplePath)
  }

  if (process.env.GENERATOR_MIRROR_INCLUDE_PDFS !== '1') {
    files['pdfs/README.md'] = Buffer.from(
      [
        '# PDFs for RAG',
        '',
        'This repository was generated **without** copying bundled PDFs from the source app (large documents can trigger GitHub “secret detected” push protection).',
        '',
        'Add your own `.pdf` files here (for example `srs.pdf`) and restart the API so `rag.js` can index them.',
        '',
        'To include `pdfs/` in future exports, set on the generator server: `GENERATOR_MIRROR_INCLUDE_PDFS=1`.',
        '',
      ].join('\n'),
      'utf8',
    )
  }

  const companyLogoUrl = await maybeBundleCompanyLogo(files, options.companyLogoAbsPath)
  const companyOtherUrls = Array.isArray(options.companyOtherUrls)
    ? options.companyOtherUrls.map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean)
    : []

  files['generator.config.json'] = Buffer.from(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        companyFeatures: companyFeaturesMeta,
        companyWebsiteUrl: typeof options.companyWebsiteUrl === 'string' ? options.companyWebsiteUrl.trim() : '',
        companyName: typeof options.companyName === 'string' ? options.companyName.trim() : '',
        companyLogoUrl,
        companyOtherUrls,
        mode: 'full-app-mirror',
        description:
          'Full workspace snapshot: real server.js, orchestration/, React src/, RAG. Same behavior as source after npm install --legacy-peer-deps.',
      },
      null,
      2,
    ),
    'utf8',
  )

  files['SETUP_AFTER_CLONE.md'] = Buffer.from(buildCloneInstructionsMarkdown(), 'utf8')

  return {
    projectName,
    features: selected,
    source: 'full-app-mirror',
    files,
  }
}

/**
 * Small stub project (template + synthetic server.js) — tests only unless explicitly requested.
 */
async function buildMinimalTemplateBundle(features, options = {}) {
  const selected = normalizeFeatures(features)
  if (selected.length === 0) {
    throw new Error('At least one feature is required (chat, srs, or call).')
  }

  const projectName = normalizeProjectName(options.projectName)
  const sourceLayout = await resolveSourceLayout(selected)
  /** @type {Record<string, string>} */
  const files = {}

  Object.assign(files, await collectFilesFromDirectory(sourceLayout.coreDir, 'src/core'))

  for (const feature of selected) {
    const sourceDir = join(sourceLayout.modulesDir, feature)
    const exists = await fse.pathExists(sourceDir)
    if (!exists) {
      throw new Error(`Template module not found for feature "${feature}".`)
    }
    Object.assign(files, await collectFilesFromDirectory(sourceDir, `src/modules/${feature}`))
  }

  const packageJson = await fse.readJson(PACKAGE_TEMPLATE_PATH)
  packageJson.name = projectName
  const envExample = await fse.readFile(ENV_EXAMPLE_PATH, 'utf8')

  files['server.js'] = buildServerJs(selected)
  files['package.json'] = JSON.stringify(packageJson, null, 2)
  files['.env.example'] = envExample
  files['.gitignore'] = buildProjectGitignore()
  files['README.md'] = buildProjectReadme(projectName, selected)
  const rawMeta = options.companyFeatureTagsForMetadata
  const companyFeaturesMeta = Array.isArray(rawMeta)
    ? [...new Set(rawMeta.map((s) => String(s || '').trim()).filter(Boolean))]
    : selected

  const companyLogoUrl = await maybeBundleCompanyLogo(files, options.companyLogoAbsPath)
  const companyOtherUrls = Array.isArray(options.companyOtherUrls)
    ? options.companyOtherUrls.map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean)
    : []

  files['generator.config.json'] = Buffer.from(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        companyFeatures: companyFeaturesMeta,
        features: selected, // keep old key for any legacy consumers
        companyWebsiteUrl: typeof options.companyWebsiteUrl === 'string' ? options.companyWebsiteUrl.trim() : '',
        companyName: typeof options.companyName === 'string' ? options.companyName.trim() : '',
        companyLogoUrl,
        companyOtherUrls,
        mode: 'minimal',
        source: sourceLayout.source,
        description: 'Minimal repo: only selected feature modules + dynamic server.js.',
      },
      null,
      2,
    ),
    'utf8',
  )

  return {
    projectName,
    features: selected,
    source: sourceLayout.source,
    files,
  }
}

function resolveBundleMode(options) {
  if (options.mode === 'minimal' || options.mode === 'full') return options.mode
  return process.env.GENERATOR_MIRROR_MODE === 'minimal' ? 'minimal' : 'full'
}

export async function buildGeneratedProjectBundle(features, options = {}) {
  const mode = resolveBundleMode(options)
  if (mode === 'full') {
    return buildFullAppMirrorBundle(features, options)
  }
  return buildMinimalTemplateBundle(features, options)
}

export async function generateProject(features, outDirOrOptions) {
  const selected = normalizeFeatures(features)
  if (selected.length === 0) {
    throw new Error('At least one feature is required (chat, srs, or call).')
  }

  const { outputDir, overwrite, projectName, mode } = resolveGeneratorOptions(outDirOrOptions)
  await ensureOutputDirectory(outputDir, overwrite)
  const bundle = await buildGeneratedProjectBundle(selected, { projectName, mode })

  await Promise.all(
    Object.entries(bundle.files).map(async ([filePath, content]) => {
      const targetPath = join(outputDir, ...filePath.split('/'))
      await fse.ensureDir(dirname(targetPath))
      await fse.writeFile(targetPath, content)
    }),
  )

  return { path: outputDir, features: bundle.features, source: bundle.source }
}
