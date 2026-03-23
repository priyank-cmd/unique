/**
 * Unit tests for RAG-driven routing logic (computeIntent).
 * Run: node --test orchestration/index.test.js
 */
import test from 'node:test'
import assert from 'node:assert'
import { computeIntent } from './index.js'
import { classifyIntent } from './router.js'

test('computeIntent: generic question + sufficient RAG context -> document', () => {
  const longContext = 'x'.repeat(500)
  assert.strictEqual(computeIntent('what is phishing', longContext, classifyIntent('what is phishing')), 'document')
  assert.strictEqual(computeIntent('explain SRS', longContext, 'discovery'), 'document')
  assert.strictEqual(computeIntent('What are the requirements?', longContext, 'discovery'), 'document')
})

test('computeIntent: generic question + empty RAG context -> keyword intent', () => {
  // "what is phishing" -> informative (keyword "what"); no document terms
  assert.strictEqual(computeIntent('what is phishing', '', classifyIntent('what is phishing')), 'informative')
  assert.strictEqual(computeIntent('what does NineHertz do', '', classifyIntent('what does NineHertz do')), 'informative')
  // No keyword match -> discovery
  assert.strictEqual(computeIntent('explain the flow', '', 'discovery'), 'discovery')
})

test('computeIntent: generic question + short RAG (< 200 chars) -> keyword intent', () => {
  const shortContext = 'x'.repeat(100)
  assert.strictEqual(computeIntent('what is phishing', shortContext, 'discovery'), 'discovery')
})

test('computeIntent: NineHertz question with RAG context -> informative not document', () => {
  const longContext = 'x'.repeat(500)
  assert.strictEqual(computeIntent('what is NineHertz', longContext, 'informative'), 'informative')
  assert.strictEqual(computeIntent('tell me about nine hertz', longContext, 'informative'), 'informative')
})

test('computeIntent: non-generic question with RAG context -> keyword intent', () => {
  const longContext = 'x'.repeat(500)
  assert.strictEqual(computeIntent('hello', longContext, 'discovery'), 'discovery')
  assert.strictEqual(computeIntent('build me an app', longContext, 'discovery'), 'discovery')
})
