# Contributing to Recall

## Maintainer Mental Model

Recall is a two-phase GitHub Action:

1. `src/main.ts` runs before the tool or directory is populated. It resolves inputs, restores the best matching cache
   entry, and stores the resolved configuration in Actions state.
2. `src/post.ts` runs after the workflow steps. It decides whether this run may save, detects the final version when
   needed, and writes the populated directory to the cache.

Keep that split boring. The main step owns input resolution and restore state; the post step owns save decisions and
save diagnostics. `src/state.ts` is the only coupling between the two.

## Core Invariants

- Do not run `version-command` through a shell. Use executable + args so pipes, redirects and shell operators stay
  inert.
- Cache key components must remain small and predictable: letters, numbers, dots, underscores and hyphens.
- PR events restore existing caches by default, but they must not save new caches while `save-on-default-branch-only` is
  `true`.
- User-facing skip reasons matter. If the action does not save, the log should explain whether that is expected and what
  the user can change.
- `cache-hit` means exact key match. `cache-restored` means any restored cache, including dynamic prefix matches.
- Dynamic restore hits must not run `version-command` in the post step; it could resolve to executable content restored
  from the cache.
- Save preflight rejects missing, empty, non-directory and symlinked cache paths.
- `dist/` is part of the action runtime. Any source change that affects `main` or `post` must be followed by
  `npm run build`.

## File Map

| File                    | Responsibility                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `src/main.ts`           | Restore step: resolve config, restore cache, persist state for the post step.      |
| `src/post.ts`           | Save step: apply default-branch gate, detect version, save cache.                  |
| `src/cache-behavior.ts` | Restore output semantics and cache-path save preflight.                            |
| `src/config.ts`         | Resolve action inputs + preset into a validated `Config`; reject ambiguous inputs. |
| `src/validation.ts`     | Input validation and user-facing validation messages.                              |
| `src/presets.ts`        | Preset lookup and `${arch}`/`${major}` template interpolation from `presets.json`. |
| `src/version.ts`        | Pure version extraction from command output via configurable regular expression.   |
| `src/branch.ts`         | Default-branch detection and save gate.                                            |
| `src/state.ts`          | Typed main-to-post state keys (passed via `@actions/core` state API).              |
| `presets.json`          | Preset definitions (data, not code): path template, key-prefix, version-command.   |

## Common Changes

### Add a preset

Update `presets.json`, then add or adjust tests in `src/presets.test.ts` and `src/config.test.ts`. Preset key prefixes
should include OS and architecture unless there is a strong reason not to.

### Change an input

Update `action.yml`, `README.md`, `src/config.ts`, and the config tests together. If the input affects post-step
behaviour, pass the resolved value through `src/state.ts`; do not re-read action inputs in `src/post.ts`.

### Change save policy

Start in `src/branch.ts`. Prefer returning a `SaveDecision` with a useful reason over spreading save-policy log messages
through `src/post.ts`.

### Change cache-hit or save-preflight behaviour

Start in `src/cache-behavior.ts`. Keep the helpers pure where possible, then use `src/main.ts` and `src/post.ts` only to
connect the behaviour to Actions state, outputs and logging.

### Change version detection

Keep `src/version.ts` pure. Command execution belongs in `src/post.ts`; pattern matching belongs in `src/version.ts`;
input safety belongs in `src/validation.ts`.

## Development Setup

Node.js 24 or later (native TypeScript type stripping for `node --test`).

```bash
npm ci
```

## Local Verification

Run these before opening a PR:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

The build step updates `dist/main/index.cjs` and `dist/post/index.cjs`; those files must be committed with runtime
changes.

Optional lint:

```bash
docker pull ghcr.io/goeselt/pedant:latest
docker run --rm -v "$(pwd):/work" ghcr.io/goeselt/pedant:latest --ignore dist/
```

## Test Guide

```bash
# All unit tests
npm test

# Focus areas by file
node --test src/config.test.ts
node --test src/branch.test.ts
node --test src/version.test.ts
node --test src/presets.test.ts
```

The tests double as behavioural documentation. Prefer a clear test name over a clever helper.

## Release Notes

The release workflow builds and commits `dist/`, `package.json`, and `package-lock.json`. Local feature work should
still run `npm run build` so reviewers can see the runtime bundle diff.

## Submitting Changes

Commit messages and PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/). The release
pipeline uses the PR title to determine the next version.
