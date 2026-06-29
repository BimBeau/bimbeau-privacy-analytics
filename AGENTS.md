# AGENTS

## Repository scope

This repository contains the full source code of **BimBeau Privacy Analytics**, including both Free and premium Pro features.

Premium functionality is conditionally enabled at runtime through the **Freemius SDK**, which manages licensing, subscriptions, and feature access.

All features are maintained in this repository.

## Default assumptions

* If a request does not explicitly target Pro, implement it as a Free feature.
* Unspecified feature-tier requests are always treated as Free features.
* All documentation, Markdown files, code comments, and variable names must be written in English.

## Mandatory Git workflow

* Never commit directly to `main` unless explicitly requested by the repository owner.
* Always create a dedicated branch from `main` for code, documentation, site, configuration, and workflow changes.
* Group related changes into a single commit before opening a pull request.
* Open pull requests against `main`.
* Never merge a pull request without explicit validation from the repository owner.

## Editing constraints

* Prefer modifying source code only, for example `/src`.
* Never modify generated files: `/build/*`, `/dist/*`, `/assets/*`, `*.min.js`, `*.map`.
* Never run `npm run build` or `wp-scripts build`.
* If a fix would normally require a rebuild, apply a source-level workaround and explain it.
* Do not include binary files in pull requests. If binary files are required, document the manual handling instead.

## Admin UI design system

* Use the Gutenberg design system exclusively.
* Use official `@wordpress/components` only for UI components.

## Documentation requirements

Any code change must be evaluated for documentation impact.

Update documentation when a change affects:

* behavior
* architecture
* API
* data model
* settings
* feature availability
* Free/Pro boundaries
* user-facing behavior

Priority documentation targets:

* `docs/FEATURE_TIER_MATRIX.md` -> for any Free/Pro change
* `docs/ARCHITECTURE.md` -> for structural or system changes
* `docs/DB_SCHEMA.md` -> for any database modification
* `docs/REST_API.md` / `docs/EXTENSION_API.md` -> for API changes
* `docs/SETTINGS.md` -> for admin or configuration changes
* `docs/user/**` -> for end-user documentation published through the Zensical website

User documentation under `docs/user/**` is the source for the public BimBeau Privacy Analytics website built with Zensical from `mkdocs.site.yml`.

User documentation must:

* use Material-compatible Markdown
* use Material for MkDocs/Zensical-compatible components when helpful
* avoid GitBook-only syntax

## i18n requirements

The i18n workflow is the only allowed exception to the generated-assets rule.

A change is i18n-sensitive if it adds, edits, moves, or removes any translatable PHP or JavaScript string.

Translatable strings include:

* PHP strings passed to `__()`, `_e()`, `esc_html__()`, `esc_attr__()`, `_x()`, `_n()`, or `sprintf()` with translated text
* JavaScript strings using `@wordpress/i18n`, `__()`, `_x()`, `_n()`, `sprintf()`, or equivalent helpers
* visible product copy
* admin UI text
* report labels
* settings text
* notices
* error messages
* onboarding text
* export messages
* table headers
* Free or Pro product UI text

For i18n-sensitive changes, Codex must:

1. Run:

```bash
npm run check:pre-pr:i18n
```

2. Commit updated generated i18n text files when they change:

* `languages/*.po`
* `languages/*.pot`
* `languages/*.json`

3. Exclude `languages/*.mo` from the pull request diff unless explicitly requested.

4. Verify that no required i18n text-file changes are left uncommitted:

```bash
git diff --exit-code -- languages ':(exclude)languages/*.mo'
```

If this check fails, the pull request is incomplete.

Codex must regenerate i18n, commit the required `.po`, `.pot`, and `.json` files, keep `.mo` files out of the review diff unless explicitly requested, and rerun the check before opening or updating the pull request.

If the task is not i18n-sensitive, Codex must state in the pull request body that no translatable strings were changed.

## Free package audit rules

* The Free package must not contain unjustified Pro or trialware traces. The release workflow treats those traces as a packaging risk and blocks the release when `scripts/audit-free-package.sh` finds a match outside its strict allowlist.
* The Free package intentionally includes the Freemius SDK and licensing bridge for account, pricing, upgrade, support, uninstall, and package identity flows.
* The Free package audit excludes `vendor/freemius/**` from local trialware and Pro trace scans because it is third-party SDK code and can contain premium/license terminology.
* Plugin-owned code remains strictly audited. The Freemius SDK allowance is not a general allowlist for local locked functionality, disabled Pro screens, local feature unlock logic, Pro-only REST controllers, Pro preview assets, or local Pro runtime files.
* Allowed Free package traces are limited to runtime Free/Pro guards, Freemius SDK and licensing metadata, Upgrade to Pro messages, translation files, controlled REST responses or routes that remain gated by `bbpa_fs() / package runtime guards`, and compatibility data needed by shared Free/Pro runtime code.
* Any new Pro-related string, identifier, route, asset, setting, or generated bundle match that appears in the Free package must be classified before it is allowlisted. If it is required for gating, Freemius, upgrade messaging, i18n, a controlled REST response, or runtime compatibility, add the narrowest file-scoped allowlist entry possible and test the generated Free package audit. If it exposes Pro-only logic or UI in Free, fix the source or packaging instead of allowlisting it.
* Never bypass, disable, or weaken the Free package audit to make a release pass. A release that fails the audit requires either a targeted allowlist justification for a legitimate trace or removal of a real Pro leak from the Free package.

## Release workflow

* Changes intended to exercise the full automated release chain must be merged into `main` through a pull request.
* For BimBeau Privacy Analytics release-chain tests, trigger the version workflow by changing `CHANGELOG.md` only.
* Do not manually edit version sources such as `package.json`, `includes/config.php`, `bimbeau-privacy-analytics.php`, or `readme.txt`.
* `version-bump.yml` and the version synchronization scripts own derived version changes.
* If a documentation-only change should still trigger the complete chain, add a matching `CHANGELOG.md` entry and leave all other version files untouched.
* Do not push directly to `main` unless explicitly instructed that no PR-based release-chain test is needed.

## Pull request requirements

Every pull request body produced by Codex must include:

* a summary of changes
* documentation impact
* i18n impact
* checks that were run

For i18n-sensitive changes, explicitly include the result of:

* `npm run check:pre-pr:i18n`
* `git diff --exit-code -- languages ':(exclude)languages/*.mo'`

For non-i18n-sensitive changes, state that no translatable strings were changed.

## PR metadata notation

PR titles should remain readable and should not use change-type prefixes.

For PR titles:

* Do not prefix the title with `[Feature]`, `[Fix]`, `[Docs]`, or similar labels.
* If the entire PR is Pro-only, append the suffix `[Pro]`.
* If the PR mixes Free and Pro changes, do not add `[Pro]` to the title unless the main purpose of the PR is Pro-only.

For PR body metadata lines:

* Prefix each relevant line with one primary change type.
* For Pro-only changes, append the suffix `[Pro]`.
* For Free changes, do not add a tier suffix.
* Apply the notation per line when a pull request contains mixed Free and Pro changes.

Example:

```md
Title:
Add weekly analytics export [Pro]

Summary:
- [Feature] Add CSV export for weekly analytics [Pro]
- [Fix] Improve dashboard loading state
- [UI] Fix tooltip alignment on the usage graph
- [Docs] Update setup instructions
```

Mixed-tier example:

```md
Title:
Improve analytics dashboard exports

Summary:
- [Feature] Add CSV export for weekly analytics [Pro]
- [Feature] Add basic chart labels
- [Fix] Improve dashboard loading state
- [Docs] Update setup instructions
```
