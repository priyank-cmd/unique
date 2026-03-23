import test from 'node:test'
import assert from 'node:assert/strict'
import { createSerialJobQueue } from './jobQueue.js'

test('createSerialJobQueue processes jobs in order', async () => {
  const seen = []
  const queue = createSerialJobQueue(async (job) => {
    seen.push(`start:${job}`)
    await new Promise((resolve) => setTimeout(resolve, 5))
    seen.push(`end:${job}`)
  })

  queue.enqueue('a')
  queue.enqueue('b')
  queue.enqueue('c')

  await queue.onIdle()

  assert.deepEqual(seen, [
    'start:a',
    'end:a',
    'start:b',
    'end:b',
    'start:c',
    'end:c',
  ])
})

test('createSerialJobQueue continues after a worker error', async () => {
  const seen = []
  const queue = createSerialJobQueue(async (job) => {
    seen.push(job)
    if (job === 'bad') throw new Error('boom')
  })

  queue.enqueue('bad')
  queue.enqueue('good')

  await queue.onIdle()

  assert.deepEqual(seen, ['bad', 'good'])
})
