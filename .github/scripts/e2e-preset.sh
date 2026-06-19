#!/usr/bin/env bash
# E2E helper: verify recall presets save and restore the real tool directory on a runner.
#
# Subcommands:
#   path   <tool>           Print the preset cache path (RUNNER_TOOL_CACHE interpolated).
#   prefix <tool> [major]   Print the preset key-prefix (os/arch/major interpolated, mirrors src/presets.ts).
#   stamp  <tool> <marker>  Write a marker file into the preset path; fails if the path does not exist.
#   assert <tool> <marker> <cache-restored>
#                           Verify the cache was restored and the stamped marker round-tripped.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly REPO_ROOT
readonly PRESETS="${REPO_ROOT}/presets.json"
readonly MARKER_FILE=".recall-e2e-marker"

die() {
    printf '::error::%s\n' "$*" >&2
    exit 1
}

require_presets() {
    [[ -f "$PRESETS" ]] || die "presets.json not found at $PRESETS"
    command -v node >/dev/null 2>&1 || die "node is required but not on PATH"
}

resolve_path() {
    local tool="$1"
    require_presets
    [[ -n "${RUNNER_TOOL_CACHE:-}" ]] || die "RUNNER_TOOL_CACHE is not set"
    # shellcheck disable=SC2016 # $-expressions are JavaScript evaluated by node, not shell
    node -e '
    const fs = require("node:fs");
    const [file, tool] = process.argv.slice(1);
    const preset = JSON.parse(fs.readFileSync(file, "utf8"))[tool];
    if (!preset) { console.error(`unknown preset "${tool}"`); process.exit(1); }
    process.stdout.write(preset.path.replace(/\$\{RUNNER_TOOL_CACHE\}/g, process.env.RUNNER_TOOL_CACHE));
    ' "$PRESETS" "$tool"
}

resolve_prefix() {
    local tool="$1" major="${2:-}"
    require_presets
    # shellcheck disable=SC2016 # $-expressions are JavaScript evaluated by node, not shell
    MAJOR="$major" node -e '
    const fs = require("node:fs");
    const [file, tool] = process.argv.slice(1);
    const preset = JSON.parse(fs.readFileSync(file, "utf8"))[tool];
    if (!preset) { console.error(`unknown preset "${tool}"`); process.exit(1); }
    const map = {
        major: process.env.MAJOR || "",
        os: (process.env.RUNNER_OS || "Linux").toLowerCase(),
        arch: (process.env.RUNNER_ARCH || "X64").toLowerCase(),
    };
    const out = preset["key-prefix"]
        .replace(/\$\{(\w+)\}/g, (_, k) => (k in map ? map[k] : ""))
        .replace(/-{2,}/g, "-")
        .replace(/-$/, "");
    process.stdout.write(out);
    ' "$PRESETS" "$tool"
}

cmd_path() {
    [[ $# -eq 1 ]] || die "usage: path <tool>"
    resolve_path "$1"
    printf '\n'
}

cmd_prefix() {
    [[ $# -ge 1 ]] || die "usage: prefix <tool> [major]"
    resolve_prefix "$1" "${2:-}"
    printf '\n'
}

cmd_stamp() {
    [[ $# -eq 2 ]] || die "usage: stamp <tool> <marker>"
    local tool="$1" marker="$2" path
    path="$(resolve_path "$tool")"
    [[ -d "$path" ]] || die "preset path \"$path\" does not exist -- the setup step must populate it before stamping"
    printf '%s\n' "$marker" >"${path}/${MARKER_FILE}"
    printf 'stamped %s (marker=%s)\n' "$path" "$marker"
}

cmd_assert() {
    [[ $# -eq 3 ]] || die "usage: assert <tool> <expected-marker> <cache-restored>"
    local tool="$1" expected="$2" restored="$3" path actual
    [[ "$restored" == "true" ]] || die "expected cache-restored=true, got \"$restored\""
    path="$(resolve_path "$tool")"
    [[ -f "${path}/${MARKER_FILE}" ]] || die "marker missing at ${path}/${MARKER_FILE} -- recall did not restore the saved directory"
    actual="$(<"${path}/${MARKER_FILE}")"
    [[ "$actual" == "$expected" ]] || die "marker mismatch: expected \"$expected\", got \"$actual\""
    printf 'verified restore of %s (marker=%s)\n' "$path" "$expected"
}

main() {
    local cmd="${1:-}"
    [[ $# -ge 1 ]] && shift || true
    case "$cmd" in
    path) cmd_path "$@" ;;
    prefix) cmd_prefix "$@" ;;
    stamp) cmd_stamp "$@" ;;
    assert) cmd_assert "$@" ;;
    *) die "usage: $(basename "$0") {path|prefix|stamp|assert} ..." ;;
    esac
}

main "$@"
