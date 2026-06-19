import * as core from '@actions/core'
import { resolvePreset } from './presets.ts'
import {
  isRiskyWholeDirectory,
  validateCacheKeyComponent,
  validateCachePath,
  validateVersionPattern,
} from './validation.ts'

/**
 * Fully resolved configuration shared between the restore and save phases.
 * Exactly one version source is set: `staticVersion` (static mode) or `versionCommand` (dynamic mode).
 */
export interface Config {
  path: string
  keyPrefix: string
  saveOnDefaultOnly: boolean
  staticVersion: string | undefined
  versionCommand: string[] | undefined
  versionPattern: string
}

const DEFAULT_VERSION_PATTERN = '(\\d+\\.\\d+\\.\\d+)'

/**
 * Resolve action inputs into a Config.
 * Resolution order per field: explicit input > preset value > built-in default.
 * Rejects ambiguous combinations rather than guessing.
 */
export function resolveConfig(env: NodeJS.ProcessEnv): Config {
  const tool = core.getInput('tool')
  const toolMajor = core.getInput('tool-major')
  const staticVersion = core.getInput('version')
  const explicitCommand = core.getInput('version-command')
  const explicitPattern = core.getInput('version-pattern')

  let path = core.getInput('path')
  let keyPrefix = core.getInput('key-prefix')
  let versionPattern = explicitPattern
  // The || 'true' guards unit tests that set process.env directly; action.yml's default handles real runs.
  const saveOnDefaultOnly = parseBooleanInput(core.getInput('save-on-default-branch-only') || 'true')
  if (!saveOnDefaultOnly) {
    core.warning(
      'Input "save-on-default-branch-only" is false. Any branch or event that can modify the cache path may save a cache entry.',
    )
  }

  // A version source is either static or dynamic, never both.
  // Reject an explicit conflict outright instead of silently picking one -- the wrong choice corrupts the cache key.
  if (staticVersion && explicitCommand) {
    throw new Error(
      'Inputs "version" and "version-command" are mutually exclusive: ' +
        'set "version" for a static key, or "version-command" to detect it, not both.',
    )
  }

  if (toolMajor && !tool) {
    core.warning('Input "tool-major" has no effect without "tool" and is ignored.')
  }
  if (toolMajor && tool) {
    validateCacheKeyComponent('tool-major', toolMajor, 32)
  }

  let versionCommand: string[] | undefined = explicitCommand ? splitCommand(explicitCommand) : undefined

  if (tool) {
    const preset = resolvePreset(tool, {
      toolCachePath: env.RUNNER_TOOL_CACHE || '/opt/hostedtoolcache',
      os: (env.RUNNER_OS || 'Linux').toLowerCase(),
      arch: (env.RUNNER_ARCH || 'X64').toLowerCase(),
      major: toolMajor,
    })
    path = path || preset.path
    keyPrefix = keyPrefix || preset.keyPrefix
    versionPattern = versionPattern || preset.versionPattern
    // The preset supplies a command only when the caller chose neither version source.
    if (!staticVersion) {
      versionCommand = versionCommand ?? preset.versionCommand
    }
  }

  versionPattern = versionPattern || DEFAULT_VERSION_PATTERN

  if (!path) {
    throw new Error('Missing required input "path". Set "path" directly or use "tool" to select a preset.')
  }
  if (!keyPrefix) {
    throw new Error('Missing required input "key-prefix". Set "key-prefix" directly or use "tool" to select a preset.')
  }
  if (!staticVersion && (!versionCommand || versionCommand.length === 0)) {
    throw new Error(
      'No version source. Set "version" for a static key, "version-command" to detect it, or "tool" for a preset.',
    )
  }

  if (staticVersion && explicitPattern) {
    core.warning('Input "version-pattern" has no effect in static mode ("version" set) and is ignored.')
  }

  validateCachePath(path, env.RUNNER_OS)
  validateCacheKeyComponent('key-prefix', keyPrefix, 256)
  if (staticVersion) {
    validateCacheKeyComponent('version', staticVersion)
  } else {
    validateVersionPattern(versionPattern)
  }

  if (isRiskyWholeDirectory(path, env.HOME, env.RUNNER_OS)) {
    core.warning('Input "path" points at the whole home directory; this may cache unintended files.')
  }
  if (isRiskyWholeDirectory(path, env.GITHUB_WORKSPACE, env.RUNNER_OS)) {
    core.warning('Input "path" points at the whole workspace; cache a narrower subdirectory when possible.')
  }

  return {
    path,
    keyPrefix,
    saveOnDefaultOnly,
    staticVersion: staticVersion || undefined,
    versionCommand,
    versionPattern,
  }
}

function splitCommand(raw: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  let escaping = false

  for (const char of raw.trim()) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\' && quote !== "'") {
      escaping = true
      continue
    }

    if ((char === '"' || char === "'") && !quote) {
      quote = char
      continue
    }

    if (char === quote) {
      quote = undefined
      continue
    }

    if (/\s/.test(char) && !quote) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (escaping) current += '\\'
  if (quote) throw new Error(`Input "version-command" has an unterminated ${quote} quote.`)
  if (current) args.push(current)
  return args
}

function parseBooleanInput(raw: string): boolean {
  if (/^true$/i.test(raw)) return true
  if (/^false$/i.test(raw)) return false
  throw new Error('Input "save-on-default-branch-only" must be "true" or "false".')
}
