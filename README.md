# BimBeau Privacy Analytics

BimBeau Privacy Analytics is a lightweight, privacy-oriented analytics plugin for WordPress.

This repository contains the public Free source code and build tools for BimBeau Privacy Analytics. It is intended to support public review of the Free plugin source and the process used to rebuild generated assets.

The plugin stores analytics locally, avoids third-party analytics scripts, and separates essential aggregate measurement from optional advanced tracking for richer insights.

## Core ideas

- Local WordPress data storage.
- Aggregate-first reporting.
- No stored personal WordPress account identifiers in analytics records.
- Essential and advanced tracker runtimes.
- Consent-manager friendly advanced tracking.

## Tracking model

The essential tracker keeps base analytics available with minimal data collection.

The advanced tracker can add enriched fields such as active time, viewport data, interactions, aggregate geolocation insights, and short-lived technical visit grouping. BimBeau Privacy Analytics does not act as a CMP; when consent is required, the site owner must configure the CMP to block and release the advanced tracker.

## Public source and build instructions

The public Free source repository for BimBeau Privacy Analytics is available at:

<https://github.com/BimBeau/bimbeau-privacy-analytics>

The complete build requires Node.js 24 (the `package.json` engine is `>=24 <25`), npm, PHP, WP-CLI, gettext with `msgmerge`, `msgfmt`, and `msgattrib`, and the Composer development dependencies used by the validation suite. Install the dependencies and rebuild generated assets from the repository root with:

```bash
composer install --no-interaction --prefer-dist --no-progress
npm ci --no-audit --fund=false
npm run build
```

Generate the reproducible WordPress.org Free ZIP with:

```bash
npm run build:wordpress-org-free
```

`webpack.config.js` writes intermediate compiled assets to `build/`; packaging places distributable files under `assets/` in the ZIP. For `BBPA_PACKAGE_TARGET=free`, review-relevant assets map to source and generation steps as follows:

- `assets/js/admin.js` is compiled from the Free entry `src/admin/index.free.js` and its imported modules under `src/admin/`.
- `assets/js/style-admin.js`, `assets/css/style-admin.css`, and the RTL/admin CSS aliases are Webpack outputs of `src/admin/style.free.scss` and its Sass imports. `style-admin.js` is the loader emitted for the style entry, not a hand-authored source file.
- Edition-sensitive imports use the aliases in `webpack.config.js`; Free aliases select human-readable modules under `src/admin/free-stubs/` and exclude Premium implementations from the Free bundle.
- `assets/js/bbpa-essential-tracker.js` and `assets/js/bbpa-advanced-tracker.js` are human-readable public source files. `scripts/build-plugin-dist.sh` stages them and `scripts/minify-trackers.js` minifies only the staged package copies.

`npm run build` rebuilds intermediate admin and i18n output. `npm run build:wordpress-org-free` exports the public Free source, compiles it with the Free entries and aliases, stages and validates the runtime, and writes the ZIP and provenance record to `dist/`.

## Requirements

- WordPress 6.4+
- PHP 7.4+
- Node.js 24 (`>=24 <25`) for asset and release tooling
