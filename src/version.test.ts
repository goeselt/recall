import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractVersion } from './version.ts'

const SEMVER = '(\\d+\\.\\d+\\.\\d+)'

test('extracts semver from node --version output', () => {
  assert.equal(extractVersion('v22.15.0', SEMVER), '22.15.0')
})

test('extracts version from prefixed output', () => {
  assert.equal(extractVersion('Python 3.12.4', SEMVER), '3.12.4')
})

test('extracts version from go-style output with a custom pattern', () => {
  assert.equal(extractVersion('go version go1.22.3 linux/amd64', 'go(\\d+\\.\\d+\\.\\d+)'), '1.22.3')
})

test('returns null when the pattern does not match', () => {
  assert.equal(extractVersion('no version here', SEMVER), null)
})

test('falls back to the full match when there is no capture group', () => {
  assert.equal(extractVersion('v22.15.0', '\\d+\\.\\d+\\.\\d+'), '22.15.0')
})

test('matches the first occurrence in multiline output', () => {
  assert.equal(extractVersion('header\nv1.2.3\nv4.5.6', SEMVER), '1.2.3')
})

test('returns null for an invalid regex pattern', () => {
  assert.equal(extractVersion('v1.2.3', '(invalid['), null)
})
