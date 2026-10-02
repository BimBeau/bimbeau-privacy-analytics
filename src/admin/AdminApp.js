/**
 * Free admin application shell for BimBeau Privacy Analytics.
 */

import { ADMIN_CONFIG } from './constants';
import AdminAppCore from './AdminAppCore';

export const FreeHeaderBrand = ( { label } ) => {
	const logoUrl = ADMIN_CONFIG?.settings?.brandLogoUrl || '';

	// A missing logo URL (payload changed by another script) falls back to
	// the text title instead of replacing the whole admin with an error.
	if ( ! logoUrl ) {
		return label;
	}

	return (
		<img
			className="bbpa-admin-app__brand-logo"
			data-bbpa-branding-runtime="bbpa-free-admin-header"
			src={ logoUrl }
			alt={ label }
		/>
	);
};

const FreeAdminApp = () => (
	<AdminAppCore HeaderBrand={ FreeHeaderBrand } />
);

export default FreeAdminApp;
