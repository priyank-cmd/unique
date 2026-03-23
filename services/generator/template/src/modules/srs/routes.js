/**
 * SRS (Software Requirements Specification) module routes.
 * Mounted at /api/srs in generated server.
 */
import { Router } from 'express'
import { asyncHandler } from '../../core/utils.js'

const router = Router()

router.post('/generate', asyncHandler(async (req, res) => {
  const body = req.body || {}
  res.json({
    success: true,
    srs: {
      title: body.title || 'Generated SRS',
      version: '1.0',
      executiveSummary: 'Configure your LLM in .env to generate full SRS.',
    },
  })
}))

router.get('/health', (_req, res) => {
  res.json({ module: 'srs', status: 'ok' })
})

export default router
