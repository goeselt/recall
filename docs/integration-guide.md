# recall -- Integration Guide

- [How It Works](#how-it-works)
- [Cache Lifecycle](#cache-lifecycle)
- [Security Model](#security-model)
- [Troubleshooting](#troubleshooting)

---

## How It Works

The action runs in two phases. The version that makes the cache key unique comes from one of two sources:

**Dynamic (`version-command`)** -- the main step runs before the tool is installed, so the version is unknown. It
restores via a prefix match on `<key-prefix>-`, returning the most recent matching entry. The post step runs after
installation. On a cold run it executes `version-command` and saves under `<key-prefix>-<version>`; on a dynamic restore
hit it skips re-saving to avoid running a command from restored tool-cache contents.

**Static (`version`)** -- the exact key is known up front. The main step restores it exactly (no prefix fallback). The
post step saves the same key after the directory is populated. Use this for directories with multiple or no executables.

The built-in presets (`node`, `python`, `go`) use dynamic mode. The `tool-major` input scopes the key prefix so a Node
22 cache is never restored for a Node 20 workflow.

---

## Cache Lifecycle

Understanding the lifecycle is important for effective use.

**Cold run (first use or after expiry):** no cache exists yet. The action reports `cache-restored: false`, the tool is
downloaded normally by the setup action, and the post step saves the directory to the cache. This only happens on
default-branch events (by default) -- feature branches and PR events skip the save.

**Warm run (subsequent runs):** the action restores the cached directory before the setup action runs. The setup action
detects the tool is already present and skips the download. Static mode skips re-saving when the exact key was restored;
dynamic mode skips re-saving after a prefix restore so the post step does not run `version-command` from restored cache
contents.

**A workflow on the default branch is required to seed the cache.** Include recall in any workflow that runs on push to
the default branch. All PR and branch workflows then share that cache.

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

---

## Security Model

GitHub Actions caches are readable by PRs and feature branches when they can access the base branch cache. Do not put
secrets, credentials or private tokens in the cached directory.

Recall is intended for CI acceleration, not for trusted release isolation. A restored tool cache may contain executable
files. Avoid using restored tool caches in release, signing or publishing workflows unless the workflow remains correct
and safe when the cache is malicious, stale or absent.

Dynamic mode restores by prefix before the final tool version is known. Use `cache-restored` to tell whether something
was restored; use `cache-hit` only when you specifically need an exact key match.

---

## Troubleshooting

**Cache restored but was not saved:** this is usually expected on PRs and feature branches. With the default
`save-on-default-branch-only: true`, PR events can restore existing caches but cannot save new ones. Seed the cache with
a `push`, `schedule` or `workflow_dispatch` run on the repository default branch.

**Cache restored but `cache-hit` is `false`:** dynamic mode restored a prefix match. Keep the setup/install step in the
workflow so it can verify or install the requested version.

**Cache was not saved because the path is missing or empty:** the post step only saves existing non-empty directories.
Check that the setup/install step populated the same `path` configured for recall.

**Dynamic cache was restored but no new cache was saved:** this is intentional. The post step does not run
`version-command` after a dynamic restore because the command could resolve to executable content from the restored
cache. A later cold default-branch run will seed a fresh key when needed.

**Version command failed:** the command runs in the post step, after the setup/install step. Make sure the executable is
available on `PATH` by then.

**Version pattern did not match:** run the command locally or in a workflow step and tune `version-pattern` so the first
capture group is the version you want in the cache key.

**Version is rejected as unsafe:** capture only letters, numbers, dots, underscores and hyphens. For example, capture
`1.2.3` from `v1.2.3+build` instead of the full string.
