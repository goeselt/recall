import { lstatSync, readdirSync } from 'node:fs'

export type RestoreMode = 'static' | 'dynamic'

export interface RestoreOutputs {
  cacheHit: 'true' | 'false'
  cacheRestored: 'true' | 'false'
  cacheKey: string
}

export interface SavePathInspection {
  canSave: boolean
  reason: string
}

// Restore outputs ------------------------------------------------------------

/**
 * Match actions/cache semantics: cache-hit means an exact key hit. Dynamic restores use a prefix before
 * the final version is known, so they can restore files without proving that the final cache key is exact.
 */
export function getRestoreOutputs(mode: RestoreMode, restoredKey: string | undefined): RestoreOutputs {
  const restored = Boolean(restoredKey)
  return {
    cacheHit: mode === 'static' && restored ? 'true' : 'false',
    cacheRestored: restored ? 'true' : 'false',
    cacheKey: restoredKey ?? '',
  }
}

/**
 * Dynamic mode normally runs version-command in the post step. If a dynamic cache was restored, that command may resolve
 * to an executable from the restored cache, so skip re-saving instead of executing potentially cached code.
 */
export function shouldSkipDynamicSaveAfterRestore(mode: RestoreMode, restoredKey: string): boolean {
  return mode === 'dynamic' && Boolean(restoredKey)
}

// Save preflight -------------------------------------------------------------

/** Validate the resolved cache directory before spending time reserving/uploading a cache. */
export function inspectSavePath(path: string): SavePathInspection {
  let stat
  try {
    stat = lstatSync(path)
  } catch {
    return {
      canSave: false,
      reason: `configured cache path "${path}" does not exist. Check whether the setup/install step populated the expected directory.`,
    }
  }

  if (stat.isSymbolicLink()) {
    return {
      canSave: false,
      reason: `configured cache path "${path}" is a symbolic link. Use the real tool directory instead.`,
    }
  }

  if (!stat.isDirectory()) {
    return {
      canSave: false,
      reason: `configured cache path "${path}" is not a directory.`,
    }
  }

  try {
    if (readdirSync(path).length === 0) {
      return {
        canSave: false,
        reason: `configured cache path "${path}" is empty. Check whether the tool was installed into this directory.`,
      }
    }
  } catch (error) {
    return {
      canSave: false,
      reason: `configured cache path "${path}" could not be read: ${error instanceof Error ? error.message : String(error)}.`,
    }
  }

  return {
    canSave: true,
    reason: `configured cache path "${path}" exists and contains files.`,
  }
}
