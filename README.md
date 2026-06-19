# recall

Action to cache a tool directory in one step -- restore before installation, save after, gated to the default branch.
Replaces the duplicated `actions/cache/restore` + `actions/cache/save` boilerplate with built-in presets for Node.js,
Python, Go, and CodeQL.

> [!NOTE]
>
> Experimental and under active development.

## Quick Start

```yaml
- name: Cache Node.js
  uses: goeselt/recall@v1
  with:
    tool: node
    tool-major: '22'

- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: 22
```

No explicit save step is needed -- the post step detects the installed version and saves the cache automatically.

## How It Works

The action runs in two phases. The version that makes the cache key unique comes from one of two sources:

- **Dynamic** (`version-command`) -- the main step runs **before** the tool is installed, so the version is unknown. It
  restores via a prefix match on `<key-prefix>-`, returning the most recent matching entry. The post step runs **after**
  installation. On a cold run it executes `version-command` and saves under `<key-prefix>-<version>`; on a dynamic
  restore hit it skips re-saving to avoid running a command from restored tool-cache contents.
- **Static** (`version`) -- the exact key is known up front. The main step restores it exactly (no prefix fallback). The
  post step saves the same key after the directory is populated. Use this for directories with multiple or no
  executables.

Key behaviours:

- **Default-branch gate** -- saves only on default-branch events such as `push`, `schedule` and `workflow_dispatch`.
  Feature branches and PR events restore existing caches but do not save new ones by default.
- **Idempotent** -- skips save when the restored key already matches.
- **Exact-hit output** -- `cache-hit` only means an exact key match; `cache-restored` tells you whether any cache was
  restored, including dynamic prefix matches.
- **Parallel-safe** -- handles concurrent `Unable to reserve cache` gracefully.
- **Arch-aware keys** -- presets include `${arch}` so an x64 cache is never restored on arm64.

## Cache Lifecycle

Understanding the lifecycle is important for effective use.

**Cold run (first use or after expiry):** no cache exists yet. The action reports `cache-restored: false`, the tool is
downloaded normally by the setup action, and the post step saves the directory to the cache. This only happens on
default-branch events (by default) -- feature branches and PR events skip the save.

**Warm run (subsequent runs):** the action restores the cached directory before the setup action runs. The setup action
detects the tool is already present and skips the download. Static mode skips re-saving when the exact key was restored;
dynamic mode skips re-saving after a prefix restore so the post step does not run `version-command` from restored cache
contents.

**Implication -- a workflow on the default branch is required to seed the cache.** Include this action in any workflow
that runs on push to the default branch. All PR and branch workflows then share that cache.

```yaml
# .github/workflows/ci.yml
on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    steps:
      - uses: goeselt/recall@v1
        with:
          tool: node
          tool-major: '22'

      - uses: actions/setup-node@v4
        with:
          node-version: 22
```

The first push to `main` seeds the cache. All subsequent runs -- on `main` and all PRs -- restore from it.

> [!NOTE]
>
> GitHub evicts cache entries that have not been accessed for 7 days. A workflow on a regular push or cron schedule
> keeps the cache warm. If the cache is evicted, the next default-branch run rebuilds it automatically.

## Usage

### Preset Mode (Dynamic)

Built-in presets: `node`, `codeql`, `python`, `go`.

```yaml
- uses: goeselt/recall@v1
  with:
    tool: node
    tool-major: '22'
```

> [!NOTE]
>
> The `codeql` preset detects the version with `codeql version`. `github/codeql-action/init` installs the CLI into the
> tool cache but does not add it to `PATH`, so the post step can only detect the version if `codeql` is on `PATH`. Add
> it after init, or the save is skipped.

### Explicit Mode (Dynamic)

For a tool without a preset, detect the version with a command:

```yaml
- uses: goeselt/recall@v1
  with:
    path: ${{ runner.tool_cache }}/MyTool
    key-prefix: mytool-${{ runner.os }}-${{ runner.arch }}
    version-command: mytool --version
    version-pattern: '(\d+\.\d+\.\d+)'
```

The captured version must be safe to use in a cache key: letters, numbers, dots, underscores and hyphens only. If a tool
prints metadata such as `v1.2.3+build`, adjust `version-pattern` so it captures only the stable version segment.

### Static Version Mode

For an arbitrary directory with no single tool to query, supply the version directly:

```yaml
- uses: goeselt/recall@v1
  with:
    path: ${{ github.workspace }}/vendor
    key-prefix: vendor-${{ runner.os }}-${{ runner.arch }}
    version: ${{ hashFiles('go.sum') }}
```

> [!WARNING]
>
> In static mode you must change `version` whenever the cached content changes, otherwise a stale cache is restored.

### Inputs

| Input                         | Required        | Default           | Description                                                    |
| ----------------------------- | --------------- | ----------------- | -------------------------------------------------------------- |
| `tool`                        | No              | --                | Preset name (`node`, `codeql`, `python`, `go`)                 |
| `tool-major`                  | No              | --                | Major release for preset key-prefix scoping (preset mode only) |
| `path`                        | Unless `tool`   | --                | Absolute directory to cache (overrides preset)                 |
| `key-prefix`                  | Unless `tool`   | --                | Cache key prefix without trailing dash (overrides preset)      |
| `version`                     | One version     | --                | Static version appended to the key. Excludes `version-command` |
| `version-command`             | source required | --                | Command that prints the version. Excludes `version`            |
| `version-pattern`             | No              | `(\d+\.\d+\.\d+)` | Regular expression to extract the version (dynamic mode only)  |
| `save-on-default-branch-only` | No              | `true`            | Save only on default-branch `push`/`schedule`-style events     |

`path` must be absolute and must not be a filesystem root. Cache key components (`tool-major`, `key-prefix` and
`version`) may contain only letters, numbers, dots, underscores and hyphens. Dynamic versions extracted from
`version-command` output follow the same rule before a cache is saved. The post step saves only existing, non-empty
directories and rejects symbolic links.

### Security Model

GitHub Actions caches are readable by PRs and feature branches when they can access the base branch cache. Do not put
secrets, credentials or private tokens in the cached directory.

Recall is intended for CI acceleration, not for trusted release isolation. A restored tool cache may contain executable
files. Avoid using restored tool caches in release, signing or publishing workflows unless the workflow remains correct
and safe when the cache is malicious, stale or absent.

Dynamic mode restores by prefix before the final tool version is known. Use `cache-restored` to tell whether something
was restored; use `cache-hit` only when you specifically need an exact key match.

### Troubleshooting

**Cache restored but was not saved:** this is usually expected on PRs and feature branches. With the default
`save-on-default-branch-only: true`, PR events can restore existing caches but cannot save new ones. Seed the cache with
a `push`, `schedule` or `workflow_dispatch` run on the repository default branch.

**Cache restored but `cache-hit` is `false`:** dynamic mode restored a prefix match. Keep the setup/install step in the
workflow so it can verify or install the requested version.

**Cache was not saved because the path is missing or empty:** the post step only saves existing non-empty directories.
Check that the setup/install step populated the same `path` configured for Recall.

**Dynamic cache was restored but no new cache was saved:** this is intentional. The post step does not run
`version-command` after a dynamic restore because the command could resolve to executable content from the restored
cache. A later cold default-branch run will seed a fresh key when needed.

**Version command failed:** the command runs in the post step, after the setup/install step. Make sure the executable is
available on `PATH` by then. For CodeQL, `github/codeql-action/init` installs the CLI but does not add it to `PATH`.

**Version pattern did not match:** run the command locally or in a workflow step and tune `version-pattern` so the first
capture group is the version you want in the cache key.

**Version is rejected as unsafe:** capture only letters, numbers, dots, underscores and hyphens. For example, capture
`1.2.3` from `v1.2.3+build` instead of the full string.

### Outputs

| Output           | Description                                                          |
| ---------------- | -------------------------------------------------------------------- |
| `cache-hit`      | `true` only for an exact cache key restore                           |
| `cache-restored` | `true` when any cache was restored, including a dynamic prefix match |
| `cache-key`      | The restored cache key (empty on miss)                               |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [LICENSE](LICENSE).
