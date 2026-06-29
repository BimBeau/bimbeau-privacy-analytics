import { formatScreenResolution } from './formatScreenResolution';

const normalizeLabel = ( value, fallback = 'Unknown' ) => {
	if ( typeof value !== 'string' ) {
		return fallback;
	}

	const trimmed = value.trim();
	return trimmed === '' ? fallback : trimmed;
};

const toPercentItems = ( map, total ) => {
	return Array.from( map.entries() )
		.map( ( [ label, hits ] ) => ( {
			label,
			hits,
			share: total > 0 ? Math.round( ( hits / total ) * 100 ) : 0,
		} ) )
		.sort( ( left, right ) => right.hits - left.hits || left.label.localeCompare( right.label ) );
};

export const buildDeviceDetailsBreakdowns = ( visitors = [] ) => {
	const deviceMap = new Map();
	const osMap = new Map();
	const browserMap = new Map();
	const resolutionMap = new Map();
	const browserVersionMap = new Map();
	let totalHits = 0;

	visitors.forEach( ( item ) => {
		const hits = Number.isFinite( item?.page_views ) ? item.page_views : Number( item?.page_views || 0 );
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

		deviceMap.set( deviceLabel, ( deviceMap.get( deviceLabel ) || 0 ) + hits );
		osMap.set( osLabel, ( osMap.get( osLabel ) || 0 ) + hits );
		browserMap.set( browserLabel, ( browserMap.get( browserLabel ) || 0 ) + hits );
		resolutionMap.set(
			resolutionLabel,
			( resolutionMap.get( resolutionLabel ) || 0 ) + hits
		);

		if ( browserVersion ) {
			const browserKey = `${ browserLabel } ${ browserVersion }`;
			browserVersionMap.set(
				browserKey,
				( browserVersionMap.get( browserKey ) || 0 ) + hits
			);
		}
	} );

	return {
		totalHits,
		devices: toPercentItems( deviceMap, totalHits ),
		operatingSystems: toPercentItems( osMap, totalHits ),
		browsers: toPercentItems( browserMap, totalHits ),
		resolutions: toPercentItems( resolutionMap, totalHits ),
		browserVersions: toPercentItems( browserVersionMap, totalHits ),
	};
};
