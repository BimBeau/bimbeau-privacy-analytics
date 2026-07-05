import { ADMIN_CONFIG } from '../constants';

export const isVisitorOriginUnavailable = (
	settings = ADMIN_CONFIG?.settings
) => {
	const normalizedSettings = settings || {};
	const geoIpStatus =
		normalizedSettings.geoipDbStatus ||
		normalizedSettings.geoip_db_status ||
		null;
	const lookupMode =
		normalizedSettings.geoipLookupMode ||
		normalizedSettings.geoip_lookup_mode ||
		'local_database';

	if ( lookupMode !== 'local_database' ) {
		return false;
	}

	if ( ! geoIpStatus || geoIpStatus.known !== true ) {
		return false;
	}

	return geoIpStatus.operational !== true;
};
