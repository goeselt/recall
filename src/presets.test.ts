import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolvePreset, type PresetVars } from './presets.ts'

const base: PresetVars = {
  toolCachePath: '/opt/hostedtoolcache',
  os: 'linux',
  arch: 'x64',
  major: '22',
}

test('resolves a known preset with all variables interpolated', () => {
  const preset = resolvePreset('node', base)
  assert.equal(preset.path, '/opt/hostedtoolcache/node')
  assert.equal(preset.keyPrefix, 'node-22-linux-x64')
  assert.deepEqual(preset.versionCommand, ['node', '--version'])
})

test('throws for an unknown preset and lists the available ones', () => {
  assert.throws(() => resolvePreset('rust', base), /Unknown tool preset "rust".*node, python, go/s)
})

test('omits an empty major segment without leaving a double dash', () => {
  const preset = resolvePreset('node', { ...base, major: '' })
  assert.equal(preset.keyPrefix, 'node-linux-x64')
})

test('interpolates os and arch into the key prefix', () => {
  const preset = resolvePreset('node', { ...base, os: 'windows', arch: 'arm64' })
  assert.equal(preset.keyPrefix, 'node-22-windows-arm64')
})

test('uses the provided tool cache path verbatim', () => {
  const preset = resolvePreset('go', { ...base, toolCachePath: 'C:\\hostedtoolcache' })
  assert.equal(preset.path, 'C:\\hostedtoolcache/go')
})
