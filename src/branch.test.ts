import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectDefaultBranch, getSaveDecision } from './branch.ts'

test('allows save on the default branch when the gate is enabled', () => {
  assert.equal(getSaveDecision(true, 'main', 'main', 'push').allowed, true)
})

test('blocks save on a feature branch when the gate is enabled', () => {
  assert.equal(getSaveDecision(true, 'feature/x', 'main', 'push').allowed, false)
})

test('allows save on any branch when the gate is disabled', () => {
  assert.equal(getSaveDecision(false, 'feature/x', 'main', 'pull_request').allowed, true)
})

test('compares against a custom default branch name', () => {
  assert.equal(getSaveDecision(true, 'develop', 'develop', 'push').allowed, true)
})

test('blocks pull_request saves when the default-branch gate is enabled', () => {
  assert.equal(getSaveDecision(true, 'main', 'main', 'pull_request').allowed, false)
})

test('blocks pull_request_target saves when the default-branch gate is enabled', () => {
  assert.equal(getSaveDecision(true, 'main', 'main', 'pull_request_target').allowed, false)
})

test('explains pull_request save skips', () => {
  const decision = getSaveDecision(true, 'feature/x', 'main', 'pull_request')
  assert.equal(decision.allowed, false)
  assert.match(decision.reason, /pull_request event/)
  assert.match(decision.reason, /restore existing caches/)
})

test('explains non-default branch save skips', () => {
  const decision = getSaveDecision(true, 'feature/x', 'main', 'push')
  assert.equal(decision.allowed, false)
  assert.match(decision.reason, /feature\/x/)
  assert.match(decision.reason, /default branch "main"/)
})

test('explains allowed saves when the gate is disabled', () => {
  const decision = getSaveDecision(false, 'feature/x', 'main', 'pull_request')
  assert.equal(decision.allowed, true)
  assert.match(decision.reason, /save-on-default-branch-only is false/)
})

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'branch-test-'))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

test('detectDefaultBranch reads default_branch from the event payload', () => {
  const eventPath = join(tempDir, 'event.json')
  writeFileSync(eventPath, JSON.stringify({ repository: { default_branch: 'develop' } }))
  assert.equal(detectDefaultBranch(eventPath), 'develop')
})

test('detectDefaultBranch falls back to main when repository field is missing', () => {
  const eventPath = join(tempDir, 'event.json')
  writeFileSync(eventPath, JSON.stringify({}))
  assert.equal(detectDefaultBranch(eventPath), 'main')
})

test('detectDefaultBranch falls back to main when the file does not exist', () => {
  assert.equal(detectDefaultBranch(join(tempDir, 'nonexistent.json')), 'main')
})

test('detectDefaultBranch falls back to main when the file contains invalid JSON', () => {
  const eventPath = join(tempDir, 'event.json')
  writeFileSync(eventPath, 'not json')
  assert.equal(detectDefaultBranch(eventPath), 'main')
})

test('detectDefaultBranch falls back to main when eventPath is undefined', () => {
  assert.equal(detectDefaultBranch(), 'main')
})

/** Capture @actions/core's stdout commands (e.g. "::warning::...") emitted while fn runs. */
function captureStdout(fn: () => void): string {
  const original = process.stdout.write.bind(process.stdout)
  let out = ''
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    return true
  }) as typeof process.stdout.write
  try {
    fn()
  } finally {
    process.stdout.write = original
  }
  return out
}

test('detectDefaultBranch warns when it falls back to main', () => {
  const out = captureStdout(() => {
    assert.equal(detectDefaultBranch(join(tempDir, 'nonexistent.json')), 'main')
  })
  assert.match(out, /::warning::/)
  assert.match(out, /default branch/)
})

test('detectDefaultBranch does not warn when detection succeeds', () => {
  const eventPath = join(tempDir, 'event.json')
  writeFileSync(eventPath, JSON.stringify({ repository: { default_branch: 'develop' } }))
  const out = captureStdout(() => {
    assert.equal(detectDefaultBranch(eventPath), 'develop')
  })
  assert.doesNotMatch(out, /::warning::/)
})
