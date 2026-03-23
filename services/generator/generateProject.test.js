import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'os'
import { join } from 'path'
import fse from 'fs-extra'
import { buildGeneratedProjectBundle, generateProject } from './generateProject.js'

test('generateProject copies only selected modules', async () => {
  const tempDir = await fse.mkdtemp(join(tmpdir(), 'generator-test-'))

  try {
    const outputDir = join(tempDir, 'chat-only-project')
    const result = await generateProject(['chat', 'chat', 'unknown'], {
      outputDir,
      overwrite: true,
      projectName: 'Chat Only Project',
      mode: 'minimal',
    })

    assert.deepEqual(result.features, ['chat'])
    assert.equal(await fse.pathExists(join(outputDir, 'src', 'core')), true)
    assert.equal(await fse.pathExists(join(outputDir, 'src', 'modules', 'chat')), true)
    assert.equal(await fse.pathExists(join(outputDir, 'src', 'modules', 'srs')), false)
    assert.equal(await fse.pathExists(join(outputDir, 'src', 'modules', 'call')), false)

    const serverJs = await fse.readFile(join(outputDir, 'server.js'), 'utf8')
    assert.match(serverJs, /\.\/src\/modules\/chat\/index\.js/)
    assert.doesNotMatch(serverJs, /\.\/src\/modules\/srs\/index\.js/)
    assert.doesNotMatch(serverJs, /\.\/src\/modules\/call\/index\.js/)
  } finally {
    await fse.remove(tempDir)
  }
})

test('generateProject rejects an empty feature list', async () => {
  await assert.rejects(
    async () => generateProject([], { outputDir: join(tmpdir(), 'unused-generator-dir') }),
    /At least one feature is required/,
  )
})

test('buildGeneratedProjectBundle returns selected files in memory', async () => {
  const result = await buildGeneratedProjectBundle(['chat', 'unknown'], {
    projectName: 'Memory Only Project',
    mode: 'minimal',
  })

  assert.deepEqual(result.features, ['chat'])
  assert.equal(result.projectName, 'memory-only-project')
  assert.equal(typeof result.files['server.js'], 'string')
  assert.equal(typeof result.files['src/core/index.js'], 'string')
  assert.equal(typeof result.files['src/modules/chat/index.js'], 'string')
  assert.equal(result.files['src/modules/srs/index.js'], undefined)
  assert.equal(result.files['src/modules/call/index.js'], undefined)
})

test('full mirror bundle includes real server.js and React entry', async () => {
  const result = await buildGeneratedProjectBundle(['chat', 'call'], {
    projectName: 'full-mirror-test',
    mode: 'full',
  })

  assert.equal(result.source, 'full-app-mirror')
  const server = result.files['server.js']
  assert.ok(Buffer.isBuffer(server))
  assert.match(server.toString('utf8'), /orchestrate/)
  assert.ok(Buffer.isBuffer(result.files['src/main.tsx']) || Buffer.isBuffer(result.files['src/main.jsx']))
  assert.ok(result.files['orchestration/index.js'])
})
