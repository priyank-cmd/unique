/**
 * Chat module routes.
 * Mounted at /api/chat in generated server.
 */
import { Router } from 'express'
import { asyncHandler } from '../../core/utils.js'

const router = Router()

router.post('/', asyncHandler(async (req, res) => {
  res.json({
    message: 'Chat module is active. Configure your LLM in .env (e.g. ANTHROPIC_API_KEY).',
    options: null,
    questionNum: 0,
    plan: null,
  })
}))

router.post('/stream', asyncHandler(async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()
  res.write(`data: ${JSON.stringify({ type: 'message', message: 'Chat stream ready.' })}\n\n`)
  res.end()
}))

export default router
