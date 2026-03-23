/**
 * Builds the generated project's server.js content.
 * Dynamically loads routes based on selected features.
 * @param {string[]} features - e.g. ['chat', 'srs', 'call']
 * @returns {string} Full server.js source
 */
export function buildServerJs(features) {
  const featureMounts = [
    { name: 'chat', path: '/api/chat', modulePath: './src/modules/chat/index.js' },
    { name: 'srs', path: '/api/srs', modulePath: './src/modules/srs/index.js' },
    { name: 'call', path: '/api/call', modulePath: './src/modules/call/index.js' },
  ]
  const selected = featureMounts.filter((m) => features.includes(m.name))

  const routeBlocks = selected
    .map(
      (m) => `
  if (features.includes('${m.name}')) {
    const mod = await import('${m.modulePath}')
    app.use('${m.path}', mod.routes)
  }`,
    )
    .join('')

  return `import express from 'express'
import cors from 'cors'
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { PORT } from './src/core/config.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const features = ${JSON.stringify(features)}

const __dirname = dirname(fileURLToPath(import.meta.url))
const GENERATOR_CONFIG_PATH = join(__dirname, 'generator.config.json')

function safeReadGeneratorConfig() {
  if (!existsSync(GENERATOR_CONFIG_PATH)) return { companyFeatures: [] }
  try {
    const raw = readFileSync(GENERATOR_CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { companyFeatures: [] }
    const companyFeatures = Array.isArray(parsed.companyFeatures) ? parsed.companyFeatures : []
    return { companyFeatures }
  } catch {
    return { companyFeatures: [] }
  }
}

app.get('/api/generator-config', (req, res) => {
  res.json(safeReadGeneratorConfig())
})

// Health (always present)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', features })
})

async function main() {
  // Dynamic feature routes
  ${routeBlocks}

  app.use((err, _req, res, _next) => {
    console.error('[GeneratedProject] error:', err?.message || err)
    res.status(500).json({ error: err?.message || 'Internal server error' })
  })

  app.listen(PORT, () => {
    console.log('Server running at http://localhost:' + PORT)
  })
}
main().catch((err) => {
  console.error(err)
  process.exit(1)
})
`
}
