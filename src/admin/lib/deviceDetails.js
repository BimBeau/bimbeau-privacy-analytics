import { formatScreenResolution } from './formatScreenResolution';

/**
 * Number of visitors read from /visitors to build the browser, system, device
 * and resolution breakdowns. The rows are the most active visitors of the
 * range (sorted by page views), so the breakdowns are a sample when the range
 * has more visitors.
 */
export const DEVICE_DETAILS_VISITOR_SAMPLE_SIZE = 500;

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

/**
 * Page views of the robots read from /visitors (visitor_type=bot).
 *
 * @param {Array} robots Bot visitor rows.
 * @return {number} Sum of their page views.
 */
export const sumRobotPageViews = ( robots = [] ) =>
	( Array.isArray( robots ) ? robots : [] ).reduce( ( total, item ) => {
		const hits = Number( item?.page_views || 0 );

		return Number.isFinite( hits ) && hits > 0 ? total + hits : total;
	}, 0 );

/**
 * Device items with a robot row appended, shares recomputed over the human and
 * robot page views. The robot row stays last whatever its size, so the human
 * device order does not change when it is shown.
 *
 * @param {Array}  devices   Human device items ({ label, hits, share }).
 * @param {number} robotHits Robot page views.
 * @return {Array} Device items, the robot one flagged with isRobot.
 */
export const withRobotDeviceItem = ( devices = [], robotHits = 0 ) => {
	const humanItems = ( Array.isArray( devices ) ? devices : [] ).filter(
		( item ) => String( item?.label || '' ).toLowerCase() !== 'bot'
	);
	const safeRobotHits =
		Number.isFinite( robotHits ) && robotHits > 0 ? robotHits : 0;
	const total =
		humanItems.reduce(
			( sum, item ) => sum + ( Number( item?.hits ) || 0 ),
			0
		) + safeRobotHits;
	const toShare = ( hits ) =>
		total > 0 ? Math.round( ( hits / total ) * 100 ) : 0;

	return [
		...humanItems.map( ( item ) => ( {
			...item,
			share: toShare( Number( item?.hits ) || 0 ),
		} ) ),
		{
			label: 'bot',
			hits: safeRobotHits,
			share: toShare( safeRobotHits ),
			isRobot: true,
		},
	];
};
