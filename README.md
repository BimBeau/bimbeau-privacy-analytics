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

Install dependencies and rebuild generated assets from the repository root with:

```bash
npm ci
npm run build
```

The build configuration is maintained in `webpack.config.js`. WordPress.org review-relevant assets map to source files as follows:

- `assets/js/admin.js` is built from `src/admin/index.js` and modules under `src/admin/`.
- `assets/js/style-admin.js` and generated admin CSS are built from `src/admin/style.scss`.
- `assets/js/bbpa-essential-tracker.js` is maintained as readable source in `assets/js/bbpa-essential-tracker.js`.
- `assets/js/bbpa-advanced-tracker.js` is maintained as readable source in `assets/js/bbpa-advanced-tracker.js`.

`npm run build` is the documented rebuild command for generated admin assets. The tracker files listed above are readable JavaScript source files maintained directly in `assets/js/`.

## Requirements

- WordPress 6.4+
- PHP 7.4+
- Node.js 20+ for asset and release tooling
