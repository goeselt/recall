# recall

Action to cache a tool directory in one step -- restore before installation, save after, gated to the default branch.
Replaces the duplicated `actions/cache/restore` + `actions/cache/save` boilerplate with built-in presets for Node.js,
Python and Go.

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

## Key Behaviours

- **Default-branch gate** -- saves only on default-branch events such as `push`, `schedule` and `workflow_dispatch`.
  Feature branches and PR events restore existing caches but do not save new ones by default.
- **Idempotent** -- skips save when the restored key already matches.
- **Exact-hit output** -- `cache-hit` only means an exact key match; `cache-restored` tells you whether any cache was
  restored, including dynamic prefix matches.
- **Parallel-safe** -- handles concurrent `Unable to reserve cache` gracefully.
- **Arch-aware keys** -- presets include `${arch}` so an x64 cache is never restored on arm64.

For how the two-phase restore/save model works and how to seed the cache correctly, see the
[Integration Guide](docs/integration-guide.md).

## Usage

### Preset Mode (Dynamic)

Built-in presets: `node`, `python`, `go`.

```yaml
- uses: goeselt/recall@v1
  with:
    tool: node
    tool-major: '22'
```

> [!NOTE]
>
> There is no `codeql` preset. GitHub-hosted runners ship the CodeQL CLI pre-installed (the "CodeQL Action Bundle", see
> the [runner image manifest](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)),
> so it does not need caching. On a self-hosted runner, cache it with [explicit mode](#explicit-mode-dynamic) and make
> sure `codeql` is on `PATH` for the post step.

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

## Inputs

| Input                         | Required        | Default           | Description                                                    |
| ----------------------------- | --------------- | ----------------- | -------------------------------------------------------------- |
| `tool`                        | No              | --                | Preset name (`node`, `python`, `go`)                           |
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

## Outputs

| Output           | Description                                                          |
| ---------------- | -------------------------------------------------------------------- |
| `cache-hit`      | `true` only for an exact cache key restore                           |
| `cache-restored` | `true` when any cache was restored, including a dynamic prefix match |
| `cache-key`      | The restored cache key (empty on miss)                               |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [LICENSE](LICENSE).
