import * as core from '@actions/core'
import * as cache from '@actions/cache'
import { detectDefaultBranch } from './branch.ts'
import { getRestoreOutputs, type RestoreMode } from './cache-behavior.ts'
import { resolveConfig } from './config.ts'
import { saveState, StateKey } from './state.ts'

/**
 * Main (restore) step. Persists the resolved configuration for the post step and restores the cache.
 * Static mode restores an exact key; dynamic mode -- where the version is not yet known --
 * restores the most recent entry under the key prefix.
 */
async function run(): Promise<void> {
  const config = resolveConfig(process.env)

  saveState(StateKey.Path, config.path)
  saveState(StateKey.KeyPrefix, config.keyPrefix)
  saveState(StateKey.SaveOnDefaultOnly, String(config.saveOnDefaultOnly))
  saveState(StateKey.DefaultBranch, detectDefaultBranch(process.env.GITHUB_EVENT_PATH))
  saveState(StateKey.CurrentRef, process.env.GITHUB_REF_NAME ?? '')
  saveState(StateKey.EventName, process.env.GITHUB_EVENT_NAME ?? '')

  let restoredKey: string | undefined
  let restoreMode: RestoreMode

  if (config.staticVersion) {
    // The exact key is known up front, so restore it exactly.
    // No prefix fallback: a different version's directory would be the wrong content for a declared identity.
    const key = `${config.keyPrefix}-${config.staticVersion}`
    saveState(StateKey.StaticVersion, config.staticVersion)
    core.info(`Restoring cache for "${config.path}" with exact key "${key}"`)
    restoredKey = await cache.restoreCache([config.path], key)
    restoreMode = 'static'
  } else {
    // The version is unknown until the tool is installed, so restore the most recent entry under the prefix.
    // The primary key equals the prefix and never matches a versioned entry exactly,
    // forcing the prefix (restore-keys) match.
    const prefix = `${config.keyPrefix}-`
    saveState(StateKey.VersionCommand, JSON.stringify(config.versionCommand))
    saveState(StateKey.VersionPattern, config.versionPattern)
    core.info(`Restoring cache for "${config.path}" via prefix "${prefix}"`)
    restoredKey = await cache.restoreCache([config.path], prefix, [prefix])
    restoreMode = 'dynamic'
  }

  saveState(StateKey.RestoreMode, restoreMode)
  const outputs = getRestoreOutputs(restoreMode, restoredKey)
  core.setOutput('cache-hit', outputs.cacheHit)
  core.setOutput('cache-restored', outputs.cacheRestored)
  core.setOutput('cache-key', outputs.cacheKey)

  if (restoredKey) {
    core.info(`Cache restored from key: ${restoredKey}`)
    if (restoreMode === 'dynamic') {
      core.info('Dynamic mode restored by prefix; cache-hit is false until the post step verifies the final version.')
    }
    saveState(StateKey.RestoredKey, restoredKey)
  } else {
    core.info('No cache found -- the directory will be populated fresh.')
  }
}

run().catch((error: unknown) => {
  core.setFailed(`Cache restore failed: ${error instanceof Error ? error.message : String(error)}`)
})
