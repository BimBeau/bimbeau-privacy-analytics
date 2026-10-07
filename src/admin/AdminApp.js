/**
 * Free admin application shell for BimBeau Privacy Analytics.
 */

import AdminAppCore from './AdminAppCore';

/**
 * Admin header title: the localized "Statistics" label in Free and Pro. The data attribute is the
 * edition signature checked in the built bundle (scripts/verify-admin-bundle-sync.js).
 *
 * @param {Object} props
 * @param {string} props.label Localized plugin label.
 */
export const FreeHeaderBrand = ( { label } ) => (
	<span
		className="bbpa-admin-app__brand-title"
		data-bbpa-branding-runtime="bbpa-free-admin-header"
	>
		{ label }
	</span>
);

const FreeAdminApp = () => (
	<AdminAppCore HeaderBrand={ FreeHeaderBrand } />
);

export default FreeAdminApp;
