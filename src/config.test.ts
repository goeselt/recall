import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfig } from './config.ts'

const ENV: NodeJS.ProcessEnv = {
  RUNNER_OS: 'Linux',
  RUNNER_ARCH: 'X64',
  RUNNER_TOOL_CACHE: '/opt/hostedtoolcache',
}

function clearInputs(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('INPUT_')) delete process.env[key]
  }
}

function setInput(name: string, value: string): void {
  process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] = value
}

beforeEach(clearInputs)

test('static mode resolves without a command', () => {
  setInput('path', '/tmp/data')
  setInput('key-prefix', 'data-linux-x64')
  setInput('version', 'v1')
  const config = resolveConfig(ENV)
  assert.equal(config.staticVersion, 'v1')
  assert.equal(config.versionCommand, undefined)
})

test('dynamic mode parses an explicit command', () => {
  setInput('path', '/tmp/data')
  setInput('key-prefix', 'data-linux-x64')
  setInput('version-command', 'mytool --version')
  const config = resolveConfig(ENV)
  assert.deepEqual(config.versionCommand, ['mytool', '--version'])
  assert.equal(config.staticVersion, undefined)
})

test('dynamic mode preserves quoted command arguments', () => {
  setInput('path', '/tmp/data')
  setInput('key-prefix', 'data-linux-x64')
  setInput('version-command', 'mytool --format "version json" --label \'release candidate\'')
  const config = resolveConfig(ENV)
  assert.deepEqual(config.versionCommand, ['mytool', '--format', 'version json', '--label', 'release candidate'])
})

test('rejects an unterminated quoted command argument', () => {
  setInput('path', '/tmp/data')
  setInput('key-prefix', 'data-linux-x64')
  setInput('version-command', 'mytool --format "version json')
  assert.throws(() => resolveConfig(ENV), /unterminated/)
})

test('normalizes save-on-default-branch-only case-insensitively', () => {
  setInput('path', '/tmp/data')
  setInput('key-prefix', 'data-linux-x64')
  setInput('version', 'v1')
  setInput('save-on-default-branch-only', 'TRUE')
  const config = resolveConfig(ENV)
  assert.equal(config.saveOnDefaultOnly, true)
})

test('rejects invalid save-on-default-branch-only values', () => {
  setInput('path', '/tmp/data')
  setInput('key-prefix', 'data-linux-x64')
  setInput('version', 'v1')
  setInput('save-on-default-branch-only', 'yes')
  assert.throws(() => resolveConfig(ENV), /must be "true" or "false"/)
})

test('preset fills path, key-prefix and command', () => {
  setInput('tool', 'node')
  setInput('tool-major', '22')
  const config = resolveConfig(ENV)
  assert.equal(config.path, '/opt/hostedtoolcache/node')
  assert.equal(config.keyPrefix, 'node-22-linux-x64')
  assert.deepEqual(config.versionCommand, ['node', '--version'])
})

test('a static version overrides a preset command', () => {
  setInput('tool', 'node')
  setInput('tool-major', '22')
  setInput('version', '22.15.0')
  const config = resolveConfig(ENV)
  assert.equal(config.staticVersion, '22.15.0')
  assert.equal(config.versionCommand, undefined)
})

test('rejects version and version-command together', () => {
  setInput('path', '/tmp/data')
  setInput('key-prefix', 'data')
  setInput('version', 'v1')
  setInput('version-command', 'mytool --version')
  assert.throws(() => resolveConfig(ENV), /mutually exclusive/)
})

test('rejects a missing version source', () => {
  setInput('path', '/tmp/data')
  setInput('key-prefix', 'data')
  assert.throws(() => resolveConfig(ENV), /No version source/)
})

test('rejects a missing path', () => {
  setInput('version', 'v1')
  assert.throws(() => resolveConfig(ENV), /Missing required input "path"/)
})

test('rejects a relative cache path', () => {
  setInput('path', './vendor')
  setInput('key-prefix', 'vendor-linux-x64')
  setInput('version', 'v1')
  assert.throws(() => resolveConfig(ENV), /github\.workspace/)
})

test('rejects a filesystem root cache path', () => {
  setInput('path', '/')
  setInput('key-prefix', 'root-linux-x64')
  setInput('version', 'v1')
  assert.throws(() => resolveConfig(ENV), /filesystem root/)
})

test('accepts a windows absolute path on windows runners', () => {
  setInput('path', 'C:\\tools\\data')
  setInput('key-prefix', 'data-windows-x64')
  setInput('version', 'v1')
  const config = resolveConfig({ ...ENV, RUNNER_OS: 'Windows' })
  assert.equal(config.path, 'C:\\tools\\data')
})

test('rejects unsafe key-prefix characters', () => {
  setInput('path', '/tmp/data')
  setInput('key-prefix', 'data/linux')
  setInput('version', 'v1')
  assert.throws(() => resolveConfig(ENV), /key-prefix.*node-22-linux-x64/)
})

test('rejects unsafe tool-major characters in preset mode', () => {
  setInput('tool', 'node')
  setInput('tool-major', '22/main')
  assert.throws(() => resolveConfig(ENV), /tool-major.*letters, numbers/)
})

test('rejects unsafe static version characters', () => {
  setInput('path', '/tmp/data')
  setInput('key-prefix', 'data-linux-x64')
  setInput('version', 'v1\nmalformed')
  assert.throws(() => resolveConfig(ENV), /version.*letters, numbers/)
})

test('rejects unsafe version patterns with nested quantifiers', () => {
  setInput('path', '/tmp/data')
  setInput('key-prefix', 'data-linux-x64')
  setInput('version-command', 'mytool --version')
  setInput('version-pattern', '(a+)+$')
  assert.throws(() => resolveConfig(ENV), /simple pattern/)
})
