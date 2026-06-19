import * as core from '@actions/core'

/**
 * Typed keys for the state passed from the main step to the post step.
 * Centralising them here prevents the stringly-typed drift that is easy to introduce across two entry points.
 */
export const StateKey = {
  Path: 'path',
  KeyPrefix: 'key-prefix',
  StaticVersion: 'static-version',
  VersionCommand: 'version-command',
  VersionPattern: 'version-pattern',
  SaveOnDefaultOnly: 'save-on-default-branch-only',
  RestoredKey: 'restored-key',
  RestoreMode: 'restore-mode',
  DefaultBranch: 'default-branch',
  CurrentRef: 'current-ref',
  EventName: 'event-name',
} as const

export type StateKey = (typeof StateKey)[keyof typeof StateKey]

export function saveState(key: StateKey, value: string): void {
  core.saveState(key, value)
}

export function getState(key: StateKey): string {
  return core.getState(key)
}
