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

/**
 * Page views of one /visitors/breakdowns dimension, keyed by label. Unidentified labels are left out.
 *
 * @param {Array}    rows     Dimension rows ({ label, page_views }).
 * @param {Function} getLabel Display label of a row.
 * @return {Map} Page views by label.
 */
const sumDimensionHits = ( rows, getLabel ) => {
	const map = new Map();

	( Array.isArray( rows ) ? rows : [] ).forEach( ( row ) => {
		const hits = Number( row?.page_views ) || 0;
		if ( hits > 0 ) {
			addIdentifiedHits( map, getLabel( row ), hits );
		}
	} );

	return map;
};

/**
 * Browser, operating system, device, resolution and browser version breakdowns from the
 * GET /visitors/breakdowns totals, which cover every visitor of the range. Shares are computed
 * over the page views with an identified label; `totalHits` counts the page views of every visitor.
 *
 * @param {Object} payload /visitors/breakdowns response ({ totals, breakdowns }).
 * @return {Object} Breakdown items and identified totals.
 */
export const buildDeviceDetailsBreakdowns = ( payload ) => {
	const breakdowns = payload?.breakdowns || {};
	const devices = toPercentItems(
		sumDimensionHits( breakdowns.device_class, ( row ) => normalizeLabel( row?.label ) )
	);
	const operatingSystems = toPercentItems(
		sumDimensionHits( breakdowns.operating_system, ( row ) => normalizeLabel( row?.label ) )
	);
	const browsers = toPercentItems(
		sumDimensionHits( breakdowns.browser, ( row ) => normalizeLabel( row?.label ) )
	);
	const resolutions = toPercentItems(
		sumDimensionHits( breakdowns.screen_resolution, ( row ) =>
			normalizeLabel( formatScreenResolution( row?.label ) )
		)
	);
	const browserVersions = toPercentItems(
		sumDimensionHits( breakdowns.browser_version, ( row ) => {
			const browserLabel = normalizeLabel( row?.browser );
			const browserVersion = normalizeLabel( row?.label, '' );

			return isUnidentifiedDeviceDetailLabel( browserLabel ) ||
				isUnidentifiedDeviceDetailLabel( browserVersion )
				? ''
				: `${ browserLabel } ${ browserVersion }`;
		} )
	);
	const totalHits = Number( payload?.totals?.pageViews );

	return {
		totalHits: Number.isFinite( totalHits ) && totalHits > 0 ? totalHits : 0,
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
 * Robot totals of a /visitors/breakdowns response requested with visitor_type=bot.
 *
 * @param {Object} payload Bot /visitors/breakdowns response.
 * @return {{hits: number, robots: number}} Robot page views and number of robots.
 */
export const getRobotTotals = ( payload ) => {
	const hits = Number( payload?.totals?.pageViews );
	const robots = Number( payload?.totals?.visitors );

	return {
		hits: Number.isFinite( hits ) && hits > 0 ? hits : 0,
		robots: Number.isFinite( robots ) && robots > 0 ? robots : 0,
	};
};

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
