import { readFileSync } from 'node:fs'
import * as core from '@actions/core'

export interface SaveDecision {
  allowed: boolean
  reason: string
}

// Save policy -----------------------------------------------------------------

/** Decide whether a cache save may proceed, with the user-facing reason for the log. */
export function getSaveDecision(
  saveOnDefaultOnly: boolean,
  currentRef: string,
  defaultBranch: string,
  eventName: string,
): SaveDecision {
  if (!saveOnDefaultOnly) {
    return { allowed: true, reason: 'save-on-default-branch-only is false.' }
  }
  if (eventName === 'pull_request' || eventName === 'pull_request_target') {
    return {
      allowed: false,
      reason:
        `this is a ${eventName} event and "save-on-default-branch-only" is true. ` +
        'PR runs can restore existing caches, but they do not save new caches by default.',
    }
  }
  if (currentRef !== defaultBranch) {
    return {
      allowed: false,
      reason: `ref "${currentRef}" is not the default branch "${defaultBranch}" and "save-on-default-branch-only" is true.`,
    }
  }
  return { allowed: true, reason: `ref "${currentRef}" is the default branch.` }
}

// Event payload ---------------------------------------------------------------

/**
 * Detect the repository default branch from the workflow event payload (GITHUB_EVENT_PATH).
 * Falls back to "main" when detection fails.
 */
export function detectDefaultBranch(eventPath: string | undefined = undefined): string {
  if (eventPath) {
    try {
      const event = JSON.parse(readFileSync(eventPath, 'utf8')) as {
        repository?: { default_branch?: string }
      }
      if (event.repository?.default_branch) {
        return event.repository.default_branch
      }
    } catch {
      // Ignore read/parse errors and fall through to the warning below.
    }
  }
  // A silent fallback hides a real misconfiguration: if the actual default branch is not "main", every
  // gated save is skipped with a confusing "ref X is not the default branch main" reason and the cache
  // never populates. Surface it so the cause is visible without enabling step debugging.
  core.warning(
    'Could not determine the repository default branch from the event payload; assuming "main". ' +
      'If the default branch differs, saves gated by "save-on-default-branch-only" will be skipped. ' +
      'Verify the triggering event provides repository.default_branch, or set "save-on-default-branch-only: false".',
  )
  return 'main'
}
