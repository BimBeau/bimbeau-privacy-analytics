=== BimBeau Privacy Analytics ===
Contributors: BimBeau
Tags: analytics, privacy, statistics, traffic, self-hosted
Requires at least: 6.4
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 8.45.182
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

A WordPress analytics plugin you can trust — self-hosted, privacy-conscious insights with your data stored in WordPress.

== Description ==

= A WordPress analytics plugin you can trust =

Understand your website traffic directly from WordPress with clear, real-time analytics designed with privacy in mind.

BimBeau Privacy Analytics stores your analytics data in your own WordPress database. No third-party analytics account is required, and your reports are available directly from the WordPress dashboard.

Simple to install, easy to understand, and built for website owners who want useful analytics without depending on a traditional external analytics platform.

= See what matters at a glance =

BimBeau Privacy Analytics gives you the insights you need to understand how people find and use your website:

* Visits, page views, and recent activity.
* Active visitors in real time.
* Top pages and content performance.
* Traffic sources, referrers, campaigns, and acquisition channels.
* Devices, browsers, operating systems, and screen sizes.
* Country-level geolocation.
* Internal searches.
* 404 errors and missing pages.
* Visitor activity and engagement insights.

Everything is presented inside a clean WordPress interface, so you can understand your traffic without leaving your site.

= Included in the Free plugin =

BimBeau Privacy Analytics on WordPress.org is the complete Free plugin.

Its Free analytics features work without a license, payment, quota, or time limit. No third-party analytics account is required.

The Free plugin also includes configurable data retention, role exclusions, optional Do Not Track and Global Privacy Control handling, privacy settings, country-level geolocation, and real-time analytics.

A separate Pro edition is available from the author outside WordPress.org and replaces the Free plugin when installed.

= Privacy and consent =

BimBeau Privacy Analytics is designed around privacy-conscious analytics workflows.

Two levels of measurement are available:

* **Essential statistics** use the base tracker and are intended for situations where consent exemption applies.
* **Advanced statistics** use an enriched tracker that may require prior consent depending on local rules and your website configuration.

For consent-based setups, configure your consent management platform (CMP) to block `bbpa-advanced-tracker` / `assets/js/bbpa-advanced-tracker.js` before consent and release it only after the visitor accepts the Analytics / Statistics category.

BimBeau Privacy Analytics does not provide a consent banner, decide whether consent has been granted, or store consent records.

The plugin does not use tracking cookies or cross-site advertising identifiers. Essential tracking may use a temporary first-party browser storage identifier to group activity, prevent technical duplicate hits, and produce aggregated or anonymized audience statistics. It is not used for advertising, cross-site tracking, or visitor profiling.

BimBeau Privacy Analytics does not make a website GDPR-compliant by itself. Site owners remain responsible for their legal basis, privacy policy, consent configuration, and applicable legal requirements.

= Pro edition =

BimBeau Privacy Analytics Pro is a separate edition for users who want to go further with their analytics.

Depending on the active license, site configuration, consent setup, and available analytics data, Pro can add:

* Analytics exports for supported reports.
* Page Details for deeper page-level analysis.
* City geolocation reports and interactive map markers.
* Custom event tracking and event configuration.
* Content analytics directly inside WordPress content lists and the editor.
* An installable Stats App for desktop and mobile.
* White-label admin header controls.
* Panel visibility customization for the analytics navigation.
* Additional detailed reports and analysis tools.

Learn more about Pro:

* [Pro version overview](https://bimbeau.fr/bimbeau-privacy-analytics/en/pro/overview/)
* [Pro pricing](https://bimbeau.fr/bimbeau-privacy-analytics/en/pricing/)

The WordPress.org Free package remains fully usable without the Pro edition.

= External services =

The core analytics reports use data stored in your WordPress installation. A small number of optional or account-related features can contact external services when they are explicitly configured or used.

**BimBeau GeoIP Database Service** — Used to download the optional local database for country-level geolocation. Automatic database downloads are disabled by default. A request is made only after an administrator manually requests a download/update or later enables automatic updates. The service can receive the WordPress server IP address and a technical User-Agent; visitor IP addresses are not sent to BimBeau for local GeoIP lookups.

[BimBeau GeoIP Database Service](https://github.com/BimBeau/bimbeau-geoip-database)
[BimBeau Terms of Use](https://bimbeau.fr/bimbeau-privacy-analytics/en/legal/terms-of-use/)
[BimBeau Privacy Policy](https://bimbeau.fr/bimbeau-privacy-analytics/en/privacy-policy/)

**Referrer favicons** — When this optional feature is enabled, the WordPress server may contact a referring website to retrieve its icon. The administrator browser uses the locally stored copy rather than requesting the icon directly from the referring website.

**MaxMind** — MaxMind API mode is optional and remains disabled until an administrator selects it and provides their own MaxMind credentials. When configured, MaxMind receives the IP address being resolved. The local GeoIP database mode does not use the MaxMind API.

[MaxMind GeoLite EULA](https://www.maxmind.com/en/geolite/eula)
[MaxMind privacy policy](https://www.maxmind.com/en/privacy-policy)

**Freemius** — The plugin can use Freemius for account, licensing, pricing, upgrade, support, uninstall, and package-related functionality. These services are separate from the analytics reports stored in WordPress.

[Freemius Terms of Service](https://freemius.com/terms/)
[Freemius Privacy Policy](https://freemius.com/privacy/)

= Documentation and support =

* [Official plugin website](https://bimbeau.fr/bimbeau-privacy-analytics/en/)
* [Getting started guide](https://bimbeau.fr/bimbeau-privacy-analytics/en/getting-started/)
* [Source code on GitHub](https://github.com/BimBeau/bimbeau-privacy-analytics)

= Debug logging =

Optional diagnostic logging is available for troubleshooting. BimBeau Privacy Analytics writes diagnostic information only when Debug mode is enabled and an appropriate WordPress debug log destination or plugin-safe log destination is available.

== Installation ==

1. Install **BimBeau Privacy Analytics** from the WordPress Plugins screen or upload the plugin manually.
2. Activate the plugin.
3. Open **BimBeau Privacy Analytics** from the WordPress admin menu.
4. Follow the configuration assistant to choose your analytics and privacy settings.
5. If you use advanced statistics where prior consent is required, configure your CMP to control `bbpa-advanced-tracker` / `assets/js/bbpa-advanced-tracker.js`.

You can change all configuration choices later from the plugin settings.

== Frequently Asked Questions ==

= Is BimBeau Privacy Analytics free? =

Yes. The WordPress.org edition provides its Free analytics features without a license, payment, quota, or time limit.

A separate Pro edition is available for additional analytics and customization features.

= Where is my analytics data stored? =

Analytics data is stored in your own WordPress database.

Your reports are generated directly from data stored inside your WordPress installation.

= Does BimBeau Privacy Analytics use tracking cookies? =

No. BimBeau Privacy Analytics does not use tracking cookies or cross-site advertising identifiers.

Essential tracking may use a temporary first-party browser storage identifier for technical visitor grouping, duplicate-hit prevention, and aggregated or anonymized statistics. It is not used for advertising or cross-site tracking.

= Does BimBeau Privacy Analytics replace a CMP? =

No.

BimBeau Privacy Analytics does not provide a consent banner, decide whether consent has been granted, or store consent records.

When advanced statistics require prior consent, configure your CMP to control the advanced tracker.

= Can I use BimBeau Privacy Analytics alongside Google Analytics or another analytics tool? =

Yes.

BimBeau Privacy Analytics can run alongside other analytics solutions as long as your tracking scripts, consent configuration, and privacy documentation are configured appropriately.

= Can I exclude administrators and other internal users? =

Yes.

Role exclusions can be configured so administrators, editors, contributors, or other internal roles are not included in your analytics according to your website policy.

= Can I track campaign traffic? =

Yes.

Campaign parameters, referrer information, and available acquisition signals can be used to understand traffic from campaigns, search engines, social networks, email, paid traffic, referrals, and other sources.

= What does the Pro edition add? =

The separate Pro edition adds advanced features such as exports, Page Details, city-level geolocation, event tracking, WordPress content analytics, the installable Stats App, white-label controls, and interface customization.

The Pro edition is not required to use the Free plugin.

= Is technical knowledge required? =

No coding is required for normal installation and everyday analytics.

More advanced privacy configurations, especially consent-based tracking, should be configured according to your website's legal and technical requirements.

== Screenshots ==

1. Dashboard overview with visits, page views, top pages, referrers, and recent activity.
2. See active visitors in real time on an interactive world map.
3. Analyze page-view trends and identify your best-performing content.
4. Review visitor activity with privacy-conscious details and consent-aware context.
5. See which websites and domains send traffic to your site.
6. Understand visitor devices, browsers, operating systems, and screen sizes.
7. Explore traffic by country on an interactive geolocation report.
8. Pro — Analyze city-level traffic with top cities and interactive map markers.
9. Discover what visitors search for on your website.
10. Compare top pages with page views, trends, and average time on page.
11. Configure role access and, with Pro, interface branding and analytics panel visibility.
12. Configure essential and advanced statistics, privacy, and consent-related tracking settings.
13. Configure country geolocation with the local GeoIP database or MaxMind.
14. Manage retention, cleanup, and analytics data maintenance.
15. Pro — Configure and open the PWA Stats App from plugin settings.
16. Contact support from WordPress with topic selection and built-in FAQs.
17. Pro — Add Quick Stats directly to WordPress content lists.
18. Pro — Open page-level insights with summaries, trends, charts, and heatmaps.
19. Pro — Configure custom events and actions and inspect tracked activity.
20. Pro — Export filtered analytics data to CSV, JSON, or Excel.
21. Pro — Install and use the standalone PWA Stats App on desktop or mobile.
22. Pro — White-label the interface, choose visible panels, and configure Quick Stats.

== Changelog ==

= 8.45.182 =
* Bump @testing-library/react from 16.3.2 to 16.3.3 in the dev-dependencies group.
