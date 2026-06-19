import * as core from '@actions/core'
import * as cache from '@actions/cache'
import { execFileSync } from 'node:child_process'
import { getSaveDecision } from './branch.ts'
import { inspectSavePath, shouldSkipDynamicSaveAfterRestore, type RestoreMode } from './cache-behavior.ts'
import { getState, StateKey } from './state.ts'
import { validateCacheKeyComponent } from './validation.ts'
import { extractVersion } from './version.ts'

const VERSION_OUTPUT_LIMIT = 4096

/**
 * Post (save) step. Determines the version (static value or dynamic command),
 * then saves the directory under "<key-prefix>-<version>", gated on the default branch and skipped when the
 * restored entry already matches.
 */
async function run(): Promise<void> {
  const path = getState(StateKey.Path)
  const keyPrefix = getState(StateKey.KeyPrefix)
  const staticVersion = getState(StateKey.StaticVersion)
  const versionCommandRaw = getState(StateKey.VersionCommand)
  const versionPattern = getState(StateKey.VersionPattern)
  const saveOnDefaultOnly = getState(StateKey.SaveOnDefaultOnly)
  const restoredKey = getState(StateKey.RestoredKey)
  const restoreMode = getRestoreMode(staticVersion, getState(StateKey.RestoreMode))
  const defaultBranch = getState(StateKey.DefaultBranch)
  const currentRef = getState(StateKey.CurrentRef)
  const eventName = getState(StateKey.EventName)

  if (!path || !keyPrefix || (!staticVersion && !versionCommandRaw)) {
    core.info(
      'Skipping cache save -- missing restore-step state. Make sure the main step completed before the post step.',
    )
    return
  }

  if (saveOnDefaultOnly === 'true' && (!defaultBranch || !currentRef)) {
    core.warning('Skipping cache save -- missing branch state from the restore step.')
    return
  }

  const saveDecision = getSaveDecision(saveOnDefaultOnly === 'true', currentRef, defaultBranch, eventName)
  if (!saveDecision.allowed) {
    core.info(`Skipping cache save -- ${saveDecision.reason}`)
    return
  }

  if (shouldSkipDynamicSaveAfterRestore(restoreMode, restoredKey)) {
    core.info(
      `Skipping cache save -- dynamic cache was restored from key "${restoredKey}". ` +
        'Not running version-command against restored tool cache contents.',
    )
    return
  }

  const version = staticVersion || detectVersion(versionCommandRaw, versionPattern)
  if (!version) return
  try {
    validateCacheKeyComponent('version', version)
  } catch (error) {
    core.warning(
      `${error instanceof Error ? error.message : String(error)} The value was "${sanitizeForLog(version)}". ` +
        'Adjust "version-pattern" to capture only a cache-key-safe version. Skipping cache save.',
    )
    return
  }

  const saveKey = `${keyPrefix}-${version}`
  if (restoredKey === saveKey) {
    core.info(`Cache is already up-to-date (key: ${saveKey}).`)
    return
  }

  const savePath = inspectSavePath(path)
  if (!savePath.canSave) {
    core.warning(`Skipping cache save -- ${savePath.reason}`)
    return
  }

  core.info(`Saving cache with key: ${saveKey}`)
  try {
    await cache.saveCache([path], saveKey)
    core.info('Cache saved successfully.')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Unable to reserve cache')) {
      core.info(`Cache key "${saveKey}" is already being saved by another job -- skipping.`)
    } else {
      core.warning(`Cache save failed: ${message}`)
    }
  }
}

/** Run the version command and extract the version, or return null (reason already logged). */
function getRestoreMode(staticVersion: string, rawMode: string): RestoreMode {
  if (rawMode === 'static' || rawMode === 'dynamic') return rawMode
  return staticVersion ? 'static' : 'dynamic'
}

function detectVersion(versionCommandRaw: string, versionPattern: string): string | null {
  const versionCommand = JSON.parse(versionCommandRaw) as string[]
  const [executable, ...args] = versionCommand
  if (!executable) {
    core.warning('Version command is empty -- skipping cache save.')
    return null
  }
  let rawOutput: string
  try {
    rawOutput = execFileSync(executable, args, {
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    }).trim()
  } catch (error) {
    core.warning(
      `Version command failed (${formatCommand(versionCommand)}): ${sanitizeForLog(error instanceof Error ? error.message : String(error))} -- skipping cache save.`,
    )
    return null
  }

  if (rawOutput.length > VERSION_OUTPUT_LIMIT) {
    core.warning(`Version command output exceeded ${VERSION_OUTPUT_LIMIT} characters -- skipping cache save.`)
    return null
  }

  const version = extractVersion(rawOutput, versionPattern)
  if (!version) {
    core.warning(
      `Version pattern /${sanitizeForLog(versionPattern)}/ did not match output "${sanitizeForLog(rawOutput)}" -- skipping cache save.`,
    )
    return null
  }
  return version
}

function formatCommand(command: string[]): string {
  return command.map(sanitizeForLog).join(' ')
}

function sanitizeForLog(value: string): string {
  const sanitized = value.replace(/[\r\n]/g, ' ').replace(/[^\S ]+/g, ' ')
  if (sanitized.length <= 300) return sanitized
  return `${sanitized.slice(0, 300)}...`
}

run().catch((error: unknown) => {
  core.warning(`Cache post step failed: ${error instanceof Error ? error.message : String(error)}`)
})
