=== BimBeau Privacy Analytics ===
Contributors: BimBeau
Tags: analytics, privacy, statistics, traffic, self-hosted
Requires at least: 6.4
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 8.45.181
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

Self-hosted WordPress analytics with real-time traffic insights, privacy controls, and data stored in your own database.

== Description ==

= Self-hosted analytics inside WordPress =

Understand your audience without sending analytics data to an external analytics platform. BimBeau Privacy Analytics stores analytics data in your site's own WordPress database and presents clear, real-time reports in the WordPress dashboard.

See the traffic information that matters at a glance:

* Visits, page views, recent activity, and active visitors in real time.
* Top pages, content trends, average time on page, internal searches, and 404 errors.
* Referring websites and acquisition sources such as search, social, email, campaigns, and AI assistants when the relevant data is available.
* Devices, browsers, operating systems, and screen sizes when available.
* Country-level geolocation when a local GeoIP database or the MaxMind API is configured.

= Included in the Free plugin =

The WordPress.org plugin provides its Free analytics features without a license, payment, quota, or time limit. No third-party analytics account is required, and every analytics panel included in the Free edition is available without local locked controls or placeholders.

The Free plugin also provides configurable data retention, optional Do Not Track and Global Privacy Control handling, role exclusions, and optional debug logging. The package may load Freemius for account, pricing, upgrade, support, uninstall, and package identity flows. The separate Pro edition replaces the Free plugin when installed.

= Privacy and consent =

BimBeau Privacy Analytics supports two levels of measurement so site owners can match tracking to their configuration and legal context:

* Essential statistics use the base tracker, which is intended for conditions where consent exemption applies.
* Advanced statistics use a separate enriched tracker that may require prior consent depending on local rules and site configuration.

For consent-based setups, configure your consent management platform (CMP) to block `bbpa-advanced-tracker` / `assets/js/bbpa-advanced-tracker.js` before consent and release it only after the visitor accepts the Analytics / Statistics category. The plugin does not provide a consent banner, decide whether consent is granted, or store consent records.

BimBeau Privacy Analytics does not make a website GDPR-compliant by itself. Site owners remain responsible for their legal basis, privacy policy, CMP configuration, consent records, and any other compliance requirements that apply to their website.

BimBeau Privacy Analytics does not use tracking cookies or cross-site advertising identifiers. Essential tracking may use a temporary first-party browser storage identifier to group activity into a bounded visitor row, prevent technical duplicate transport hits, and produce aggregated or anonymized audience statistics. This identifier expires according to the Visitor activity window setting and is not used for advertising, cross-site tracking, or visitor profiling.

= Pro edition =

BimBeau Privacy Analytics Pro is a separate edition for users who need more detailed analysis, export workflows, event tracking, app-like analytics access, or admin customization. It is not required to use the Free plugin.

Depending on the active license, site configuration, consent setup, and available analytics data, Pro can add:

* Analytics exports for supported reports.
* Page Details for deeper page-level analysis.
* City geolocation reports and map markers when usable city data is available.
* Event tracking and event configuration.
* Content analytics in WordPress content lists and the editor.
* An installable stats app for site analytics.
* White-label admin header controls.
* Panel visibility customization for the analytics navigation.
* Additional detailed reports when licensed features are active and the required data is available.

Learn more about Pro:

* [Pro version overview](https://bimbeau.fr/bimbeau-privacy-analytics/en/pro/overview/)
* [Pro pricing](https://bimbeau.fr/bimbeau-privacy-analytics/en/pricing/)

The WordPress.org Free package does not embed Pro-only report surfaces as local feature locks or disabled placeholders. Upgrade links point to the separate Pro edition hosted outside WordPress.org.

= External services =

The core analytics reports use data stored in WordPress. The following optional features can contact external services only in the circumstances described below.

= BimBeau GeoIP Database Service =

The optional local GeoIP database provides country-level geolocation reports while lookups remain inside the WordPress installation. Automatic database downloads are disabled by default. Plugin activation, opening the dashboard, and opening the configuration assistant do not contact this service.

The service is contacted only after an administrator clicks the manual database install/update action (including the explicit assistant action), or after an administrator later enables an automatic update frequency. It receives the WordPress server IP address as seen by the service and a technical User-Agent. The updater User-Agent does not include the site URL. Local IP lookups do not transmit visitor IP addresses to BimBeau.

[BimBeau GeoIP Database Service](https://github.com/BimBeau/bimbeau-geoip-database)
[BimBeau Terms of Use](https://bimbeau.fr/bimbeau-privacy-analytics/en/legal/terms-of-use/)
[BimBeau Privacy Policy](https://bimbeau.fr/bimbeau-privacy-analytics/en/privacy-policy/)

= Referrer favicon retrieval =

Referrer favicons are an optional visual feature. They are disabled until an administrator enables them in the first configuration assistant or General settings. When enabled, the WordPress server can contact a referrer domain to retrieve an icon; the domain can see the server IP address and a generic technical User-Agent. The User-Agent contains no site URL.

The administrator browser never requests a favicon from a referrer domain. The plugin validates and stores only ICO, PNG, JPEG, WebP, or strictly sanitized passive SVG files in local WordPress uploads storage and returns only that local URL to the admin interface. Safe static inline SVG styles are converted to direct presentation attributes before storage; active content, unknown style properties, and external resources are rejected. The feature can be disabled at any time; reports then use a local generic icon and make no favicon requests.

= MaxMind =

MaxMind API mode is disabled until an administrator manually selects it and supplies a MaxMind Account ID and License Key. A lookup is sent only while that configured mode is resolving an IP address. MaxMind receives the IP address being resolved, the account credentials in an Authorization header, and a technical User-Agent containing only the plugin name and version. The User-Agent contains no site URL or domain. Local database mode does not use the MaxMind API and does not send visitor IP addresses to MaxMind. See the MaxMind GeoLite EULA and privacy policy before configuring this service.

[MaxMind GeoLite EULA](https://www.maxmind.com/en/geolite/eula)
[MaxMind privacy policy](https://www.maxmind.com/en/privacy-policy)

= Documentation and support =

* [Official plugin website](https://bimbeau.fr/bimbeau-privacy-analytics/en/)
* [Getting started guide](https://bimbeau.fr/bimbeau-privacy-analytics/en/getting-started/)

= Debug logging =

Debug mode is the authoritative plugin switch for diagnostic logging. BimBeau Privacy Analytics writes diagnostics only when Debug mode is enabled and a WordPress debug log destination (`WP_DEBUG` + `WP_DEBUG_LOG`) or an explicit BimBeau Privacy Analytics safe sink is available.

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/`.
2. Activate **BimBeau Privacy Analytics** through the **Plugins** screen in WordPress.
3. Open **BimBeau Privacy Analytics** in the WordPress admin menu. Eligible new installations open the first configuration assistant once.
4. Choose essential statistics only or enable advanced statistics. If you enable advanced tracking where prior consent is required, configure your CMP to control `bbpa-advanced-tracker` / `assets/js/bbpa-advanced-tracker.js`.
5. Choose whether to manually download the local GeoIP database. This explicit action keeps automatic GeoIP updates disabled; geolocation can also be configured later.
6. Choose whether to enable optional referrer favicons. When disabled, reports use a local generic icon and do not contact referrer domains.
7. Finish the assistant, then review retention, DNT/GPC handling, role exclusions, geolocation, and debug options. All assistant choices can be changed later in settings.

== Frequently Asked Questions ==

= Who is BimBeau Privacy Analytics for? =

BimBeau Privacy Analytics is designed for WordPress site owners who want useful audience statistics without sending their analytics data to an external analytics platform.

It is suitable for publishers, businesses, agencies, freelancers, and privacy-conscious websites that prefer self-hosted analytics inside WordPress.

= What can I measure with BimBeau Privacy Analytics? =

BimBeau Privacy Analytics helps you measure visits, page views, traffic sources, top pages, referrers, devices, internal searches, 404 errors, country-level geolocation, visitors, and real-time activity.

Some enriched details depend on the available data, tracking configuration, consent setup, and site configuration.

= Does BimBeau Privacy Analytics use cookies? =

BimBeau Privacy Analytics does not use tracking cookies or cross-site advertising identifiers.

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

= 8.45.181 =
* Fixes — Fix Free package readme validation after the WordPress.org listing restructure.
