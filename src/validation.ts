import { posix, win32 } from 'node:path'

const SAFE_KEY_COMPONENT = /^[A-Za-z0-9_.-]+$/
const NESTED_QUANTIFIER = /\((?:\\.|[^()\\])*[+*{](?:\\.|[^()\\])*\)\s*[+*{]/

export function validateCachePath(value: string, runnerOs: string | undefined): void {
  const pathApi = isWindows(runnerOs) ? win32 : posix
  if (!pathApi.isAbsolute(value)) {
    throw new Error(
      'Input "path" must be an absolute path. ' +
        'Use a value like "${{ github.workspace }}/vendor" instead of "./vendor".',
    )
  }

  const normalized = pathApi.normalize(value)
  const { root } = pathApi.parse(normalized)
  if (trimTrailingSeparators(normalized, runnerOs) === trimTrailingSeparators(root, runnerOs)) {
    throw new Error('Input "path" must not be a filesystem root. Choose the specific tool or data directory to cache.')
  }
}

export function validateCacheKeyComponent(name: string, value: string, maxLength = 128): void {
  if (value.length > maxLength) {
    throw new Error(
      `Input "${name}" must be ${maxLength} characters or fewer. Shorten the value before using it in a cache key.`,
    )
  }
  if (!SAFE_KEY_COMPONENT.test(value)) {
    throw new Error(
      `Input "${name}" may only contain letters, numbers, dots, underscores and hyphens. Example: "node-22-linux-x64".`,
    )
  }
}

export function validateVersionPattern(value: string): void {
  if (value.length > 200) {
    throw new Error(
      'Input "version-pattern" must be 200 characters or fewer. Use a small capture pattern for the version only.',
    )
  }
  if (/[\r\n]/.test(value)) {
    throw new Error('Input "version-pattern" must not contain line breaks. Put the regular expression on one line.')
  }
  if (NESTED_QUANTIFIER.test(value)) {
    throw new Error(
      'Input "version-pattern" contains a nested quantifier and may be unsafe. ' +
        'Use a simple pattern such as "(\\d+\\.\\d+\\.\\d+)".',
    )
  }
}

export function isRiskyWholeDirectory(
  value: string,
  candidate: string | undefined,
  runnerOs: string | undefined,
): boolean {
  if (!candidate) return false
  const pathApi = isWindows(runnerOs) ? win32 : posix
  return (
    normalizeForCompare(pathApi.normalize(value), runnerOs) ===
    normalizeForCompare(pathApi.normalize(candidate), runnerOs)
  )
}

function isWindows(runnerOs: string | undefined): boolean {
  return /^windows$/i.test(runnerOs ?? '')
}

function trimTrailingSeparators(value: string, runnerOs: string | undefined): string {
  const trimmed = value.replace(/[\\/]+$/, '')
  if (trimmed) return normalizeForCompare(trimmed, runnerOs)
  return normalizeForCompare(value, runnerOs)
}

function normalizeForCompare(value: string, runnerOs: string | undefined): string {
  return isWindows(runnerOs) ? value.toLowerCase() : value
}
