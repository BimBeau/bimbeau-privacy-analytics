# Release process

## Scope

This document describes the BimBeau Privacy Analytics release flow from merged pull request to tag publication, GitHub Release metadata publication, and Freemius delivery.

## Workflows and responsibilities

### `Bump version` (`.github/workflows/version-bump.yml`)

Role: semantic version resolution, synchronized version file update, commit, and tag publication.

Behavior:
- Runs on merged same-repository pull requests (`pull_request_target: closed`) and manual `workflow_dispatch`.
- Manual runs must start from a branch ref.
- Uses Node.js 20 before executing Node scripts.
- Validates release-scope label compatibility.
- Applies semver mapping:
  - `breaking-change` -> `major`
  - `feature` -> `minor`
  - `fix` -> `patch`
- Uses `patch` when no mapped version label is present.
- Detects pre-bumped PRs and runs synchronization instead of a second bump when version files already changed in the merged PR.
- Commits version changes when needed, pushes commit first, then creates/pushes tag `v<package.json version>`.

### `Release and deploy to Freemius` (`.github/workflows/deploy-freemius.yml`)

Role: GitHub Release metadata publication and Freemius deployment in one workflow.

Behavior:
- Runs on tag pushes matching `v*.*.*` and manual `workflow_dispatch`.
- Manual dispatch accepts one input: `release_mode` (`pending` or `beta`).
- Resolves release context via `scripts/release-context.js`.
- Validates synchronized version sources with `node scripts/sync-version-sources.js --check`.
- Creates or updates GitHub Release metadata on tag-triggered runs before Freemius deploy steps.
- Checks out repository state via Git CLI in the self-hosted workspace.
- Verifies runner tools and required PHP extensions.
- Validates Freemius configuration before install/build work.
- Prepares pinned Freemius SDK from one pinned commit fetch.
- Verifies Freemius version uniqueness before `npm ci` and before plugin ZIP build/deploy.
- Runs `npm ci --no-audit --fund=false` only after deployability checks pass.
- Builds `dist/bimbeau-privacy-analytics.zip` with `bash bin/build.sh`.
- Deploys through `php scripts/ci/freemius-release.php deploy`.
- Verifies deployed Freemius tag with `php scripts/ci/freemius-release.php verify`.
- Validates generated package archives returned by Freemius:
  - the Free package contains `bimbeau-privacy-analytics/bimbeau-privacy-analytics.php`
  - the premium package contains `bimbeau-privacy-analytics-pro/bimbeau-privacy-analytics.php`, or reports and validates the single top-level root returned by Freemius when it differs
- Publishes extracted package content to branches `bimbeau-privacy-analytics` and `bimbeau-privacy-analytics-pro`.
- Uploads both generated packages to the matching GitHub Release on tag-triggered runs.

## Historical note

The workflow pair `codex-automerge-label.yml` and `release.yml` is not part of the active release pipeline.

## Required secrets and variables

### Secret: `WORKFLOW_TOKEN`

Usage:
- Token for auto-merge CLI operations.
- Token for version-bump checkout/push and tag push operations.
- Token for GitHub Release metadata/asset operations in `deploy-freemius.yml`.

### Freemius credentials

Required by `deploy-freemius.yml`:
- `FREEMIUS_PUBLIC_KEY`
- `FREEMIUS_DEV_ID`
- `FREEMIUS_SECRET_KEY`
- `FREEMIUS_PLUGIN_ID`
- `FREEMIUS_PLUGIN_SLUG`

## End-to-end release flow

1. A pull request is merged to `main`.
2. `version-bump.yml` resolves semver, updates sources when needed, commits, and publishes `vX.Y.Z`.
3. Tag push triggers `deploy-freemius.yml`.
4. `deploy-freemius.yml` updates GitHub Release metadata, deploys to Freemius, validates packages, syncs distribution branches, and uploads release assets.
