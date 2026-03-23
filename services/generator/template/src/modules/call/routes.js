/**
 * Call / voice agent module routes.
 * Mounted at /api/call in generated server.
 */
import { Router } from 'express'
import { asyncHandler } from '../../core/utils.js'

const router = Router()

router.post('/chat', asyncHandler(async (req, res) => {
  res.json({
    response: 'Call module is active. Configure TTS/STT in .env (e.g. OPENAI_API_KEY).',
    isCallComplete: false,
    coveredAreas: [],
    extractedInfo: {},
  })
}))

router.post('/plan', asyncHandler(async (req, res) => {
  res.json({ srs: null, plan: null, enhanced: false })
}))

export default router
