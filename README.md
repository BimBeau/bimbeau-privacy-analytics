# BimBeau Privacy Analytics

BimBeau Privacy Analytics is a lightweight, privacy-oriented analytics plugin for WordPress.

It stores analytics locally, avoids third-party analytics scripts, and separates essential aggregate measurement from optional advanced tracking for richer insights.

## Core ideas

- Local WordPress data storage.
- Aggregate-first reporting.
- No stored personal WordPress account identifiers in analytics records.
- Essential and advanced tracker runtimes.
- Consent-manager friendly advanced tracking.
- Free and Pro builds generated from the same source through Freemius-aware build rules.

## Free and Pro

The Free plugin focuses on aggregate analytics: page views, visits, time series, top pages, referrers, devices, 404s, search terms, geolocation aggregates, realtime snapshots, and privacy settings.

Pro adds deeper reporting and workflow features such as visitor-detail depth, page details, content analytics in WordPress content lists and the editor, dedicated app login, and events configuration.

The Pro authentication controller supports WordPress environments running PHP 7.4.

The authoritative feature split lives in [docs/FEATURE_TIER_MATRIX.md](docs/FEATURE_TIER_MATRIX.md).

## Tracking model

The essential tracker keeps base analytics available with minimal data collection.

The advanced tracker can add enriched fields such as active time, viewport data, interactions, aggregate geolocation insights, and short-lived technical visit grouping. BimBeau Privacy Analytics does not act as a CMP; when consent is required, the site owner must configure the CMP to block and release the advanced tracker.

## Public source and build instructions

The public source repository for BimBeau Privacy Analytics Free is available at:

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
- `assets/js/bbpa-event-registry.js` is maintained as readable source in `assets/js/bbpa-event-registry.js`.

`npm run build` is the documented rebuild command for generated admin assets. The tracker files listed above are readable JavaScript source files maintained directly in `assets/js/`.

## Documentation

Detailed implementation notes live in `docs/`:

- [Architecture](docs/ARCHITECTURE.md)
- [REST API](docs/REST_API.md)
- [Database Schema](docs/DB_SCHEMA.md)
- [Settings](docs/SETTINGS.md)
- [Hooks](docs/HOOKS.md)
- [I18N language reference](docs/I18N_LANGUAGE_REFERENCE.md)
- [Freemius Stripping Guidelines](docs/FREEMIUS_STRIPPING_GUIDELINES.md)

Every Markdown file should describe the current code, stay concise, and avoid historical or corrective commentary. Use `npm run check:docs` before release-facing documentation changes.

## Requirements

- WordPress 6.4+
- PHP 7.4+
- Node.js 20+ for asset and release tooling
