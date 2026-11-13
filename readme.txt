=== BimBeau Privacy Analytics – Simple, Private WordPress Statistics ===
Contributors: BimBeau
Tags: analytics, statistics, privacy, visitor statistics, real-time analytics
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 8.85.2
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

Privacy-friendly WordPress analytics: real-time visitor stats, top pages, referrers and countries, stored in your own database. No external account.

== Description ==

= A WordPress analytics plugin you can trust =

Understand your website traffic directly from WordPress with clear, real-time analytics designed with privacy in mind.

BimBeau Privacy Analytics stores your analytics data in your own WordPress database. No third-party analytics account is required, and your reports are available directly from the WordPress dashboard.

= Why choose BimBeau Privacy Analytics =

* **Your data stays on your website.** Reports are built from your own WordPress database, with no third-party analytics account.
* **Privacy-conscious by design.** No tracking cookies or cross-site advertising identifiers, and optional Do Not Track and Global Privacy Control handling.
* **Clear reports where you work.** Real-time visitors, top pages, traffic sources and countries, without leaving WordPress.

= Who is it for? =

* Website owners who want useful statistics without a third-party analytics account.
* Agencies and freelancers who manage client websites and want each site to keep its own data.
* Websites in Europe and elsewhere that pay close attention to privacy rules.

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

Simple to install, easy to understand, and built for website owners who want useful analytics without depending on a traditional external analytics platform.

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
* Conversion funnels that show where visitors drop off between your events.
* WooCommerce order attribution, revenue per acquisition channel and a ready-made purchase funnel.
* Daily, weekly or monthly email summaries.
* Content analytics directly inside WordPress content lists and the editor.
* An installable Stats App for desktop and mobile.
* Panel visibility customization for the analytics navigation.
* Additional detailed reports and analysis tools.

Learn more about Pro:

* [Pro version overview](https://bimbeau-privacy-analytics.com/pro/overview/)
* [Pro pricing](https://bimbeau-privacy-analytics.com/pricing/)

The WordPress.org Free package remains fully usable without the Pro edition.

= Documentation and support =

* [Official plugin website](https://bimbeau-privacy-analytics.com/)
* [Getting started guide](https://bimbeau-privacy-analytics.com/getting-started/)
* [Source code on GitHub](https://github.com/BimBeau/bimbeau-privacy-analytics)

= External services =

The core analytics reports use data stored in your WordPress installation. A small number of optional or account-related features can contact external services when they are explicitly configured or used.

**BimBeau GeoIP Database Service** — Used to download the optional local database for country-level geolocation. Automatic database downloads are disabled by default. A request is made only after an administrator manually requests a download/update or later enables automatic updates. The service can receive the WordPress server IP address and a technical User-Agent; visitor IP addresses are not sent to BimBeau for local GeoIP lookups.

[BimBeau GeoIP Database Service](https://github.com/BimBeau/bimbeau-geoip-database)
[BimBeau Terms of Use](https://bimbeau-privacy-analytics.com/legal/terms-of-use/)
[BimBeau Privacy Policy](https://bimbeau-privacy-analytics.com/privacy-policy/)

**Referrer favicons** — When this optional feature is enabled, the WordPress server may contact a referring website to retrieve its icon. The administrator browser uses the locally stored copy rather than requesting the icon directly from the referring website.

**MaxMind** — MaxMind API mode is optional and remains disabled until an administrator selects it and provides their own MaxMind credentials. When configured, MaxMind receives the IP address being resolved. The local GeoIP database mode does not use the MaxMind API.

[MaxMind GeoLite EULA](https://www.maxmind.com/en/geolite/eula)
[MaxMind privacy policy](https://www.maxmind.com/en/privacy-policy)

**Freemius** — The plugin can use Freemius for account, licensing, pricing, upgrade, support, uninstall, and package-related functionality. These services are separate from the analytics reports stored in WordPress.

[Freemius Terms of Service](https://freemius.com/terms/)
[Freemius Privacy Policy](https://freemius.com/privacy/)

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

For consent-based setups, configure your consent management platform (CMP) to block `bbpa-advanced-tracker` / `assets/js/bbpa-advanced-tracker.js` before consent and release it only after the visitor accepts the Analytics / Statistics category.

= Can I use BimBeau Privacy Analytics alongside Google Analytics or another analytics tool? =

Yes.

BimBeau Privacy Analytics can run alongside other analytics solutions as long as your tracking scripts, consent configuration, and privacy documentation are configured appropriately.

= Can I exclude administrators and other internal users? =

Yes.

Role exclusions can be configured so administrators, editors, contributors, or other internal roles are not included in your analytics according to your website policy.

= Can I track campaign traffic? =

Yes.

Campaign parameters, referrer information, and available acquisition signals can be used to understand traffic from campaigns, search engines, social networks, email, paid traffic, referrals, and other sources.

= Does it slow down my website? =

The essential tracker is a single script of about 8 KB once compressed by the server. It sends page views to your own website through the WordPress REST API, with no request to a third-party analytics service.

= Does it work with page caching and optimization plugins? =

Yes. Visits are recorded by the browser script, so cached pages are still counted. The tracker scripts carry the usual exclusion attributes for optimization plugins. If an optimization plugin still delays or combines them, exclude them as described in the [troubleshooting guide](https://bimbeau-privacy-analytics.com/help/common-issues/).

= Are bots and crawlers counted? =

No. Known crawlers, headless browsers, and automated clients are recognized from their User-Agent and kept out of visit, visitor, and page-view figures.

= Does it work on multisite? =

Yes. The plugin can be activated on each site or for the whole network. Each site keeps its own statistics.

= How long is data kept, and what happens when I uninstall? =

You choose the retention period in the settings, and older data is removed automatically. When you uninstall the plugin, your analytics data is kept unless you enabled **Delete plugin tables on uninstall**.

= What does the Pro edition add? =

The separate Pro edition adds advanced features such as exports, Page Details, city-level geolocation, event tracking, WordPress content analytics, the installable Stats App, and analytics panel visibility controls.

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
11. Configure role access and, with Pro, analytics panel visibility.
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
22. Pro — Choose visible panels and configure Quick Stats.

== Changelog ==

= 8.85.2 =
* Name the AI assistant of links without referrer (utm_source=chatgpt.com).
