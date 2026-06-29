import { __, sprintf } from '@wordpress/i18n';

export const DEFAULT_HEATMAP_THEME_COLOR = 'rgb(56, 88, 233)';
export const HEATMAP_THEME_COLOR_PROPERTY = '--color-3';

export const PAGE_DETAILS_HEATMAP_HOURS = Array.from(
	{ length: 24 },
	( _, hour ) => hour
);

export const formatPageDetailsHeatmapHour = ( hour ) =>
	`${ String( hour ).padStart( 2, '0' ) }:00`;

export const PAGE_DETAILS_HEATMAP_DAYS = [
	{
		value: 1,
		key: 'monday',
		label: __( 'Monday', 'bimbeau-privacy-analytics' ),
		shortLabel: __( 'Mon', 'bimbeau-privacy-analytics' ),
	},
	{
		value: 2,
		key: 'tuesday',
		label: __( 'Tuesday', 'bimbeau-privacy-analytics' ),
		shortLabel: __( 'Tue', 'bimbeau-privacy-analytics' ),
	},
	{
		value: 3,
		key: 'wednesday',
		label: __( 'Wednesday', 'bimbeau-privacy-analytics' ),
		shortLabel: __( 'Wed', 'bimbeau-privacy-analytics' ),
	},
	{
		value: 4,
		key: 'thursday',
		label: __( 'Thursday', 'bimbeau-privacy-analytics' ),
		shortLabel: __( 'Thu', 'bimbeau-privacy-analytics' ),
	},
	{
		value: 5,
		key: 'friday',
		label: __( 'Friday', 'bimbeau-privacy-analytics' ),
		shortLabel: __( 'Fri', 'bimbeau-privacy-analytics' ),
	},
	{
		value: 6,
		key: 'saturday',
		label: __( 'Saturday', 'bimbeau-privacy-analytics' ),
		shortLabel: __( 'Sat', 'bimbeau-privacy-analytics' ),
	},
	{
		value: 7,
		key: 'sunday',
		label: __( 'Sunday', 'bimbeau-privacy-analytics' ),
		shortLabel: __( 'Sun', 'bimbeau-privacy-analytics' ),
	},
];

export const buildPageDetailsHeatmapData = ( items = [] ) => {
	const dayLabels = PAGE_DETAILS_HEATMAP_DAYS.reduce(
		( acc, day ) => ( {
			...acc,
			[ day.key ]: day.label,
		} ),
		{}
	);
	const dayShortLabels = PAGE_DETAILS_HEATMAP_DAYS.reduce(
		( acc, day ) => ( {
			...acc,
			[ day.key ]: day.shortLabel,
		} ),
		{}
	);
	const days = PAGE_DETAILS_HEATMAP_DAYS.map( ( day ) => day.key );
	const valuesByDayHour = new Map();
	let maxValue = 0;

	items.forEach( ( item ) => {
		const dayOfWeek = Number( item?.dayOfWeek );
		const hour = Number( item?.hour );
		const value = Number( item?.value ) || 0;
		const day = PAGE_DETAILS_HEATMAP_DAYS.find(
			( weekday ) => weekday.value === dayOfWeek
		)?.key;

		if ( ! day || Number.isNaN( hour ) || hour < 0 || hour > 23 ) {
			return;
		}

		valuesByDayHour.set( `${ day }|${ hour }`, value );
		maxValue = Math.max( maxValue, value );
	} );

	const data = PAGE_DETAILS_HEATMAP_HOURS.map( ( hour ) => ( {
		id: formatPageDetailsHeatmapHour( hour ),
		data: days.map( ( day ) => ( {
			x: day,
			y: valuesByDayHour.get( `${ day }|${ hour }` ) ?? 0,
		} ) ),
	} ) );

	return {
		data,
		days,
		dayLabels,
		dayShortLabels,
		maxValue,
	};
};

export const normalizePageDetailsHourlyItems = ( items ) => {
	if ( ! Array.isArray( items ) ) {
		return [];
	}

	return items.map( ( item ) => ( {
		dayOfWeek: Number( item?.dayOfWeek ?? item?.day_of_week ),
		hour: Number( item?.hour ),
		value: Number( item?.value ) || 0,
	} ) );
};

export const getPageDetailsHourlyAvailability = ( payload ) => {
	const explicitFlag = payload?.hourlyAvailable ?? payload?.hourly_available;

	if ( typeof explicitFlag === 'boolean' ) {
		return explicitFlag;
	}

	return normalizePageDetailsHourlyItems( payload?.items ).length > 0;
};

export const getPageDetailsHourlyUnavailableReason = ( payload ) =>
	payload?.hourlyUnavailableReason ||
	payload?.hourly_unavailable_reason ||
	'';

export const getPageDetailsHeatmapEmptyLabel = (
	source,
	hourlyUnavailableReason = ''
) => {
	if (
		source === '404s' ||
		hourlyUnavailableReason === 'source_not_compatible'
	) {
		return __(
			'Hourly heatmaps are unavailable for pages not found (404).',
			'bimbeau-privacy-analytics'
		);
	}

	if ( hourlyUnavailableReason === 'feature_disabled' ) {
		return __(
			'Hourly heatmaps are disabled by the bbpa_hourly_aggregation_enabled filter.',
			'bimbeau-privacy-analytics'
		);
	}

	if ( hourlyUnavailableReason === 'table_missing' ) {
		return __(
			'Hourly heatmaps are unavailable because the hourly aggregation table is missing.',
			'bimbeau-privacy-analytics'
		);
	}

	return __(
		'Hourly heatmaps require hourly page aggregation data for the selected source.',
		'bimbeau-privacy-analytics'
	);
};

export const formatPageDetailsHeatmapTooltip = ( {
	day,
	hour,
	metricLabel,
	value,
	numberFormatter,
} ) =>
	sprintf(
		/* translators: 1: calendar day, 2: hour label, 3: metric label, 4: metric count */
		__( '%1$s at %2$s — %3$s: %4$s', 'bimbeau-privacy-analytics' ),
		day,
		formatPageDetailsHeatmapHour( hour ),
		metricLabel,
		numberFormatter.format( value )
	);

const parseRgbChannel = ( value ) => {
	const numericValue = Number.parseFloat( value );

	if ( Number.isNaN( numericValue ) ) {
		return null;
	}

	return Math.round( Math.min( 255, Math.max( 0, numericValue ) ) );
};

const parseColorChannels = ( color ) => {
	if ( typeof color !== 'string' ) {
		return null;
	}

	const normalizedColor = color.trim().toLowerCase();
	const rgbMatch = normalizedColor.match(
		/^rgba?\(\s*([0-9.]+)(?:\s*,\s*|\s+)([0-9.]+)(?:\s*,\s*|\s+)([0-9.]+)/
	);

	if ( rgbMatch ) {
		const channels = rgbMatch.slice( 1, 4 ).map( parseRgbChannel );

		if ( channels.some( ( channel ) => channel === null ) ) {
			return null;
		}

		return channels;
	}

	const hexMatch = normalizedColor.match( /^#([0-9a-f]{3}|[0-9a-f]{6})$/i );

	if ( ! hexMatch ) {
		return null;
	}

	const [ hex ] = hexMatch.slice( 1 );
	const fullHex =
		hex.length === 3
			? `${ hex[ 0 ] }${ hex[ 0 ] }${ hex[ 1 ] }${ hex[ 1 ] }${ hex[ 2 ] }${ hex[ 2 ] }`
			: hex;

	return [
		Number.parseInt( fullHex.slice( 0, 2 ), 16 ),
		Number.parseInt( fullHex.slice( 2, 4 ), 16 ),
		Number.parseInt( fullHex.slice( 4, 6 ), 16 ),
	];
};

const formatRgbColor = ( channels ) =>
	`rgb(${ channels
		.map( ( channel ) => Math.round( channel ) )
		.join( ', ' ) })`;

const mixColorWithWhite = ( channels, colorWeight ) => {
	const whiteWeight = 1 - colorWeight;

	return channels.map(
		( channel ) => channel * colorWeight + 255 * whiteWeight
	);
};

export const buildHeatmapThemeColorRange = ( baseColor ) => {
	const channels =
		parseColorChannels( baseColor ) ||
		parseColorChannels( DEFAULT_HEATMAP_THEME_COLOR );
	const colorWeights = [ 0.08, 0.18, 0.32, 0.5, 0.72, 1 ];

	return colorWeights.map( ( colorWeight ) =>
		formatRgbColor( mixColorWithWhite( channels, colorWeight ) )
	);
};

const interpolateColorChannels = ( startChannels, endChannels, progress ) =>
	startChannels.map(
		( startChannel, index ) =>
			startChannel + ( endChannels[ index ] - startChannel ) * progress
	);

export const buildHeatmapThemeColorInterpolator = ( baseColor ) => {
	const colorRange = buildHeatmapThemeColorRange( baseColor );
	const colorChannels = colorRange.map( parseColorChannels );
	const maxIndex = colorChannels.length - 1;

	return ( value ) => {
		const normalizedValue = Math.min(
			1,
			Math.max( 0, Number( value ) || 0 )
		);
		const scaledValue = normalizedValue * maxIndex;
		const startIndex = Math.floor( scaledValue );
		const endIndex = Math.min( maxIndex, startIndex + 1 );
		const progress = scaledValue - startIndex;

		return formatRgbColor(
			interpolateColorChannels(
				colorChannels[ startIndex ],
				colorChannels[ endIndex ],
				progress
			)
		);
	};
};

const toRelativeLuminance = ( channel ) => {
	const normalized = channel / 255;

	if ( normalized <= 0.03928 ) {
		return normalized / 12.92;
	}

	return ( ( normalized + 0.055 ) / 1.055 ) ** 2.4;
};

export const getHeatmapLabelTextColor = ( cellColor ) => {
	const channels = parseColorChannels( cellColor );

	if ( ! channels ) {
		return 'rgba(15, 23, 42, 0.86)';
	}

	const [ red, green, blue ] = channels;
	const luminance =
		0.2126 * toRelativeLuminance( red ) +
		0.7152 * toRelativeLuminance( green ) +
		0.0722 * toRelativeLuminance( blue );

	return luminance < 0.44
		? 'rgba(248, 250, 252, 0.96)'
		: 'rgba(15, 23, 42, 0.86)';
};
