/**
 * Page paths come from tracked hits (the public hit endpoint accepts any
 * visitor input) and from the bbpa_detail_page query argument of a deep link.
 * Only a path of the current site may become a link or select a page.
 */

/**
 * Whether a value is a path of the current site: one leading slash, no
 * backslash (browsers read `/\host` as `//host`), not protocol-relative.
 *
 * @param {*} pagePath Candidate page path.
 * @return {boolean} True for a site-relative path.
 */
export const isSiteRelativePagePath = ( pagePath ) =>
	typeof pagePath === 'string' &&
	pagePath.startsWith( '/' ) &&
	! pagePath.startsWith( '//' ) &&
	! pagePath.includes( '\\' );

/**
 * Resolve a page path to an absolute URL of the given origin.
 *
 * @param {*}      pagePath Page path, for example `/pricing/`.
 * @param {string} origin   Origin of the site, for example `https://example.com`.
 * @return {string} The URL, or an empty string when the path would leave the origin.
 */
export const getSameOriginPageUrl = ( pagePath, origin ) => {
	if ( ! origin || ! isSiteRelativePagePath( pagePath ) ) {
		return '';
	}

	try {
		const expectedOrigin = new URL( origin ).origin;
		const url = new URL( pagePath, expectedOrigin );

		// URL parsing drops tabs and newlines: check the result, not only the input.
		if (
			url.origin !== expectedOrigin ||
			( url.protocol !== 'http:' && url.protocol !== 'https:' )
		) {
			return '';
		}

		return url.toString();
	} catch {
		return '';
	}
};
