import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getRestoreOutputs, inspectSavePath, shouldSkipDynamicSaveAfterRestore } from './cache-behavior.ts'

test('static restore sets cache-hit when a key was restored', () => {
  assert.deepEqual(getRestoreOutputs('static', 'tool-linux-1.2.3'), {
    cacheHit: 'true',
    cacheRestored: 'true',
    cacheKey: 'tool-linux-1.2.3',
  })
})

test('dynamic restore reports restored without claiming an exact cache hit', () => {
  assert.deepEqual(getRestoreOutputs('dynamic', 'tool-linux-1.2.3'), {
    cacheHit: 'false',
    cacheRestored: 'true',
    cacheKey: 'tool-linux-1.2.3',
  })
})

test('cache miss clears all restore outputs', () => {
  assert.deepEqual(getRestoreOutputs('static', undefined), {
    cacheHit: 'false',
    cacheRestored: 'false',
    cacheKey: '',
  })
})

test('dynamic restored caches skip post-step version command execution', () => {
  assert.equal(shouldSkipDynamicSaveAfterRestore('dynamic', 'tool-linux-1.2.3'), true)
})

test('dynamic cache misses still need post-step version detection', () => {
  assert.equal(shouldSkipDynamicSaveAfterRestore('dynamic', ''), false)
})

test('static restored caches do not use the dynamic skip path', () => {
  assert.equal(shouldSkipDynamicSaveAfterRestore('static', 'tool-linux-1.2.3'), false)
})

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'recall-cache-behavior-'))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

test('save preflight accepts a non-empty directory', () => {
  writeFileSync(join(tempDir, 'marker.txt'), 'cached\n')
  const inspection = inspectSavePath(tempDir)
  assert.equal(inspection.canSave, true)
  assert.match(inspection.reason, /contains files/)
})

test('save preflight rejects a missing path', () => {
  const inspection = inspectSavePath(join(tempDir, 'missing'))
  assert.equal(inspection.canSave, false)
  assert.match(inspection.reason, /does not exist/)
})

test('save preflight rejects a file path', () => {
  const filePath = join(tempDir, 'file.txt')
  writeFileSync(filePath, 'not a directory\n')
  const inspection = inspectSavePath(filePath)
  assert.equal(inspection.canSave, false)
  assert.match(inspection.reason, /not a directory/)
})

test('save preflight rejects a symlinked directory', () => {
  const target = join(tempDir, 'target')
  const link = join(tempDir, 'link')
  mkdirSync(target)
  writeFileSync(join(target, 'marker.txt'), 'cached\n')
  symlinkSync(target, link, 'dir')
  const inspection = inspectSavePath(link)
  assert.equal(inspection.canSave, false)
  assert.match(inspection.reason, /symbolic link/)
})

test('save preflight rejects an empty directory', () => {
  const inspection = inspectSavePath(tempDir)
  assert.equal(inspection.canSave, false)
  assert.match(inspection.reason, /is empty/)
})
