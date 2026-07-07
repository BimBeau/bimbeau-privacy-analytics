import { formatScreenResolution } from './formatScreenResolution';

const UNKNOWN_LABELS = new Set( [
	'unknown',
	'null',
	'non déterminé',
	'non determine',
	'non déterminée',
	'non determinee',
] );

const normalizeLabel = ( value, fallback = 'Unknown' ) => {
	if ( typeof value !== 'string' ) {
		return fallback;
	}

	const trimmed = value.trim();
	return trimmed === '' ? fallback : trimmed;
};

export const isUnidentifiedDeviceDetailLabel = ( value ) => {
	if ( value === null || typeof value === 'undefined' ) {
		return true;
	}

	const normalized = String( value ).trim().toLocaleLowerCase();

	return normalized === '' || UNKNOWN_LABELS.has( normalized );
};

const addIdentifiedHits = ( map, label, hits ) => {
	if ( isUnidentifiedDeviceDetailLabel( label ) ) {
		return;
	}

	map.set( label, ( map.get( label ) || 0 ) + hits );
};

const toPercentItems = ( map ) => {
	const identifiedTotal = Array.from( map.values() ).reduce(
		( total, hits ) => total + hits,
		0
	);

	return {
		identifiedTotal,
		items: Array.from( map.entries() )
			.map( ( [ label, hits ] ) => ( {
				label,
				hits,
				share:
					identifiedTotal > 0
						? Math.round( ( hits / identifiedTotal ) * 100 )
						: 0,
			} ) )
			.sort(
				( left, right ) =>
					right.hits - left.hits ||
					left.label.localeCompare( right.label )
			),
	};
};

export const buildDeviceDetailsBreakdowns = ( visitors = [] ) => {
	const deviceMap = new Map();
	const osMap = new Map();
	const browserMap = new Map();
	const resolutionMap = new Map();
	const browserVersionMap = new Map();
	let totalHits = 0;

	visitors.forEach( ( item ) => {
		const hits = Number.isFinite( item?.page_views )
			? item.page_views
			: Number( item?.page_views || 0 );
		if ( hits <= 0 ) {
			return;
		}

		totalHits += hits;
		const deviceLabel = normalizeLabel( item?.device_class );
		const osLabel = normalizeLabel( item?.operating_system );
		const browserLabel = normalizeLabel( item?.browser );
		const resolutionLabel = normalizeLabel(
			formatScreenResolution( item?.screen_resolution )
		);
		const browserVersion = normalizeLabel( item?.browser_version, '' );

		addIdentifiedHits( deviceMap, deviceLabel, hits );
		addIdentifiedHits( osMap, osLabel, hits );
		addIdentifiedHits( browserMap, browserLabel, hits );
		addIdentifiedHits( resolutionMap, resolutionLabel, hits );

		if (
			browserVersion &&
			! isUnidentifiedDeviceDetailLabel( browserLabel ) &&
			! isUnidentifiedDeviceDetailLabel( browserVersion )
		) {
			const browserKey = `${ browserLabel } ${ browserVersion }`;
			browserVersionMap.set(
				browserKey,
				( browserVersionMap.get( browserKey ) || 0 ) + hits
			);
		}
	} );

	const devices = toPercentItems( deviceMap );
	const operatingSystems = toPercentItems( osMap );
	const browsers = toPercentItems( browserMap );
	const resolutions = toPercentItems( resolutionMap );
	const browserVersions = toPercentItems( browserVersionMap );

	return {
		totalHits,
		devices: devices.items,
		devicesIdentifiedTotal: devices.identifiedTotal,
		operatingSystems: operatingSystems.items,
		operatingSystemsIdentifiedTotal: operatingSystems.identifiedTotal,
		browsers: browsers.items,
		browsersIdentifiedTotal: browsers.identifiedTotal,
		resolutions: resolutions.items,
		resolutionsIdentifiedTotal: resolutions.identifiedTotal,
		browserVersions: browserVersions.items,
		browserVersionsIdentifiedTotal: browserVersions.identifiedTotal,
	};
};
