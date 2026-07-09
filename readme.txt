=== BimBeau Privacy Analytics ===
Contributors: BimBeau
Requires at least: 6.4
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 8.45.4
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

A privacy-friendly WordPress analytics plugin you can trust: reliable traffic KPIs by default, richer context when available, and analytics data kept inside your own WordPress installation. Official site: https://bimbeau.fr/bimbeau-privacy-analytics/

== Description ==

BimBeau Privacy Analytics provides a fully functional Free, self-hosted analytics plugin for WordPress. It helps site owners follow visits, page views, traffic sources, devices, country-level geolocation, internal searches, 404 errors, visitors, and real-time activity directly from the WordPress dashboard.

Analytics data is stored in the local WordPress database. The plugin is designed around privacy-conscious analytics workflows, with a base tracker intended for consent-exemption conditions and an enriched tracker that can require prior consent depending on local rules and site configuration.

BimBeau Privacy Analytics does not make a website GDPR-compliant by itself. Site owners remain responsible for their legal basis, privacy policy, CMP configuration, consent records, and any additional compliance requirements that apply to their website.

Useful links:

* Official plugin website: https://bimbeau.fr/bimbeau-privacy-analytics/en/
* Pricing Pro: https://bimbeau.fr/bimbeau-privacy-analytics/en/pricing/
* Getting started guide: https://bimbeau.fr/bimbeau-privacy-analytics/en/getting-started/
* BimBeau website: https://bimbeau.fr/

Privacy-oriented analytics:

* Self-hosted analytics data stored in the local WordPress database.
* No cross-site advertising identifiers.
* No third-party analytics account required.
* Configurable retention settings.
* Respect for Do Not Track and Global Privacy Control settings when enabled.
* Optional debug logs controlled by the plugin Debug mode.
* Separate enriched tracker script for CMP-based consent workflows.

Reports and insights:

* Dashboard overview with page views, visits, top pages, referrer domains, and recent activity.
* Real-time visitors report.
* Pages and content performance reports.
* Acquisition sources, including direct visits, organic search, referrals, social, email, paid search, campaigns, and AI assistants when the relevant data is available.
* Referring sites report for understanding where visits come from.
* Device, browser, operating system, and screen context reports when available.
* Country-level geolocation reporting when a local GeoIP database or MaxMind API is configured.
* Internal search report.
* 404 errors report to help identify broken URLs and missing pages.

Free plugin behavior:

BimBeau Privacy Analytics on WordPress.org is the complete Free plugin. Its Free analytics features run without a license, payment, quota, time-limited evaluation, or remote validation. The package may load Freemius for account, pricing, upgrade, support, uninstall, and package identity flows. A separate Pro edition is available from the author outside WordPress.org and replaces the Free plugin when installed.

Pro edition:

BimBeau Privacy Analytics Pro is a separate edition designed for users who need more detailed analysis, export workflows, event tracking, app-like access to their analytics, or admin customization. It is not required to use the Free plugin.

Depending on the active license, site configuration, consent setup, and available analytics data, Pro can add:

* Analytics exports for supported reports.
* Page Details for deeper page-level analysis.
* City geolocation reports and map markers when usable city data is available.
* Event tracking and event configuration.
* Content analytics in WordPress content lists and the editor.
* An installable stats app for site analytics.
* White-label admin header controls.
* Optional panel visibility controls for the analytics navigation.
* Deeper reporting surfaces when licensed features are active and the required data is available.

Learn more about Pro:

* Official plugin website: https://bimbeau.fr/bimbeau-privacy-analytics/en/
* Pricing: https://bimbeau.fr/bimbeau-privacy-analytics/en/pricing/

The WordPress.org Free package does not embed Pro-only report surfaces as local feature locks or disabled placeholders. Upgrade links point to the separate Pro edition hosted outside WordPress.org.

Consent and enriched tracking:

The enriched tracker is exposed as a CMP-targetable script:

* `bbpa-advanced-tracker`
* `assets/js/bbpa-advanced-tracker.js`

When enriched analytics require consent, configure your CMP to block this script before consent and release it only after the visitor accepts the Analytics / Statistics category. BimBeau Privacy Analytics does not provide a consent banner, does not decide whether consent is granted, and does not store consent records.

Debug logging:

Debug mode is the authoritative plugin switch for diagnostic logging. BimBeau Privacy Analytics writes diagnostics only when Debug mode is enabled and a WordPress debug log destination (`WP_DEBUG` + `WP_DEBUG_LOG`) or an explicit BimBeau Privacy Analytics safe sink is available.

External services:

Country-level geolocation reports require a local GeoIP database in local database mode. Automatic GeoIP updates are disabled by default, and BimBeau Privacy Analytics does not call the BimBeau GeoIP Database Service during plugin activation. Local GeoIP lookups do not send visitor IP addresses to BimBeau.

The BimBeau GeoIP Database Service is contacted only when an administrator clicks the install/update database action in Geolocation settings, or when an administrator explicitly chooses an automatic update frequency. The plugin sends a server-side HTTP request to fetch the manifest and database archive, validates manifest metadata, verifies the downloaded archive checksum, and keeps an existing readable local database available when an update attempt fails. The service receives the WordPress server IP address as seen by the service, the HTTP User-Agent header, and the site URL only if a site URL is included in the User-Agent header. The GeoIP updater User-Agent does not include `home_url('/')`.

GeoIP service: https://github.com/BimBeau/bimbeau-geoip-database
BimBeau Terms of Use: https://bimbeau.fr/bimbeau-privacy-analytics/en/legal/terms-of-use/
BimBeau Privacy Policy: https://bimbeau.fr/bimbeau-privacy-analytics/en/privacy-policy/
MaxMind GeoLite EULA: https://www.maxmind.com/en/geolite/eula
MaxMind privacy policy: https://www.maxmind.com/en/privacy-policy

== Source Code and Build Instructions ==

The public source repository for BimBeau Privacy Analytics Free is available at:

https://github.com/BimBeau/bimbeau-privacy-analytics

Use the following commands from the repository root to install dependencies and rebuild generated assets:

```bash
npm ci
npm run build
```

Build configuration is maintained in `webpack.config.js`. Asset sources are mapped as follows:

* `assets/js/admin.js` is built from `src/admin/index.js` and modules under `src/admin/`.
* `assets/js/style-admin.js` and generated admin CSS are built from `src/admin/style.scss`.
* `assets/js/bbpa-essential-tracker.js` is maintained as readable source in `assets/js/bbpa-essential-tracker.js`.
* `assets/js/bbpa-advanced-tracker.js` is maintained as readable source in `assets/js/bbpa-advanced-tracker.js`.
* `assets/js/bbpa-event-registry.js` is maintained as readable source in `assets/js/bbpa-event-registry.js`.

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/`.
2. Activate **BimBeau Privacy Analytics** through the **Plugins** screen in WordPress.
3. Open **BimBeau Privacy Analytics** in the WordPress admin menu.
4. Review the privacy and tracking settings before collecting analytics data.
5. Configure retention, DNT/GPC handling, role exclusions, geolocation, and debug options according to your needs.
6. If you use enriched analytics, configure your CMP to control `bbpa-advanced-tracker` / `assets/js/bbpa-advanced-tracker.js`.
7. Review the geolocation settings. Local database mode uses the BimBeau GeoIP Database Service for database updates, while MaxMind API mode requires MaxMind credentials.

== Frequently Asked Questions ==

= Who is BimBeau Privacy Analytics for? =

BimBeau Privacy Analytics is designed for WordPress site owners who want useful audience statistics without sending their analytics data to an external analytics platform.

It is suitable for publishers, businesses, agencies, freelancers, and privacy-conscious websites that prefer self-hosted analytics inside WordPress.

= What can I measure with BimBeau Privacy Analytics? =

BimBeau Privacy Analytics helps you measure visits, page views, traffic sources, top pages, referrers, devices, internal searches, 404 errors, country-level geolocation, visitors, and real-time activity.

Some enriched details depend on the available data, tracking configuration, consent setup, and site configuration.

= Does BimBeau Privacy Analytics use cookies? =

BimBeau Privacy Analytics analytics does not use tracking cookies or cross-site advertising identifiers.

Essential tracking may use a temporary first-party browser storage identifier to group activity into a bounded visitor row, prevent technical duplicate transport hits, and produce aggregated or anonymized audience statistics. This identifier expires according to the Visitor activity window setting and is not used for advertising, cross-site tracking, or visitor profiling.

= Does BimBeau Privacy Analytics replace a CMP? =

No. BimBeau Privacy Analytics does not provide a consent banner, does not decide whether consent is granted, and does not keep consent records.

For enriched analytics, configure your CMP to block `bbpa-advanced-tracker` / `assets/js/bbpa-advanced-tracker.js` before consent and release it only after the visitor accepts the Analytics / Statistics category. BimBeau Privacy Analytics diagnostics are technical checks only and are not legal proof of consent.

= What happens if no CMP is installed? =

If no CMP or consent mechanism is installed, BimBeau Privacy Analytics does not block the enriched tracker by itself. The advanced tracker executes as standard JavaScript when loaded.

Site owners who require pre-consent blocking must configure an external CMP or another valid consent mechanism. BimBeau Privacy Analytics does not infer, grant, or store visitor consent.

= Where is analytics data stored? =

Analytics data is stored in the local WordPress database.

= Does BimBeau Privacy Analytics send data to a third-party analytics platform? =

No third-party analytics account is required. Analytics reports are generated from data stored inside the WordPress installation.

Some optional features, such as geolocation enrichment, may use external datasets or services. Local GeoIP database updates use the documented BimBeau GeoIP Database Service, while MaxMind API mode uses live MaxMind requests when configured.

= Can I use BimBeau Privacy Analytics with another analytics solution? =

Yes. BimBeau Privacy Analytics can be used alongside another analytics tool, depending on how your tracking scripts and consent rules are configured.

Make sure your CMP, privacy policy, and legal notices accurately describe all analytics tools used on your website.

= Does BimBeau Privacy Analytics track logged-in users? =

Logged-in user tracking depends on the plugin configuration and exclusion settings. Review the tracking and privacy settings after installation to make sure the behavior matches your site policy.

= Can I exclude internal roles from analytics? =

Yes. Review the tracking and privacy settings to exclude internal roles such as administrators, editors, contributors, or other roles that should not be counted according to your website policy.

= Can I use campaign parameters such as UTM tags? =

Yes. Campaign and referrer information can be used to understand where traffic comes from, including tagged links, paid traffic, and acquisition sources when the relevant data is available.

= Will BimBeau Privacy Analytics help me find broken links? =

Yes. The 404 errors report helps identify missing pages and broken URLs detected on your website.

= What is the difference between the Free plugin and the separate Pro edition? =

BimBeau Privacy Analytics Free provides self-hosted WordPress analytics for everyday traffic monitoring. A separate Pro edition is available from the author outside WordPress.org and replaces the Free plugin when installed.

= Is technical knowledge required? =

Basic installation does not require coding. More advanced privacy setups, especially CMP-based enriched analytics, should be configured carefully according to your website's legal and technical requirements.

== Screenshots ==

1. BimBeau Privacy Analytics dashboard overview with key privacy-friendly traffic metrics.
2. Real-time visitors report showing current activity at a glance.
3. Pages report for identifying top content and page views.
4. Visitors report with detailed but privacy-conscious visitor insights.
5. Referring sites report for understanding where visits come from.
6. Devices report for comparing desktop, tablet, and mobile traffic.
7. Geolocation report by country.
8. Internal searches report for discovering what visitors search for on the site.
9. 404 errors report for finding missing pages and broken URLs.
10. General settings screen.
11. Tracking and privacy settings screen.
12. Geolocation settings screen.
13. Maintenance settings screen.
14. Help and contact support screen.

== Changelog ==

= 8.45.4 =
* Fix Pro post views column links to open the Top pages detail page with the official admin slug.
