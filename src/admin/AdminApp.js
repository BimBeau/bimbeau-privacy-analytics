/**
 * Free admin application shell for BimBeau Privacy Analytics.
 */

import { ADMIN_CONFIG } from './constants';
import AdminAppCore from './AdminAppCore';

export const FreeHeaderBrand = ( { label } ) => {
	const logoUrl = ADMIN_CONFIG?.settings?.brandLogoUrl || '';

	if ( ! logoUrl ) {
		throw new Error( 'Missing BPA admin header logo URL.' );
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
