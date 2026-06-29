## 8.43.22

- Document public source and build instructions.

## 8.43.21

- Fix i18n public plugin slug headers.

## 8.43.20

- Keep i18n template headers tied to the public WordPress.org plugin slug.

## 8.43.19

- Fix Free package build validation for runtime callbacks.

## 8.43.18

- Restrict Free geolocation packaging to country-level data.

## 8.43.17

- Remove Pro-only Events purge traces from the Free admin bundle.

## 8.43.16

- Regenerate i18n text files.

## 8.43.15

- Strip Pro-only package traces from generated Free builds.

## 8.43.14

- Strengthen Free package validation for Pro-only city geolocation, Events purge, and app shell traces.

## 8.43.13

- Strengthen Free package stripping and validation for Pro-only code.

## 8.43.12

- Fix PWA REST authentication after app reloads.

## 8.43.11

- Regenerate i18n text files.

## 8.43.10

- Fix front app session reload diagnostics and French reload label.

## 8.43.9

- Regenerate i18n text files.

## 8.43.8

- Fix PWA session-expired handling to show a single reconnect state.

## 8.43.7

- Restore REST nonce for PWA requests.

## 8.43.6

- Improve real-time visitor table horizontal scrolling.

## 8.43.5

- Remove temporary legacy table recovery merge/drop code after successful `bpa_*` to `bbpa_*` migration, keeping safe legacy detection.

## 8.43.4

- Fix fatal redeclaration of bbpa_table_exists() in the legacy prefix migration recovery patch.

## 8.43.3

- Recover legacy bpa analytics tables into canonical bbpa tables and remove recovered legacy tables.

## 8.43.2

- Manual release metadata update.

## 8.44

- Fix invalid daily analytics source category index schema.

## 8.43.0

- Prepare minor release.

## 8.42.52

- Prepare the next distributable plugin release.

## 8.42.51

- Simplify Freemius package validation after identifying the Premium naming issue as a dashboard configuration problem.

## 8.42.50

- Fix front app nonce refresh, login isolation, and header branding regressions.

## 8.42.49

- Simplify Freemius package validation after identifying the Premium naming issue as a dashboard configuration problem.

## 8.42.48

- Fix admin REST URL fallback so query-arg REST mode no longer generates encoded `/%3Frest_route=` API paths.

## 8.42.47

- Remove Freemius pricing/upgrade submenu entries from Pro admin menus while keeping the account submenu available.
- Keep the Free upgrade submenu untouched.
- Add PHPUnit coverage for Pro cleanup and Free preservation.

## 8.42.46

- Fix front app branding, REST nonce handling, and PWA offline caching.

## 8.42.45

- Temporarily removes the Freemius admin pricing feature slider and returns the pricing screen to the native Freemius rendering.

## 8.42.44

- Fix GeoIP database updates to use the official manifest with checksum validation.

## 8.42.43

- Stabilizes the Freemius pricing admin page layout.

## 8.42.42

- Exclude Free-only Pro promotion screenshots from the Freemius Pro package.

## 8.42.41

- Remove fixed width styling from the real-time current page column.

## 8.42.40

- Fix real-time current page column sizing without affecting visitor listings.

## 8.42.39

- Fix Top pages ascending sorting for the homepage row.

## 8.42.38

- Fix top pages ascending hit sorting and package verification.

## 8.42.37

- Clear previous admin endpoint data as soon as a new enabled request starts, so report tables no longer keep a stale payload under updated controls.
- This targets the observed Top pages case where the UI can show the previous descending rows while the sort control already says ascending.
- Document the fix under the current 8.42.36 changelog entry.

## 8.42.36

- Prevent report tables from showing stale rows while a new sort or filter request is loading.
- Constrains the real-time visitors table width so the current page column can no longer stretch the full listing.
- Applies fixed table layout for the real-time visitors table and clamps the current page column.
- Keeps the existing horizontal scroll behavior and current-page shimmer while adding `text-overflow: ellipsis` for long URLs with tracking parameters.

## 8.42.35

- Manual release metadata update.

## 8.42.34

- Classify compiled admin JavaScript metadata separately in the Free package audit.

## 8.42.33

- Harden Freemius Free package sanitization for front app assets.

## 8.42.32

- Fix Freemius Free package sanitization.

## 8.42.31

- Fix Freemius Free package sanitizer for post-deploy Pro events traces.

## 8.42.30

- Improve real-time visitor table by showing acquisition channel instead of raw referrer.

## 8.42.29

- Run local Free package audits before Freemius deployment.

## 8.42.28

- Ensure the generated Free package excludes Pro runtime export and events wiring before deployment.

## 8.42.27

- Separate Free package runtime from Pro export and events wiring.

## 8.42.26

- Keep Pro runtime routes out of the Free package audit.

## 8.42.25

- Fix Freemius Free package audit path resolution.

## 8.42.24

- Tighten Free package validation for stripped PWA assets.

## 8.42.23

- Fix Free package validation by removing stale front login asset references while preserving Freemius source assets.

## 8.42.22

- Fix Top pages sorting so homepage rows follow the selected order.

## 8.42.21

- Free package validation uses deterministic structural checks for packaged assets.

## 8.42.20

- Load bundled plugin translations from the active package languages directory.

## 8.42.19

- Fix Free package admin bundle sanitization.

## 8.42.18

- Harden Free package sanitization for front app hooks.
- Preserve valid admin JavaScript identifiers during Free package cleanup and validate the staged admin bundle syntax.

## 8.42.17

- Isolate front PWA app shell rendering.

## 8.42.16

- Fix Free package front app callback guards.

## 8.42.15

- Fix Freemius Free package sanitization for relative ZIP paths.

## 8.42.14

- Manual release metadata update.

## 8.42.12

- Gate premium package includes for Freemius Free and Pro package builds.

## 8.42.11

- Complete French user documentation translation.

## 8.42.10

- Use documented GeoIP database service.

## 8.42.9

- Allow Freemius SDK in Free package audit.

## 8.42.8

- Remove stale bpa-admin i18n JSON files.

## 8.42.7

- Fix escaping compliance for manifests and admin output.

## 8.42.6

- Harden REST request parsing and add sanitizers with unit tests.

## 8.42.5

- Require shared nonce and capability validation for admin/private REST requests while keeping public hit ingestion anonymous.

## 8.42.4

- Fix homepage exclusion in Top pages.

## 8.42.3

- Use enqueue APIs for inline app styles.

## 8.42.2

- Fix Top pages sorting direction after page-path grouping.

## 8.42.1

- Restore the last validated stable codebase after the 8.42.0 release merge did not perform the intended rollback.

## 8.40.108

- Shorten overview KPI labels.

## 8.40.107

- Fix missing referrer fallback label.

## 8.40.106

- Fix visitor source category reporting.

## 8.40.105

- Fix PHP 8.4 CSV escape deprecation warnings.

## 8.40.104

- Harmonize admin channel labels.

## 8.40.103

- Fix acquisition and referrer visit counts.

## 8.40.102

- Fix source attribution persistence.

## 8.40.101

- Add Channel column to Visitors and Events listings.

## 8.40.100

- Normalize page paths in Top Pages report to strip query strings and merge equivalent paths.

## 8.40.99

- Count acquisition channels from visits.

## 8.40.98

- Split Social into Paid/Organic Social and rename Campaigns → Other Campaigns in acquisition classification.

## 8.40.97

- Advanced tracker: respect external CMP execution, defer startup, and event-dispatch bridge.

## 8.40.96

- Advanced tracker: respect CMP script blocking (wait state), mutation observer, event bridge, tests and docs.

## 8.40.95

- Fix REST heartbeat time denominator identifiers.

## 8.40.94

- Fix heartbeat time denominator aggregation.

## 8.40.93

- Fix heartbeat active time aggregation.

## 8.40.92

- Fix front app authentication and asset isolation.

## 8.40.91

- Fix acquisition channel translations.

## 8.40.90

- Preserve stored acquisition channel categories.

## 8.40.89

- Fix front PWA shell layout and REST auth.

## 8.40.88

- Use hits_daily data for acquisition channels.

## 8.40.87

- Harden front tracker runtime against cache optimizers.

## 8.40.86

- Fix local GeoLite geolocation config status.

## 8.40.85

- Target the external tracker `<script src="...">` tag when adding `data-no-optimize` and `data-no-defer` attributes.
- Prevent the attributes from being applied only to inline `*-js-before` scripts when WordPress prints inline runtime blocks before tracker assets.
- Add PHPUnit coverage for essential and advanced tracker output blocks with inline scripts before the external asset.

## 8.40.84

- Count Top countries visitors from unique visitor rows for the selected period.

## 8.40.82

- Keep anonymous overview totals for long-term dashboard ranges.

## 8.40.81

- The maintenance action for deleting analytics data clears all stored analytics tables used by dashboard reports.

## 8.40.80

- Fix retention settings persistence.

## 8.40.79

- Remove visitor activity legacy backfill.

## 8.40.78

- Harden daily visitor activity handling.

## 8.40.77

- Count unique visitors by day and period from daily visitor activity rows.

## 8.40.76

- Count geo city visitors from unique visitor rows.

## 8.40.75

- Count Top cities visitors from unique human visitor rows for the selected period.

## 8.40.74

- Clarify white-label interface branding [Pro].

## 8.40.73

- Replace custom plugin label with white-label toggle [Pro].

## 8.40.72

- Improve admin identity branding.

## 8.40.71

- Fix i18n PO duplicate entries.

## 8.40.70

- Freemius package publication uses BimBeau Privacy Analytics distribution branches.

## 8.40.69

- Use bimbeau-privacy-analytics.php as the canonical WordPress plugin entry point.

## 8.40.68

- Freemius deployment packages include the preserved WordPress entry point at the plugin root.

## 8.40.67

- Version metadata stays aligned across package metadata and changelog sources for Freemius release automation.

## 8.40.66

- Tighten Free package audit allowlist.

## 8.40.65

- Maintenance release preparing the WordPress.org package metadata and release workflow.

## 8.40.64

- Regenerate i18n text files.

## 8.40.63

- Manual release metadata update.

## 8.40.61

- Add Freemius pricing feature slider.

## 8.40.60

- Hide Pro-only report surfaces from Free.

## 8.40.59

- Remove locked Pro surfaces from Free build.

## 8.40.58

- Translate acquisition channel labels.

## 8.40.57

- Updates the Freemius SDK version marker from 2.13.1 to 2.13.2 in `vendor/freemius/start.php`.
- Addresses the Freemius deployment notice recommending SDK 2.13.2.

## 8.40.56

- Adds a one-time lifecycle migration that fills `url_query_allowlist` with the default marketing attribution parameters when an existing install has the field missing or empty.
- Preserves any existing non-empty custom allowlist and marks the migration as completed so later manual emptying is not overwritten.
- Runs the backfill during activation and upgrade checks, after the settings option is registered.

## 8.40.55

- Prefill marketing attribution query allowlist.

## 8.40.54

- Ensure REST report controllers load before route registration.

## 8.40.53

- Fix AI referrer domains hook consistency.

## 8.40.52

- Fix acquisition and referrer report regressions.

## 8.40.50


- Classify acquisition sources from tracking context.

## 8.40.45

- Acquisition source categories use captured UTM campaign context before falling back to referring-domain classification.

## 8.40.44

- Regenerate i18n text files.

## 8.40.43

- The Events report export control uses the same icon-only header rendering as other report pages.

## 8.40.42

- Fix acquisition panel order, translations, and intro layout.

## 8.40.41

- Add Acquisition admin panel, REST endpoint and UI (Free).

## 8.40.40

- Bump version to 8.40.40.

## 8.40.39

- Manual release metadata update.

## 8.40.38
- Custom style for lean-stats-pricing page

## 8.40.35

- Add a focused CSS override so the realtime visitor button skeleton represents the counter width instead of a long label.
- Import the override after globals so it takes precedence without rewriting the existing globals stylesheet.

## 8.40.34

- fix: refresh i18n source references.

## 8.40.33

- Allow role-authorized analytics users to read the events stats endpoint instead of requiring `manage_options`.
- Allow the Events stats view to read the events configuration needed for labels/KPI context while preserving settings-only write access.
- Keep public event capture endpoints and Events configuration writes unchanged.

## 8.40.32

- Restore configured event capture after the dispatcher-only path stopped persisting trigger signals.

## 8.40.31

- Fix duplicate front event counts by replacing the temporary trigger compatibility binding with a consolidated dispatcher override that emits one canonical trigger signal per configured event.

## 8.40.30

- Fix consolidated front event actions so configured tracking snippets execute from the advanced runtime and emit canonical event signal statuses.

## 8.40.29

- Manual release metadata update.

## 8.40.28

- [fix] Fix 404 reporting so redirected requests from TranslatePress, Redirection, or custom plugin logic are not stored as not-found pages.
- [fix] Defer final 404 storage until shutdown and skip requests that emitted redirect status or Location headers.

## 8.40.27

- Prefer the accuracy-radius label when a realtime location has a broad approximate radius, so a stale or overly-specific city name is not displayed for approximate geolocation.
- Bump package/config version metadata to 8.40.27.

## 8.40.26

- Manual release metadata update.

## 8.40.24

- Use an explicit class for the Real-time visitors current page shimmer cell.

## 8.40.22

- chore: normalize i18n plugin support URL.

## 8.40.21

- Fix the Visitors table connection time column alignment.

## 8.40.20

- Apply a narrow 2-second text shimmer to the Real-time visitors Current page URL cells only.

## 8.40.19

- Backfill realtime map points from the final visible `visits` payload so the map and visitor table use the same active visitor population.
- Preserve existing consented map points while adding missing visit-derived markers keyed by rounded coordinates.
- Resolve coordinates from visit coordinates, GeoName ID, city/country, or country fallback when needed.

## 8.40.18

- Remove duplicate visitors last activity cell.

## 8.40.17

- Show private label for private visitors last activity.

## 8.40.16

- run server-side request tracking after canonical redirects to avoid storing redirectable URLs such as `/en` as 404s.
- skip 404 storage when WordPress can resolve a pending canonical redirect.
- filter `.well-known` technical endpoints such as `/.well-known/traffic-advice` from the Pages not found report.
- add PHPUnit coverage for the `.well-known/traffic-advice` report filter.

## 8.40.15

- Restores the homepage row in the Top pages REST response when existing not-found aggregates hide it.
- Rebuilds homepage metrics from the daily aggregate table, including average time and sparkline data when available.
