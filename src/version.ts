/**
 * Extract a version string from raw command output using a regular expression.
 * Returns the first capture group if present, otherwise the full match, or null if the pattern does not match
 * or the pattern is not a valid regular expression.
 */
export function extractVersion(rawOutput: string, versionPattern: string): string | null {
  let re: RegExp
  try {
    re = new RegExp(versionPattern)
  } catch {
    return null
  }
  const match = rawOutput.match(re)
  if (!match) return null
  return match[1] ?? match[0]
}
