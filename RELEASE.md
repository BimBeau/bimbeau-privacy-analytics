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
- Only stable `X.Y.Z` versions can be released. `scripts/release-context.js` accepts `X.Y.Z-beta.N` and `X.Y.Z-rc.N`, but `scripts/sync-version-sources.js`, `scripts/bump-version.js` (including the readme `Stable tag`) and `scripts/verify-plugin-zip-entrypoint.js` reject pre-release versions, so a pre-release version or tag stops the workflow at "Validate synchronized version sources". A manual dispatch with `release_mode=beta` publishes the current stable version number to Freemius in beta mode, while its Git tag and the readme `Stable tag` still present that version as stable.
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
- Deploys through `php scripts/ci/freemius-release.php deploy`. When a tag creation attempt returns a transient or empty response, the script lists the Freemius tags before uploading again and reuses a tag that already carries the release version, so a lost response does not create a duplicate tag. A failed package download stops the job with the download error instead of an empty ZIP.
- Verifies deployed Freemius tag with `php scripts/ci/freemius-release.php verify`.
- Validates generated package archives returned by Freemius:
  - the Free package contains `bimbeau-privacy-analytics/bimbeau-privacy-analytics.php`
  - the premium package contains `bimbeau-privacy-analytics-pro/bimbeau-privacy-analytics.php`, or reports and validates the single top-level root returned by Freemius when it differs
- Publishes extracted package content to branches `bimbeau-privacy-analytics` and `bimbeau-privacy-analytics-pro`.
- Uploads both generated packages to the matching GitHub Release on tag-triggered runs.

## The public note of a release is written in English

The version workflow copies the title of the merged pull request into `CHANGELOG.md`, and `sync-readme-changelog.js` copies that entry into the `== Changelog ==` and `== Upgrade Notice ==` sections of `readme.txt`. Those two sections are the listing and the update screen of every site running the Free plugin, and they are in English. This repository is worked in French, so a French pull request title reaches them unless it is rewritten.

`check-wordpress-readme.js` refuses a public note that reads as French, and names the words it counted. Text between quotes or backticks is left out, so an English note may quote a French page title or setting label.

When the check fails on a release:

1. Rewrite the entry of that version in `CHANGELOG.md`, in plain English, for someone who runs the plugin and is deciding whether to update.
2. Run `npm run changelog:sync -- --sync-current`. It rewrites both sections. A note already written by hand for the current Stable tag is kept.

Giving the pull request an English title avoids the rewrite altogether.

## WordPress.org listing assets

`.wordpress-org/assets/` mirrors the `assets/` directory of the plugin's Subversion repository on WordPress.org. It is not part of any package: nothing in it reaches the plugin zip, and a change there only shows on the listing once the file is committed to Subversion.

That mirror has to stay **flat**: BB Release Manager refuses to sync the assets of a plugin whose GitHub assets folder holds a sub-directory (« Le dossier assets GitHub doit etre plat. »). Anything WordPress.org expects in a sub-directory of `assets/` therefore lives next to the mirror instead, not inside it.

`.wordpress-org/blueprints/blueprint.json` drives the **Live Preview** button of the listing. WordPress.org reads it at `assets/blueprints/blueprint.json` in Subversion, boots a WordPress Playground sandbox with it, and opens the plugin on its Statistics screen. Two manual steps are needed, in this order:

1. Commit `.wordpress-org/blueprints/blueprint.json` to `assets/blueprints/blueprint.json` in Subversion, or let BB Release Manager 1.6.1 and later publish it: the path is set per plugin in its settings.

`blueprint.json` is **generated** and should not be edited by hand. Its two sources sit beside it:

- `blueprint.src.json` — the blueprint itself, with a `@@DEMO_DATA_PHP@@` placeholder.
- `demo-data.php` — the sample month of traffic the preview shows.

Run `npm run blueprint:build` after changing either, and commit the result. `npm run check:blueprint` fails when the committed file is out of date, and is part of `npm run check:wordpress-org-listing`.

The preview boots an empty WordPress, so without that file every report would read zero and a visitor would see the interface with none of its figures. The demo writes directly into the analytics tables, which is why `scripts/__tests__/playground-demo-data.test.js` checks every table and column it names against `db/schema.php`: a schema change that the demo does not follow fails in CI instead of on a visitor. The demo is a throwaway sandbox and never ships inside the plugin package.
2. On <https://wordpress.org/plugins/bimbeau-privacy-analytics/advanced/>, under **Toggle Live Preview**, set the preview to public. Until then the button is shown to committers only, and the page says the blueprint is missing or invalid.

The preview must show the Free plugin as WordPress.org ships it. Never set up a sandbox where Pro features look available.

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
