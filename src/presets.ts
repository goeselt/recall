import presetData from '../presets.json' with { type: 'json' }

/** A fully resolved preset with all placeholders interpolated. */
export interface Preset {
  path: string
  keyPrefix: string
  versionCommand: string[]
  versionPattern: string
}

/** Runtime values interpolated into preset templates. */
export interface PresetVars {
  toolCachePath: string
  os: string
  arch: string
  major: string
}

interface RawPreset {
  path: string
  'key-prefix': string
  'version-command': string[]
  'version-pattern': string
}

const presets = presetData as Record<string, RawPreset>

/**
 * Resolve a preset by name and interpolate runtime variables into its templates.
 *
 * @throws If the preset name is unknown or a template references an undefined variable.
 */
export function resolvePreset(tool: string, vars: PresetVars): Preset {
  const raw = presets[tool]
  if (!raw) {
    const available = Object.keys(presets).join(', ')
    throw new Error(
      `Unknown tool preset "${tool}". Available presets: ${available}. ` +
        'Use one of these or switch to explicit mode (set "path", "key-prefix" and a version source).',
    )
  }

  const map: Record<string, string> = {
    RUNNER_TOOL_CACHE: vars.toolCachePath,
    os: vars.os,
    arch: vars.arch,
    major: vars.major,
  }

  return {
    path: interpolate(raw.path, map),
    keyPrefix: interpolate(raw['key-prefix'], map),
    versionCommand: raw['version-command'],
    versionPattern: raw['version-pattern'],
  }
}

/**
 * Replace ${VAR} placeholders with values from the map.
 * Collapses runs of dashes left by empty values (e.g. an absent major) into a single dash and trims a trailing dash.
 */
function interpolate(template: string, vars: Record<string, string>): string {
  const raw = template.replace(/\$\{([^}]+)\}/g, (_, key: string) => {
    if (!(key in vars)) {
      throw new Error(`Unknown variable "\${${key}}" in preset template`)
    }
    return vars[key] ?? ''
  })
  return raw.replace(/-{2,}/g, '-').replace(/-$/, '')
}
