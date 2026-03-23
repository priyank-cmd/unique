/**
 * Unit tests for classifyIntent (orchestration/router.js).
 * Run: node --test orchestration/router.test.js
 */
import test from 'node:test'
import assert from 'node:assert'
import { classifyIntent } from './router.js'

test('classifyIntent returns discovery for empty or missing input', () => {
  assert.strictEqual(classifyIntent(''), 'discovery')
  assert.strictEqual(classifyIntent('   '), 'discovery')
  assert.strictEqual(classifyIntent(null), 'discovery')
  assert.strictEqual(classifyIntent(undefined), 'discovery')
})

test('classifyIntent returns document when DOCUMENT_TERMS present', () => {
  assert.strictEqual(classifyIntent('tell me about the SRS'), 'document')
  assert.strictEqual(classifyIntent('trigas login flow'), 'document')
  assert.strictEqual(classifyIntent('student housing requirements'), 'document')
  assert.strictEqual(classifyIntent('pdf document'), 'document')
  assert.strictEqual(classifyIntent('functional requirements'), 'document')
})

test('classifyIntent returns informative when INFORMATIVE_TERMS present and no document terms', () => {
  assert.strictEqual(classifyIntent('what does NineHertz do'), 'informative')
  assert.strictEqual(classifyIntent('who is NineHertz'), 'informative')
  assert.strictEqual(classifyIntent('contact info'), 'informative')
  assert.strictEqual(classifyIntent('about the company'), 'informative')
  assert.strictEqual(classifyIntent('case studies'), 'informative')
})

test('classifyIntent document takes precedence over informative when both match', () => {
  // DOCUMENT_TERMS are checked first in router.js
  assert.strictEqual(classifyIntent('what is in the SRS'), 'document')
})

test('classifyIntent returns discovery for generic question with no matching terms', () => {
  assert.strictEqual(classifyIntent('hello'), 'discovery')
  assert.strictEqual(classifyIntent('I need a project'), 'discovery')
  assert.strictEqual(classifyIntent('build me an app'), 'discovery')
})
