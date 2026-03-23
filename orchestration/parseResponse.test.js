/**
 * Unit tests for parseChatResponse (orchestration/parseResponse.js).
 * Run: node --test orchestration/parseResponse.test.js
 */
import test from 'node:test'
import assert from 'node:assert'
import { parseChatResponse } from './parseResponse.js'

test('parseChatResponse returns defaults for non-string input', () => {
  const out = parseChatResponse(null)
  assert.strictEqual(out.message, '')
  assert.strictEqual(out.options, null)
  assert.strictEqual(out.questionNum, 0)
  assert.strictEqual(out.plan, null)
})

test('parseChatResponse parses valid JSON string', () => {
  const raw = JSON.stringify({
    message: 'Hello there',
    options: ['A', 'B'],
    questionNum: 1,
    plan: { title: 'Test' },
  })
  const out = parseChatResponse(raw)
  assert.strictEqual(out.message, 'Hello there')
  assert.deepStrictEqual(out.options, ['A', 'B'])
  assert.strictEqual(out.questionNum, 1)
  assert.deepStrictEqual(out.plan, { title: 'Test' })
})

test('parseChatResponse extracts first JSON from text with code fence', () => {
  const raw = '```json\n{"message": "From fence", "options": null, "questionNum": 0, "plan": null}\n```'
  const out = parseChatResponse(raw)
  assert.strictEqual(out.message, 'From fence')
  assert.strictEqual(out.options, null)
})

test('parseChatResponse extracts first JSON when trailing text exists', () => {
  const raw = '{"message": "Only this", "options": null, "questionNum": 0, "plan": null} and some extra text'
  const out = parseChatResponse(raw)
  assert.strictEqual(out.message, 'Only this')
})

test('parseChatResponse fallback: invalid JSON becomes message', () => {
  const raw = 'This is not JSON at all'
  const out = parseChatResponse(raw)
  assert.strictEqual(out.message, 'This is not JSON at all')
  assert.strictEqual(out.options, null)
  assert.strictEqual(out.questionNum, 0)
  assert.strictEqual(out.plan, null)
})

test('parseChatResponse normalizes missing fields', () => {
  const raw = '{"message": "Hi"}'
  const out = parseChatResponse(raw)
  assert.strictEqual(out.message, 'Hi')
  assert.strictEqual(out.options, null)
  assert.strictEqual(out.questionNum, 0)
  assert.strictEqual(out.plan, null)
})

test('parseChatResponse normalizes options to null when not array', () => {
  const raw = '{"message": "Hi", "options": "not an array", "questionNum": 0, "plan": null}'
  const out = parseChatResponse(raw)
  assert.strictEqual(out.options, null)
})
