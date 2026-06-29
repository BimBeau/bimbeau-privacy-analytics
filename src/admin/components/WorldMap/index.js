import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from '@wordpress/element';
import {
	Button,
	Tooltip,
	VisuallyHidden,
} from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';
import { Choropleth, projectionById } from '@nivo/geo';
import { scaleQuantize, scaleThreshold } from 'd3-scale';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import { createLogger } from '../../logger';
import DataState from '../DataState';
import BpaCard from '../BpaCard';
import { ADMIN_CONFIG } from '../../constants';
import {
	getCountryFlagClass,
	isUnknownCountryCode,
} from '../../lib/countryNames';
import {
	buildHeatmapThemeColorRange,
	DEFAULT_HEATMAP_THEME_COLOR,
	HEATMAP_THEME_COLOR_PROPERTY,
} from '../../lib/pageDetailsHeatmap';
import { getLocationLabel } from '../../lib/locationLabel';
import worldGeo from '../../data/world-countries.geojson';

const MAX_LEGEND_ITEMS = 5;
const MAX_DATA_BUCKETS = MAX_LEGEND_ITEMS - 1;
const DEFAULT_MAP_COLOR_RANGE = buildHeatmapThemeColorRange(
	DEFAULT_HEATMAP_THEME_COLOR
);
const NO_DATA_COLOR = '#eeeeee';
const DEFAULT_COUNTRY_STROKE_COLOR = '#ffffff';
const MAP_ACCENT_COLOR = 'var(--color-3)';
const CITY_MARKER_FILL_COLOR = MAP_ACCENT_COLOR;
const CITY_MARKER_MIN_RADIUS = 3;
const CITY_MARKER_MAX_RADIUS = 16;
const CITY_MARKER_MIN_OPACITY = 0.35;
const CITY_MARKER_MAX_OPACITY = 0.9;
const CITY_MARKER_MIN_PULSE_SCALE = 1.04;
const CITY_MARKER_MAX_PULSE_SCALE = 1.18;
const FALLBACK_MAP_WIDTH = 960;
const FALLBACK_MAP_HEIGHT = 420;
const VIEWPORT_ZOOM_MIN = 1;
const VIEWPORT_ZOOM_MAX = 24;
const VIEWPORT_ZOOM_STEP = 1;
const DEFAULT_PROJECTION_TRANSLATION = {
	x: 0.5,
	y: 0.5,
};
const NIVO_FEATURE_LAYER_SELECTOR = 'g.nivo-geo-features';
const LEGEND_LAYER_ATTRIBUTE = 'data-bbpa-world-map-role';
const LEGEND_LAYER_VALUE = 'legend';
const clamp = ( value, min, max ) => Math.min( max, Math.max( min, value ) );
const DEBUG_FLAG = () =>
	Boolean( window.BBPA_DEBUG ?? ADMIN_CONFIG?.settings?.debugEnabled );
const MARKER_MAP_MODES = new Set( [ 'cities', 'realtime-markers' ] );
const isMarkerMapMode = ( mapMode ) => MARKER_MAP_MODES.has( mapMode );
const REALTIME_MARKER_AUTO_FOCUS_PADDING_RATIO = 0.28;
const REALTIME_MARKER_SINGLE_POINT_SPAN_RATIO = 0.34;
const REALTIME_MARKER_SINGLE_POINT_TARGET_SCALE = 2.25;

const resolveMapCssColor = ( color ) => {
	if ( typeof document === 'undefined' || ! document.body ) {
		return color;
	}

	const probe = document.createElement( 'span' );
	probe.style.color = color;
	document.body.appendChild( probe );
	const resolvedColor = window.getComputedStyle( probe ).color;
	probe.remove();

	return resolvedColor || color;
};

const resolveMapThemeColor = () => {
	if ( typeof window === 'undefined' || typeof document === 'undefined' ) {
		return DEFAULT_HEATMAP_THEME_COLOR;
	}

	const themeColor = window
		.getComputedStyle( document.documentElement )
		.getPropertyValue( HEATMAP_THEME_COLOR_PROPERTY )
		.trim();

	return resolveMapCssColor( themeColor || DEFAULT_HEATMAP_THEME_COLOR );
};

const getBaseProjectionScale = ( width, height ) => {
	if ( width <= 0 || height <= 0 ) {
		return 130;
	}

	const widthDrivenScale = width / 6.7;
	const heightDrivenScale = height / 2.95;

	return Math.max(
		110,
		Math.min( 460, Math.max( widthDrivenScale, heightDrivenScale ) )
	);
};

const clampViewportAxis = ( value, min, max ) => {
	if ( min > max ) {
		return ( min + max ) / 2;
	}

	return clamp( value, min, max );
};

export const clampViewportToMapBounds = (
	nextViewport,
	mapWidth,
	mapHeight,
	mapContentBounds
) => {
	const width = Math.max( 0, Number( mapWidth ) || 0 );
	const height = Math.max( 0, Number( mapHeight ) || 0 );
	const scale = clamp(
		Number( nextViewport?.scale ) || VIEWPORT_ZOOM_MIN,
		VIEWPORT_ZOOM_MIN,
		VIEWPORT_ZOOM_MAX
	);

	if ( width <= 0 || height <= 0 ) {
		return {
			scale,
			translateX: Number( nextViewport?.translateX ) || 0,
			translateY: Number( nextViewport?.translateY ) || 0,
		};
	}

	const hasMeasuredBounds =
		mapContentBounds &&
		Number.isFinite( mapContentBounds.left ) &&
		Number.isFinite( mapContentBounds.right ) &&
		Number.isFinite( mapContentBounds.top ) &&
		Number.isFinite( mapContentBounds.bottom );

	const minTranslateX = hasMeasuredBounds
		? width - mapContentBounds.right * scale
		: width - width * scale;
	const maxTranslateX = hasMeasuredBounds
		? -mapContentBounds.left * scale
		: 0;
	const minTranslateY = hasMeasuredBounds
		? height - mapContentBounds.bottom * scale
		: height - height * scale;
	const maxTranslateY = hasMeasuredBounds ? -mapContentBounds.top * scale : 0;

	return {
		scale,
		translateX: clampViewportAxis(
			Number( nextViewport?.translateX ) || 0,
			minTranslateX,
			maxTranslateX
		),
		translateY: clampViewportAxis(
			Number( nextViewport?.translateY ) || 0,
			minTranslateY,
			maxTranslateY
		),
	};
};

const getNodeDepth = ( node ) => {
	let depth = 0;
	let currentNode = node?.parentElement || null;

	while ( currentNode ) {
		depth += 1;
		currentNode = currentNode.parentElement;
	}

	return depth;
};

const COUNTRY_CODE_ALIASES = {
	EL: 'GR',
	FX: 'FR',
	UK: 'GB',
};

const COUNTRY_CODE_ALPHA3_TO_ALPHA2_OVERRIDES = {
	NOR: 'NO',
};

const convertIsoA3ToA2 = ( code ) => {
	const normalized = normalizeCountryCode( code );

	if ( normalized.length !== 3 ) {
		return '';
	}

	return COUNTRY_CODE_ALPHA3_TO_ALPHA2_OVERRIDES[ normalized ] || '';
};

const getMapFeatureLayerNode = ( svg ) => {
	if ( ! svg ) {
		return null;
	}

	const nivoFeatureLayer = svg.querySelector( NIVO_FEATURE_LAYER_SELECTOR );
	if ( nivoFeatureLayer ) {
		return nivoFeatureLayer;
	}

	const candidateGroups = Array.from( svg.querySelectorAll( 'g' ) ).filter(
		( group ) => {
			if (
				group.getAttribute( LEGEND_LAYER_ATTRIBUTE ) ===
					LEGEND_LAYER_VALUE ||
				group.querySelector(
					`[${ LEGEND_LAYER_ATTRIBUTE }="${ LEGEND_LAYER_VALUE }"]`
				)
			) {
				return false;
			}

			if ( group.closest( 'defs, clipPath, mask, pattern' ) ) {
				return false;
			}

			return Boolean( group.querySelector( 'path' ) );
		}
	);

	const groupsWithoutText = candidateGroups.filter(
		( group ) => ! group.querySelector( 'text' )
	);
	const groupsToScore =
		groupsWithoutText.length > 0 ? groupsWithoutText : candidateGroups;

	const bestGroup = groupsToScore
		.map( ( group ) => {
			const pathCount = group.querySelectorAll( 'path' ).length;
			const directPathCount =
				group.querySelectorAll( ':scope > path' ).length;
			const hasLegendNodes = Boolean(
				group.querySelector( 'rect, text' )
			);
			const depth = getNodeDepth( group );

			return {
				group,
				score:
					directPathCount * 1000 +
					pathCount * 10 +
					depth -
					( hasLegendNodes ? 1000 : 0 ),
			};
		} )
		.sort( ( left, right ) => right.score - left.score )[ 0 ];

	if ( bestGroup?.score > 0 ) {
		return bestGroup.group;
	}

	const firstFeaturePath = svg.querySelector( 'path' );
	if ( ! firstFeaturePath ) {
		return null;
	}

	const pathParent = firstFeaturePath.parentElement;
	if ( pathParent?.tagName?.toLowerCase() === 'g' ) {
		return pathParent;
	}

	const closestGroup = firstFeaturePath.closest( 'g' );
	if ( closestGroup?.tagName?.toLowerCase() === 'g' ) {
		return closestGroup;
	}

	return null;
};

const markLegendLayerNode = ( svg ) => {
	if ( ! svg ) {
		return;
	}

	Array.from( svg.querySelectorAll( 'g' ) ).forEach( ( group ) => {
		if ( group.closest( 'defs, clipPath, mask, pattern' ) ) {
			return;
		}

		const hasText = Boolean( group.querySelector( 'text' ) );
		const hasRect = Boolean( group.querySelector( 'rect' ) );
		const hasPath = Boolean( group.querySelector( 'path' ) );

		if ( hasText && hasRect && ! hasPath ) {
			group.setAttribute( LEGEND_LAYER_ATTRIBUTE, LEGEND_LAYER_VALUE );
			group.classList.add( 'bbpa-world-map__legend-layer' );
		}
	} );
};

const isMatchingPointer = ( activePointerId, eventPointerId ) => {
	if (
		Number.isFinite( activePointerId ) &&
		Number.isFinite( eventPointerId )
	) {
		return activePointerId === eventPointerId;
	}

	return true;
};

const getCssAttributeSelector = ( attribute, value ) => {
	if ( ! attribute || ! value ) {
		return '';
	}

	const escapedValue = String( value ).replace( /[\\"]/g, '\\$&' );

	return `[${ attribute }="${ escapedValue }"]`;
};

const getPathFeatureIdCandidates = ( pathNode ) => {
	if ( ! pathNode ) {
		return [];
	}

	const datum = pathNode.__data__;

	return [
		pathNode.getAttribute( 'data-id' ),
		pathNode.getAttribute( 'data-feature-id' ),
		pathNode.getAttribute( 'data-country-id' ),
		pathNode.getAttribute( 'id' ),
		datum?.feature?.id,
		datum?.id,
		datum?.data?.id,
	];
};

const findFeaturePathNode = ( featureLayer, featureId ) => {
	const normalizedFeatureId = normalizeCountryCode( featureId );

	if ( ! featureLayer || ! normalizedFeatureId ) {
		return null;
	}

	const selectorCandidates = [
		getCssAttributeSelector( 'data-id', normalizedFeatureId ),
		getCssAttributeSelector( 'data-feature-id', normalizedFeatureId ),
		getCssAttributeSelector( 'data-country-id', normalizedFeatureId ),
		getCssAttributeSelector( 'id', normalizedFeatureId ),
	].filter( Boolean );

	const selectorPath = selectorCandidates
		.map( ( selector ) => `path${ selector }` )
		.join( ', ' );

	if ( selectorPath ) {
		const selectedPath = featureLayer.querySelector( selectorPath );
		if ( selectedPath ) {
			return selectedPath;
		}
	}

	return Array.from( featureLayer.querySelectorAll( 'path' ) ).find(
		( pathNode ) =>
			getPathFeatureIdCandidates( pathNode )
				.map( normalizeCountryCode )
				.includes( normalizedFeatureId )
	);
};

const getReorderTargetNode = ( featureLayer, pathNode ) => {
	if ( ! featureLayer || ! pathNode ) {
		return null;
	}

	let reorderTarget = pathNode;

	while (
		reorderTarget.parentElement &&
		reorderTarget.parentElement !== featureLayer
	) {
		reorderTarget = reorderTarget.parentElement;
	}

	if ( reorderTarget.parentElement !== featureLayer ) {
		return null;
	}

	return reorderTarget;
};

const movePathToForeground = ( featureLayer, pathNode ) => {
	if ( ! featureLayer || ! pathNode ) {
		return false;
	}

	const pathParent = pathNode.parentElement;
	if ( ! pathParent || ! featureLayer.contains( pathParent ) ) {
		return false;
	}

	const directPathCount = Array.from( pathParent.children ).filter(
		( node ) => node?.tagName?.toLowerCase() === 'path'
	).length;
	if ( directPathCount <= 1 ) {
		return false;
	}

	if ( pathParent.lastElementChild === pathNode ) {
		return true;
	}

	pathParent.appendChild( pathNode );

	return true;
};

const getSvgPointFromClient = (
	svg,
	clientX,
	clientY,
	fallbackWidth = 0,
	fallbackHeight = 0
) => {
	if ( svg && typeof svg.createSVGPoint === 'function' ) {
		const point = svg.createSVGPoint();
		point.x = Number( clientX ) || 0;
		point.y = Number( clientY ) || 0;

		const matrix = svg.getScreenCTM?.();
		if ( matrix && typeof matrix.inverse === 'function' ) {
			return point.matrixTransform( matrix.inverse() );
		}
	}

	const rect = svg?.getBoundingClientRect?.();
	if ( ! rect || rect.width <= 0 || rect.height <= 0 ) {
		return null;
	}

	return {
		x:
			( ( ( Number( clientX ) || 0 ) - rect.left ) / rect.width ) *
			Math.max( Number( fallbackWidth ) || 0, rect.width ),
		y:
			( ( ( Number( clientY ) || 0 ) - rect.top ) / rect.height ) *
			Math.max( Number( fallbackHeight ) || 0, rect.height ),
	};
};

const getZoomAnchorPointFromVisibleMapArea = (
	svg,
	layer,
	fallbackWidth,
	fallbackHeight
) => {
	const fallbackPoint = {
		x: Math.max( Number( fallbackWidth ) || 0, 0 ) / 2,
		y: Math.max( Number( fallbackHeight ) || 0, 0 ) / 2,
	};
	const svgRect = svg?.getBoundingClientRect?.();
	if ( ! svgRect || svgRect.width <= 0 || svgRect.height <= 0 ) {
		return fallbackPoint;
	}

	let centerClientX = svgRect.left + svgRect.width / 2;
	let centerClientY = svgRect.top + svgRect.height / 2;
	const layerRect = layer?.getBoundingClientRect?.();

	if ( layerRect && layerRect.width > 0 && layerRect.height > 0 ) {
		const visibleLeft = Math.max( svgRect.left, layerRect.left );
		const visibleRight = Math.min( svgRect.right, layerRect.right );
		const visibleTop = Math.max( svgRect.top, layerRect.top );
		const visibleBottom = Math.min( svgRect.bottom, layerRect.bottom );

		if ( visibleRight > visibleLeft && visibleBottom > visibleTop ) {
			centerClientX = visibleLeft + ( visibleRight - visibleLeft ) / 2;
			centerClientY = visibleTop + ( visibleBottom - visibleTop ) / 2;
		}
	}

	return (
		getSvgPointFromClient(
			svg,
			centerClientX,
			centerClientY,
			fallbackWidth,
			fallbackHeight
		) || fallbackPoint
	);
};

const sanitizeMapValue = ( value ) => {
	const numericValue = Number( value );

	if ( ! Number.isFinite( numericValue ) ) {
		return 0;
	}

	return Math.max( 0, numericValue );
};

const getCityDataHits = ( city ) => {
	const metricCandidates = [
		city?.visits,
		city?.hits,
		city?.weight,
		city?.hit,
		city?.metric,
		city?.value,
		city?.count,
	];
	const candidateMetric = metricCandidates.find( ( metricValue ) => {
		const numericMetric = Number( metricValue );
		return Number.isFinite( numericMetric ) && numericMetric > 0;
	} );
	const numericHits = Number( candidateMetric ?? 0 );

	if ( ! Number.isFinite( numericHits ) || numericHits <= 0 ) {
		return 0;
	}

	return sanitizeMapValue( numericHits );
};

const formatCityDisplayName = ( value ) => {
	if ( typeof value !== 'string' ) {
		return '';
	}

	const trimmedValue = value.trim();

	if ( trimmedValue === '' ) {
		return '';
	}

	return trimmedValue.charAt( 0 ).toLocaleUpperCase() + trimmedValue.slice( 1 );
};

const removeUnknownRegionFromCityLabel = ( value ) => {
	if ( typeof value !== 'string' ) {
		return '';
	}

	const normalizedLabel = value
		.replace( /\(\s*unknown\s*,\s*([^)]+?)\s*\)$/i, '($1)' )
		.replace( /\(\s*unknown\s*\)$/i, '' )
		.replace( /\s{2,}/g, ' ' )
		.trim();

	return normalizedLabel;
};

const getCityCoordinate = ( city, axis ) => {
	const coordinateValue =
		axis === 'latitude'
			? city?.latitude ?? city?.lat
			: city?.longitude ?? city?.lng ?? city?.lon;

	if ( coordinateValue === null || coordinateValue === '' ) {
		return Number.NaN;
	}

	if ( typeof coordinateValue === 'string' ) {
		const normalizedCoordinate = coordinateValue.trim();

		if ( normalizedCoordinate === '' ) {
			return Number.NaN;
		}

		if ( /^-?\d+,\d+$/.test( normalizedCoordinate ) ) {
			return Number( normalizedCoordinate.replace( ',', '.' ) );
		}

		return Number( normalizedCoordinate );
	}

	return Number( coordinateValue );
};

const resolveCityCoordinates = ( city, fallbackCountryCenter, allowCountryFallback ) => {
	const rawLatitude = getCityCoordinate( city, 'latitude' );
	const rawLongitude = getCityCoordinate( city, 'longitude' );
	const hasRawCoordinates =
		Number.isFinite( rawLatitude ) && Number.isFinite( rawLongitude );

	if ( hasRawCoordinates ) {
		return {
			latitude: rawLatitude,
			longitude: rawLongitude,
			usedCountryFallback: false,
		};
	}

	if ( allowCountryFallback && fallbackCountryCenter ) {
		return {
			latitude: fallbackCountryCenter.latitude,
			longitude: fallbackCountryCenter.longitude,
			usedCountryFallback: true,
		};
	}

	return {
		latitude: rawLatitude,
		longitude: rawLongitude,
		usedCountryFallback: false,
	};
};

const getCityMarkerRadius = ( hits, maxHits ) => {
	const sanitizedHits = sanitizeMapValue( hits );
	const sanitizedMaxHits = sanitizeMapValue( maxHits );

	if ( sanitizedHits <= 0 || sanitizedMaxHits <= 0 ) {
		return CITY_MARKER_MIN_RADIUS;
	}

	if ( sanitizedHits >= sanitizedMaxHits ) {
		return CITY_MARKER_MAX_RADIUS;
	}

	const sizeRatio = Math.sqrt( sanitizedHits / sanitizedMaxHits );

	return (
		CITY_MARKER_MIN_RADIUS +
		( CITY_MARKER_MAX_RADIUS - CITY_MARKER_MIN_RADIUS ) * sizeRatio
	);
};

const getCityMarkerOpacity = ( hits, maxHits ) => {
	const sanitizedHits = sanitizeMapValue( hits );
	const sanitizedMaxHits = sanitizeMapValue( maxHits );

	if ( sanitizedHits <= 0 || sanitizedMaxHits <= 0 ) {
		return CITY_MARKER_MIN_OPACITY;
	}

	if ( sanitizedHits >= sanitizedMaxHits ) {
		return CITY_MARKER_MAX_OPACITY;
	}

	const opacityRatio = Math.sqrt( sanitizedHits / sanitizedMaxHits );

	return (
		CITY_MARKER_MIN_OPACITY +
		( CITY_MARKER_MAX_OPACITY - CITY_MARKER_MIN_OPACITY ) * opacityRatio
	);
};

const getCityMarkerPulseScale = ( hits, maxHits ) => {
	const sanitizedHits = sanitizeMapValue( hits );
	const sanitizedMaxHits = sanitizeMapValue( maxHits );

	if ( sanitizedHits <= 0 || sanitizedMaxHits <= 0 ) {
		return CITY_MARKER_MIN_PULSE_SCALE;
	}

	if ( sanitizedHits >= sanitizedMaxHits ) {
		return CITY_MARKER_MAX_PULSE_SCALE;
	}

	const pulseRatio = Math.sqrt( sanitizedHits / sanitizedMaxHits );

	return (
		CITY_MARKER_MIN_PULSE_SCALE +
		( CITY_MARKER_MAX_PULSE_SCALE - CITY_MARKER_MIN_PULSE_SCALE ) * pulseRatio
	);
};

export const summarizeCityMarkerDiagnostics = ( cities = [] ) => {
	const reasonCounts = {
		invalidCoordinates: 0,
		zeroCoordinates: 0,
		nonPositiveHits: 0,
	};
	const excludedCities = [];

	cities.forEach( ( city, index ) => {
		const latitude = getCityCoordinate( city, 'latitude' );
		const longitude = getCityCoordinate( city, 'longitude' );
		const hits = getCityDataHits( city );
		let reason = '';

		if (
			! Number.isFinite( latitude ) ||
			! Number.isFinite( longitude )
		) {
			reasonCounts.invalidCoordinates += 1;
			reason = 'invalid_coordinates';
		} else if (
			Math.abs( latitude ) < 0.0001 &&
			Math.abs( longitude ) < 0.0001
		) {
			reasonCounts.zeroCoordinates += 1;
			reason = 'zero_coordinates';
		} else if ( hits <= 0 ) {
			reasonCounts.nonPositiveHits += 1;
			reason = 'non_positive_hits';
		}

		if ( reason === '' ) {
			return;
		}

		excludedCities.push( {
			index,
			reason,
			label: getLocationLabel( city ),
			countryCode: city?.country_code || '',
			regionCode: city?.region_code || '',
			hits,
			latitude:
				Number.isFinite( latitude ) ? Number( latitude.toFixed( 5 ) ) : null,
			longitude:
				Number.isFinite( longitude )
					? Number( longitude.toFixed( 5 ) )
					: null,
		} );
	} );

	return {
		totalCities: cities.length,
		renderableCities: cities.length - excludedCities.length,
		excludedCitiesCount: excludedCities.length,
		reasonCounts,
		topExcludedCities: excludedCities
			.sort( ( left, right ) => right.hits - left.hits )
			.slice( 0, 10 ),
	};
};

const getLegendRoundingStep = ( maxValue ) => {
	const sanitizedMaxValue = sanitizeMapValue( maxValue );

	if ( sanitizedMaxValue <= 0 ) {
		return 10;
	}

	if ( sanitizedMaxValue < 100 ) {
		return 10;
	}

	return 10 ** Math.floor( Math.log10( sanitizedMaxValue ) );
};

const sampleLegendColors = ( count, colorRange = DEFAULT_MAP_COLOR_RANGE ) => {
	const availableColors =
		Array.isArray( colorRange ) && colorRange.length > 0
			? colorRange
			: DEFAULT_MAP_COLOR_RANGE;

	if ( count >= availableColors.length ) {
		return availableColors;
	}

	return Array.from( { length: count }, ( _, index ) => {
		if ( count <= 1 ) {
			return availableColors[ availableColors.length - 1 ];
		}

		const colorIndex = Math.round(
			( index / ( count - 1 ) ) * ( availableColors.length - 1 )
		);

		return availableColors[ colorIndex ];
	} );
};

const buildLegendRanges = ( roundedDomainMax, bucketCount, roundingStep ) => {
	const ranges = [];
	let previousEnd = 0;

	for ( let index = 0; index < bucketCount; index += 1 ) {
		const isLastBucket = index === bucketCount - 1;
		const rawEnd =
			Math.ceil(
				( ( index + 1 ) * roundedDomainMax ) / bucketCount / roundingStep
			) * roundingStep;
		const end = isLastBucket
			? roundedDomainMax
			: Math.min(
					roundedDomainMax,
					Math.max( previousEnd + roundingStep, rawEnd )
			  );

		ranges.push( [ previousEnd + 1, end ] );
		previousEnd = end;
	}

	return ranges;
};

const buildCompactLegendRanges = ( roundedDomainMax ) =>
	buildLegendRanges(
		roundedDomainMax,
		Math.max(
			1,
			Math.min( MAX_DATA_BUCKETS, Math.ceil( roundedDomainMax / 20 ) )
		),
		10
	);

const buildMapColorBuckets = ( maxValue, colorRange = DEFAULT_MAP_COLOR_RANGE ) => {
	const sanitizedMaxValue = sanitizeMapValue( maxValue );
	const domainMax = Math.max( 1, sanitizedMaxValue );
	const legendRoundingStep = getLegendRoundingStep( domainMax );
	const roundedDomainMax =
		Math.ceil( domainMax / legendRoundingStep ) * legendRoundingStep;

	if ( domainMax < 100 ) {
		const ranges = buildCompactLegendRanges( roundedDomainMax );
		const colors = sampleLegendColors( ranges.length, colorRange );

		return {
			ranges,
			colors,
			openEndedLastLabel: false,
		};
	}

	const ranges = buildLegendRanges(
		roundedDomainMax,
		MAX_DATA_BUCKETS,
		legendRoundingStep
	);

	return {
		ranges,
		colors: sampleLegendColors( MAX_DATA_BUCKETS, colorRange ),
		openEndedLastLabel: true,
	};
};

const normalizeCountryCode = ( code ) => {
	if ( typeof code !== 'string' ) {
		return '';
	}

	const normalized = code.trim().toUpperCase();
	const normalizedAlias = COUNTRY_CODE_ALIASES[ normalized ];
	const resolvedCode = normalizedAlias || normalized;
	if ( resolvedCode === '-99' ) {
		return '';
	}

	return resolvedCode;
};

const GEO_JOIN_KEYS = {
	FEATURE_ID: 'id',
	ISO_A2: 'ISO_A2',
	ISO_A3: 'ISO_A3',
};

const detectGeoJoinKey = ( features ) => {
	if ( ! Array.isArray( features ) || features.length === 0 ) {
		return GEO_JOIN_KEYS.ISO_A2;
	}

	const isIsoLikeCountryCode = ( code ) => {
		const normalized = normalizeCountryCode( code );

		if ( ! normalized || isUnknownCountryCode( normalized ) ) {
			return false;
		}

		return /^[A-Z]{2,3}$/.test( normalized );
	};

	const hasFeatureId = features.some( ( feature ) =>
		isIsoLikeCountryCode( feature?.id || '' )
	);
	if ( hasFeatureId ) {
		return GEO_JOIN_KEYS.FEATURE_ID;
	}

	const hasIsoA2 = features.some( ( feature ) =>
		normalizeCountryCode( feature?.properties?.ISO_A2 || '' )
	);
	if ( hasIsoA2 ) {
		return GEO_JOIN_KEYS.ISO_A2;
	}

	return GEO_JOIN_KEYS.ISO_A3;
};

const getFeatureJoinCode = ( feature, joinKey ) => {
	const isoA2CodeCandidates = [
		feature?.properties?.ISO_A2,
		feature?.properties?.WB_A2,
	];
	const isoA3CodeCandidates = [
		feature?.properties?.ISO_A3,
		feature?.properties?.ADM0_A3,
		feature?.properties?.WB_A3,
		feature?.properties?.BRK_A3,
		feature?.properties?.GU_A3,
		feature?.properties?.SU_A3,
	];

	const firstKnownCode = ( candidates ) =>
		candidates
			.map( normalizeCountryCode )
			.find( ( code ) => code && ! isUnknownCountryCode( code ) ) || '';

	if ( joinKey === GEO_JOIN_KEYS.FEATURE_ID ) {
		const featureId = normalizeCountryCode( feature?.id || '' );
		if ( featureId && ! isUnknownCountryCode( featureId ) ) {
			return featureId;
		}

		return firstKnownCode( [
			...isoA2CodeCandidates,
			...isoA3CodeCandidates,
		] );
	}

	if ( joinKey === GEO_JOIN_KEYS.ISO_A3 ) {
		return firstKnownCode( isoA3CodeCandidates );
	}

	const isoA2 = firstKnownCode( isoA2CodeCandidates );
	if ( isoA2 ) {
		return isoA2;
	}

	return convertIsoA3ToA2( firstKnownCode( isoA3CodeCandidates ) );
};

const getFeatureCountryCodes = ( feature ) => {
	const candidates = [
		feature?.id,
		feature?.properties?.ISO_A2,
		feature?.properties?.WB_A2,
		feature?.properties?.ISO_A3,
		feature?.properties?.ADM0_A3,
		feature?.properties?.WB_A3,
		feature?.properties?.BRK_A3,
		feature?.properties?.GU_A3,
		feature?.properties?.SU_A3,
	];

	return candidates
		.map( normalizeCountryCode )
		.filter( ( code ) => code && ! isUnknownCountryCode( code ) );
};

const accumulateGeometryBounds = ( coordinates, bounds ) => {
	if ( ! Array.isArray( coordinates ) ) {
		return;
	}

	if (
		coordinates.length >= 2 &&
		Number.isFinite( coordinates[ 0 ] ) &&
		Number.isFinite( coordinates[ 1 ] )
	) {
		const longitude = Number( coordinates[ 0 ] );
		const latitude = Number( coordinates[ 1 ] );

		bounds.minLongitude = Math.min( bounds.minLongitude, longitude );
		bounds.maxLongitude = Math.max( bounds.maxLongitude, longitude );
		bounds.minLatitude = Math.min( bounds.minLatitude, latitude );
		bounds.maxLatitude = Math.max( bounds.maxLatitude, latitude );
		return;
	}

	coordinates.forEach( ( nestedCoordinates ) =>
		accumulateGeometryBounds( nestedCoordinates, bounds )
	);
};

const getFeatureGeometryCenter = ( feature ) => {
	const geometry = feature?.geometry;
	if ( ! geometry ) {
		return null;
	}

	const bounds = {
		minLongitude: Number.POSITIVE_INFINITY,
		maxLongitude: Number.NEGATIVE_INFINITY,
		minLatitude: Number.POSITIVE_INFINITY,
		maxLatitude: Number.NEGATIVE_INFINITY,
	};

	accumulateGeometryBounds( geometry.coordinates, bounds );

	if (
		! Number.isFinite( bounds.minLongitude ) ||
		! Number.isFinite( bounds.maxLongitude ) ||
		! Number.isFinite( bounds.minLatitude ) ||
		! Number.isFinite( bounds.maxLatitude )
	) {
		return null;
	}

	return {
		longitude: ( bounds.minLongitude + bounds.maxLongitude ) / 2,
		latitude: ( bounds.minLatitude + bounds.maxLatitude ) / 2,
	};
};

const resolveFeatureId = ( feature ) => {
	const isoA2 = getFeatureJoinCode( feature, GEO_JOIN_KEYS.ISO_A2 );
	if ( isoA2 && ! isUnknownCountryCode( isoA2 ) ) {
		return isoA2;
	}

	const isoA3 = getFeatureJoinCode( feature, GEO_JOIN_KEYS.ISO_A3 );
	if ( isoA3 && ! isUnknownCountryCode( isoA3 ) ) {
		return isoA3;
	}

	return '';
};

const getCountryDataCode = ( country ) =>
	normalizeCountryCode(
		country?.code ||
			country?.id ||
			country?.iso2 ||
			country?.iso3 ||
			country?.countryCodeAlpha2 ||
			country?.countryCodeAlpha3 ||
			country?.country?.code ||
			country?.country_code ||
			country?.countryCode ||
			country?.country ||
			country?.country?.name ||
			country?.label ||
			''
	);

const normalizeCountryNameKey = ( value ) => {
	if ( typeof value !== 'string' ) {
		return '';
	}

	const normalized = value
		.normalize( 'NFD' )
		.replace( /[\u0300-\u036f]/g, '' )
		.trim()
		.toUpperCase()
		.replace( /[^A-Z0-9 ]/g, '' )
		.replace( /\s+/g, ' ' );

	return normalized;
};

const getCountryDataHits = ( country ) => {
	const numericHits = Number(
		country?.visitors ??
			country?.visits ??
			country?.hits ??
			country?.hit ??
			country?.metric ??
			country?.value ??
			country?.count ??
			0
	);

	if ( ! Number.isFinite( numericHits ) || numericHits <= 0 ) {
		return 0;
	}

	return sanitizeMapValue( numericHits );
};

const isUnknownCityValue = ( value ) => {
	if ( typeof value !== 'string' ) {
		return true;
	}

	const normalizedValue = value.trim().toLowerCase();
	return normalizedValue === '' || normalizedValue === 'unknown city';
};

export const WorldChoropleth = ( {
	data,
	geoFeatures,
	maxDomainValue,
	countryColorScale = null,
	countryColorRange = DEFAULT_MAP_COLOR_RANGE,
	tooltipRenderer,
	width = FALLBACK_MAP_WIDTH,
	height = FALLBACK_MAP_HEIGHT,
	mapSvgRef,
	mapMode = 'countries',
	cityMarkers = [],
	viewport = {
		scale: VIEWPORT_ZOOM_MIN,
		translateX: 0,
		translateY: 0,
	},
	onCityMarkerEnter,
	onCityMarkerMove,
	onCityMarkerLeave,
} ) => {
	const bringFeaturePathToFront = useCallback(
		( featureId, eventTarget ) => {
			const svg = mapSvgRef?.current;
			const featureLayer = getMapFeatureLayerNode( svg );
			const pathNode =
				findFeaturePathNode( featureLayer, featureId ) ||
				eventTarget?.closest?.( 'path' ) ||
				null;

			if ( movePathToForeground( featureLayer, pathNode ) ) {
				return;
			}

			const reorderTarget = getReorderTargetNode(
				featureLayer,
				pathNode
			);

			if ( ! reorderTarget ) {
				return;
			}

			if ( featureLayer.lastElementChild === reorderTarget ) {
				return;
			}

			featureLayer.appendChild( reorderTarget );
		},
		[ mapSvgRef ]
	);
	const baseProjectionScale = useMemo( () => {
		return getBaseProjectionScale( width, height );
	}, [ width, height ] );
	const projectionScale = useMemo(
		() =>
			baseProjectionScale *
			clamp(
				Number( viewport.scale ) || VIEWPORT_ZOOM_MIN,
				VIEWPORT_ZOOM_MIN,
				VIEWPORT_ZOOM_MAX
			),
		[ baseProjectionScale, viewport.scale ]
	);
	const projectionTranslation = useMemo(
		() => [
			DEFAULT_PROJECTION_TRANSLATION.x +
				( Number( viewport.translateX ) || 0 ) / Math.max( width, 1 ),
			DEFAULT_PROJECTION_TRANSLATION.y +
				( Number( viewport.translateY ) || 0 ) / Math.max( height, 1 ),
		],
		[ height, viewport.translateY, viewport.translateX, width ]
	);
	const cityMarkerProjection = useMemo(
		() =>
			projectionById
				.mercator()
				.scale( projectionScale )
				.translate( [
					width * projectionTranslation[ 0 ],
					height * projectionTranslation[ 1 ],
				] )
				.rotate( [ 0, 0, 0 ] ),
		[ height, projectionScale, projectionTranslation, width ]
	);

	const colorScale = useMemo( () => {
		if ( typeof countryColorScale === 'function' ) {
			return countryColorScale;
		}

		const domainMax = Math.max( 1, sanitizeMapValue( maxDomainValue ) );
		return scaleQuantize()
			.domain( [ 0, domainMax ] )
			.range( countryColorRange );
	}, [ countryColorRange, countryColorScale, maxDomainValue ] );
	const neutralColorScale = useMemo(
		() =>
			scaleQuantize()
				.domain( [ 0, 1 ] )
				.range( [ NO_DATA_COLOR, NO_DATA_COLOR ] ),
		[]
	);

	const handleCountryMouseEnter = useCallback(
		( feature, event ) => {
			const normalizedFeatureId = normalizeCountryCode(
				feature?.id || ''
			);
			bringFeaturePathToFront(
				normalizedFeatureId,
				event?.nativeEvent?.target
			);
		},
		[ bringFeaturePathToFront ]
	);

	const handleCountryMouseMove = useCallback(
		( feature, event ) => {
			const normalizedFeatureId = normalizeCountryCode(
				feature?.id || ''
			);
			bringFeaturePathToFront(
				normalizedFeatureId,
				event?.nativeEvent?.target
			);
		},
		[ bringFeaturePathToFront ]
	);

	const handleCountryMouseLeave = useCallback( () => {}, [] );

	const countryBorderColor = useCallback(
		() => DEFAULT_COUNTRY_STROKE_COLOR,
		[]
	);

	const markersLayer = useMemo(
		() => () => (
			<g className="bbpa-world-map__city-markers" style={ { pointerEvents: 'all' } }>
				{ cityMarkers.map( ( marker ) => {
					const point = cityMarkerProjection( [
						marker.longitude,
						marker.latitude,
					] );
					if (
						! point ||
						! Number.isFinite( point[ 0 ] ) ||
						! Number.isFinite( point[ 1 ] )
					) {
						return null;
					}

					return (
						<circle
							key={ marker.id }
							className="bbpa-world-map__city-marker"
							cx={ point[ 0 ] }
							cy={ point[ 1 ] }
							r={ marker.radius }
							fill={ marker.color }
							style={ {
								pointerEvents: 'all',
								'--bbpa-city-marker-opacity': marker.opacity,
								'--bbpa-city-marker-pulse-scale': marker.pulseScale,
							} }
							data-city-marker-id={ marker.id }
							tabIndex={ 0 }
							role="img"
							aria-label={ marker.tooltipLabel }
							title={ marker.tooltipLabel }
							onPointerEnter={ ( event ) =>
								onCityMarkerEnter?.( marker, event )
							}
							onPointerMove={ ( event ) =>
								onCityMarkerMove?.( marker, event )
							}
							onPointerLeave={ onCityMarkerLeave }
							onMouseEnter={ ( event ) =>
								onCityMarkerEnter?.( marker, event )
							}
							onMouseMove={ ( event ) =>
								onCityMarkerMove?.( marker, event )
							}
							onMouseLeave={ onCityMarkerLeave }
							onFocus={ ( event ) =>
								onCityMarkerEnter?.( marker, event )
							}
							onBlur={ onCityMarkerLeave }
						/>
					);
				} ) }
			</g>
		),
		[
			cityMarkerProjection,
			cityMarkers,
			onCityMarkerEnter,
			onCityMarkerLeave,
			onCityMarkerMove,
		]
	);

	return (
		<Choropleth
			/* Keep interactivity enabled so custom city markers still receive reliable hover hit-testing. */
			width={ width }
			height={ height }
			data={ data }
			features={ geoFeatures }
			margin={ { top: 0, right: 0, bottom: 0, left: 0 } }
			colors={ isMarkerMapMode( mapMode ) ? neutralColorScale : colorScale }
			domain={ [ 0, Math.max( 1, sanitizeMapValue( maxDomainValue ) ) ] }
			valueScale={ { type: 'linear' } }
			unknownColor={ NO_DATA_COLOR }
			borderWidth={ 1.5 }
			borderColor={ countryBorderColor }
			layers={
				isMarkerMapMode( mapMode )
					? [ 'graticule', 'features', markersLayer ]
					: [ 'graticule', 'features', 'legends' ]
			}
			projectionType="mercator"
			projectionScale={ projectionScale }
			projectionTranslation={ projectionTranslation }
			projectionRotation={ [ 0, 0, 0 ] }
			enableGraticule={ false }
			isInteractive={ true }
			onMouseEnter={ handleCountryMouseEnter }
			onMouseMove={ handleCountryMouseMove }
			onMouseLeave={ handleCountryMouseLeave }
			tooltip={ tooltipRenderer }
		/>
	);
};

const WorldMapTooltip = ( { data } ) => (
	<div className="bbpa-world-map__tooltip">
		<div className="bbpa-world-map__tooltip-title">
			{ data.flagClass ? (
				<span
					className={ `bbpa-country-flag ${ data.flagClass }` }
					aria-hidden="true"
				/>
			) : (
				<span
					className="bbpa-country-flag bbpa-country-flag--unknown"
					aria-hidden="true"
				/>
			) }
			<span>{ data.countryName }</span>
		</div>
		<div className="bbpa-world-map__tooltip-value">
			<span
				className={ `bbpa-world-map__tooltip-dot${
					data.hasData ? '' : ' bbpa-world-map__tooltip-dot--muted'
				}` }
				style={ { '--bbpa-world-map-tooltip-dot-color': data.dotColor } }
				aria-hidden="true"
			/>
			<span>{ data.visitsLabel }</span>
		</div>
		{ data.shareLabel && (
			<div className="bbpa-world-map__tooltip-share">
				{ data.shareLabel }
			</div>
		) }
	</div>
);

const WorldMapCityTooltip = ( { data, x, y } ) => (
	<div
		className="bbpa-world-map__tooltip"
		style={ {
			position: 'absolute',
			left: x,
			top: y,
			transform: 'translate(-50%, calc(-100% - 12px))',
			pointerEvents: 'none',
			zIndex: 2,
		} }
	>
		<div className="bbpa-world-map__tooltip-title">
			<span>{ data.cityName }</span>
		</div>
		<div className="bbpa-world-map__tooltip-value">
			<span
				className="bbpa-world-map__tooltip-dot"
				style={ { '--bbpa-world-map-tooltip-dot-color': data.dotColor } }
				aria-hidden="true"
			/>
			<span>{ data.visitsLabel }</span>
		</div>
	</div>
);

const WorldMap = ( {
	range,
	endpoint = '/geo-countries',
	emptyLabel,
	emptyStateNoticeStatus,
	unknownCountryLabel = __( 'Unknown country', 'bimbeau-privacy-analytics' ),
	mapMode = 'countries',
	dataOverride,
	isLoadingOverride,
	errorOverride,
	topLeftOverlay = null,
	controlsSlot = null,
} ) => {
	const mapContainerRef = useRef( null );
	const [ mapDimensions, setMapDimensions ] = useState( {
		width: 0,
		height: 0,
	} );
	const [ viewport, setViewport ] = useState( {
		scale: VIEWPORT_ZOOM_MIN,
		translateX: 0,
		translateY: 0,
	} );
	const mapSvgRef = useRef( null );
	const mapLayerRef = useRef( null );
	const mapContentBoundsRef = useRef( null );
	const hasAppliedInitialResetRef = useRef( false );
	const hasAppliedRealtimeAutoFocusRef = useRef( false );
	const unresolvedCountryCodeCountsRef = useRef( new Map() );
	const dragStateRef = useRef( null );
	const pinchStateRef = useRef( null );
	const activePointersRef = useRef( new Map() );
	const [ isDragging, setIsDragging ] = useState( false );
	const [ activeCityTooltip, setActiveCityTooltip ] = useState( null );
	const [ mapThemeColor, setMapThemeColor ] = useState(
		resolveMapThemeColor
	);
	const mapThemeColorRef = useRef( mapThemeColor );
	const logger = useMemo(
		() => createLogger( { debugEnabled: DEBUG_FLAG } ),
		[]
	);
	const zoomInLabel = __( 'Zoom in map', 'bimbeau-privacy-analytics' );
	const zoomOutLabel = __( 'Zoom out map', 'bimbeau-privacy-analytics' );
	const resetZoomLabel = __( 'Reset map zoom', 'bimbeau-privacy-analytics' );
	const isZoomInDisabled = viewport.scale >= VIEWPORT_ZOOM_MAX;
	const isZoomOutDisabled = viewport.scale <= VIEWPORT_ZOOM_MIN;
	const choroplethWidth =
		mapDimensions.width > 0 ? mapDimensions.width : FALLBACK_MAP_WIDTH;
	const choroplethHeight =
		mapDimensions.height > 0 ? mapDimensions.height : FALLBACK_MAP_HEIGHT;

	const mapColorRange = useMemo(
		() => buildHeatmapThemeColorRange( mapThemeColor ),
		[ mapThemeColor ]
	);

	useEffect( () => {
		mapThemeColorRef.current = mapThemeColor;
	}, [ mapThemeColor ] );

	const clampViewport = useCallback(
		( nextViewport ) =>
			clampViewportToMapBounds(
				nextViewport,
				choroplethWidth,
				choroplethHeight,
				mapContentBoundsRef.current
			),
		[ choroplethHeight, choroplethWidth ]
	);

	const updateMapContentBounds = useCallback( () => {
		const svg = mapSvgRef.current;
		const layer = mapLayerRef.current;
		if ( ! svg || ! layer ) {
			return;
		}

		const svgRect = svg.getBoundingClientRect?.();
		const layerRect = layer.getBoundingClientRect?.();
		if (
			! svgRect ||
			! layerRect ||
			svgRect.width <= 0 ||
			svgRect.height <= 0
		) {
			return;
		}

		const scale = clamp(
			Number( viewport.scale ) || VIEWPORT_ZOOM_MIN,
			VIEWPORT_ZOOM_MIN,
			VIEWPORT_ZOOM_MAX
		);
		const translateX = Number( viewport.translateX ) || 0;
		const translateY = Number( viewport.translateY ) || 0;
		const rawBounds = {
			left: ( layerRect.left - svgRect.left - translateX ) / scale,
			right: ( layerRect.right - svgRect.left - translateX ) / scale,
			top: ( layerRect.top - svgRect.top - translateY ) / scale,
			bottom: ( layerRect.bottom - svgRect.top - translateY ) / scale,
		};
		const rawCenterX = ( rawBounds.left + rawBounds.right ) / 2;
		const rawCenterY = ( rawBounds.top + rawBounds.bottom ) / 2;
		const viewportCenterX = ( svgRect.width / 2 - translateX ) / scale;
		const viewportCenterY = ( svgRect.height / 2 - translateY ) / scale;
		const centerOffsetX = rawCenterX - viewportCenterX;
		const centerOffsetY = rawCenterY - viewportCenterY;

		mapContentBoundsRef.current = {
			left: rawBounds.left - centerOffsetX,
			right: rawBounds.right - centerOffsetX,
			top: rawBounds.top - centerOffsetY,
			bottom: rawBounds.bottom - centerOffsetY,
		};
	}, [ viewport ] );

	const applyZoomAtPoint = useCallback(
		( nextScale, pointX, pointY ) => {
			const projectionOriginX =
				choroplethWidth * DEFAULT_PROJECTION_TRANSLATION.x;
			const projectionOriginY =
				choroplethHeight * DEFAULT_PROJECTION_TRANSLATION.y;
			setViewport( ( previousViewport ) => {
				const previousScale = clamp(
					Number( previousViewport?.scale ) || VIEWPORT_ZOOM_MIN,
					VIEWPORT_ZOOM_MIN,
					VIEWPORT_ZOOM_MAX
				);
				const targetScale = clamp(
					Number( nextScale ) || previousScale,
					VIEWPORT_ZOOM_MIN,
					VIEWPORT_ZOOM_MAX
				);

				if ( targetScale === previousScale ) {
					return previousViewport;
				}

				const anchorX = Number( pointX ) || 0;
				const anchorY = Number( pointY ) || 0;
				const previousTranslateX =
					Number( previousViewport?.translateX ) || 0;
				const previousTranslateY =
					Number( previousViewport?.translateY ) || 0;

				return clampViewport( {
					scale: targetScale,
					translateX:
						anchorX -
						projectionOriginX -
						(
							( anchorX - projectionOriginX - previousTranslateX ) /
							previousScale
						) *
							targetScale,
					translateY:
						anchorY -
						projectionOriginY -
						(
							( anchorY - projectionOriginY - previousTranslateY ) /
							previousScale
						) *
							targetScale,
				} );
			} );
		},
		[ clampViewport, choroplethHeight, choroplethWidth ]
	);

	const handleZoomIn = useCallback( () => {
		const anchorPoint = getZoomAnchorPointFromVisibleMapArea(
			mapSvgRef.current,
			mapLayerRef.current,
			choroplethWidth,
			choroplethHeight
		);

		applyZoomAtPoint(
			viewport.scale + VIEWPORT_ZOOM_STEP,
			anchorPoint.x,
			anchorPoint.y
		);
	}, [
		applyZoomAtPoint,
		choroplethHeight,
		choroplethWidth,
		viewport.scale,
	] );

	const handleZoomOut = useCallback( () => {
		const anchorPoint = getZoomAnchorPointFromVisibleMapArea(
			mapSvgRef.current,
			mapLayerRef.current,
			choroplethWidth,
			choroplethHeight
		);

		applyZoomAtPoint(
			viewport.scale - VIEWPORT_ZOOM_STEP,
			anchorPoint.x,
			anchorPoint.y
		);
	}, [
		applyZoomAtPoint,
		choroplethHeight,
		choroplethWidth,
		viewport.scale,
	] );

	const handleResetViewport = useCallback( () => {
		setViewport( {
			scale: VIEWPORT_ZOOM_MIN,
			translateX: 0,
			translateY: 0,
		} );
	}, [] );

	const stopDrag = useCallback( () => {
		dragStateRef.current = null;
		pinchStateRef.current = null;
		setIsDragging( false );
	}, [] );

	const handleMapDoubleClick = useCallback(
		( event ) => {
			event.preventDefault();
			const svg = mapSvgRef.current;
			const pointer = getSvgPointFromClient(
				svg,
				event.clientX,
				event.clientY
			);
			const anchorX = pointer?.x ?? choroplethWidth / 2;
			const anchorY = pointer?.y ?? choroplethHeight / 2;

			applyZoomAtPoint(
				viewport.scale + VIEWPORT_ZOOM_STEP,
				anchorX,
				anchorY
			);
		},
		[ applyZoomAtPoint, choroplethHeight, choroplethWidth, viewport.scale ]
	);

	const endpointState = useAdminEndpoint(
		endpoint,
		{
			...range,
			per_page: isMarkerMapMode( mapMode ) ? 1000 : 250,
			orderby: 'hits',
			order: 'desc',
		},
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
		}
	);
	const hasDataOverride = dataOverride !== undefined;
	const data = hasDataOverride ? dataOverride : endpointState.data;
	const isLoading =
		isLoadingOverride !== undefined
			? isLoadingOverride
			: endpointState.isLoading;
	const error = errorOverride !== undefined ? errorOverride : endpointState.error;

	const handleMapPointerDown = useCallback(
		( event ) => {
			if ( Number.isFinite( event.button ) && event.button !== 0 ) {
				return;
			}

			event.currentTarget.setPointerCapture?.( event.pointerId );
			activePointersRef.current.set( event.pointerId, {
				x: Number( event.clientX ) || 0,
				y: Number( event.clientY ) || 0,
			} );

			if ( activePointersRef.current.size >= 2 ) {
				const pointers = Array.from(
					activePointersRef.current.values()
				);
				const first = pointers[ 0 ];
				const second = pointers[ 1 ];
				pinchStateRef.current = {
					distance: Math.hypot(
						second.x - first.x,
						second.y - first.y
					),
					startScale: viewport.scale,
				};
				setIsDragging( false );
				return;
			}

			dragStateRef.current = {
				pointerId: event.pointerId,
				lastClientX: Number( event.clientX ) || 0,
				lastClientY: Number( event.clientY ) || 0,
			};
			setIsDragging( true );
		},
		[ viewport.scale ]
	);

	const handleMapPointerMove = useCallback(
		( event ) => {
			if ( activePointersRef.current.has( event.pointerId ) ) {
				activePointersRef.current.set( event.pointerId, {
					x: Number( event.clientX ) || 0,
					y: Number( event.clientY ) || 0,
				} );
			}

			if ( activePointersRef.current.size >= 2 ) {
				const pointers = Array.from(
					activePointersRef.current.values()
				);
				const first = pointers[ 0 ];
				const second = pointers[ 1 ];
				const nextDistance = Math.hypot(
					second.x - first.x,
					second.y - first.y
				);
				const pinchState = pinchStateRef.current;
				if ( pinchState && pinchState.distance > 0 ) {
					const svg = mapSvgRef.current;
					const centerClientX = ( first.x + second.x ) / 2;
					const centerClientY = ( first.y + second.y ) / 2;
					const centerPoint = getSvgPointFromClient(
						svg,
						centerClientX,
						centerClientY
					);
					if ( centerPoint ) {
						const ratio = nextDistance / pinchState.distance;
						applyZoomAtPoint(
							pinchState.startScale * ratio,
							centerPoint.x,
							centerPoint.y
						);
					}
				}
				return;
			}

			const activeDragState = dragStateRef.current;
			if (
				! activeDragState ||
				! isMatchingPointer(
					activeDragState.pointerId,
					event.pointerId
				)
			) {
				return;
			}

			event.preventDefault();
			const nextClientX =
				Number( event.clientX ) || activeDragState.lastClientX;
			const nextClientY =
				Number( event.clientY ) || activeDragState.lastClientY;
			const deltaX = nextClientX - activeDragState.lastClientX;
			const deltaY = nextClientY - activeDragState.lastClientY;
			dragStateRef.current = {
				...activeDragState,
				lastClientX: nextClientX,
				lastClientY: nextClientY,
			};

			setViewport( ( previousViewport ) =>
				clampViewport( {
					...previousViewport,
					translateX:
						( Number( previousViewport?.translateX ) || 0 ) +
						deltaX,
					translateY:
						( Number( previousViewport?.translateY ) || 0 ) +
						deltaY,
				} )
			);
		},
		[ applyZoomAtPoint, clampViewport ]
	);

	const handleMapPointerUp = useCallback(
		( event ) => {
			activePointersRef.current.delete( event.pointerId );
			event.currentTarget.releasePointerCapture?.( event.pointerId );

			if ( activePointersRef.current.size < 2 ) {
				pinchStateRef.current = null;
			}

			if (
				dragStateRef.current &&
				isMatchingPointer(
					dragStateRef.current.pointerId,
					event.pointerId
				)
			) {
				stopDrag();
			}
		},
		[ stopDrag ]
	);

	useEffect( () => {
		if (
			typeof window === 'undefined' ||
			typeof document === 'undefined'
		) {
			return undefined;
		}

		const updateMapThemeColor = () => {
			const nextMapThemeColor = resolveMapThemeColor();

			if ( mapThemeColorRef.current === nextMapThemeColor ) {
				return;
			}

			mapThemeColorRef.current = nextMapThemeColor;
			setMapThemeColor( nextMapThemeColor );
		};

		updateMapThemeColor();
		window.addEventListener( 'focus', updateMapThemeColor );

		if ( typeof window.MutationObserver === 'undefined' ) {
			return () => {
				window.removeEventListener( 'focus', updateMapThemeColor );
			};
		}

		const observer = new window.MutationObserver( updateMapThemeColor );
		observer.observe( document.documentElement, {
			attributes: true,
			attributeFilter: [ 'class', 'style' ],
		} );

		return () => {
			observer.disconnect();
			window.removeEventListener( 'focus', updateMapThemeColor );
		};
	}, [] );

	useEffect( () => {
		if ( isLoading || error ) {
			return undefined;
		}

		const container = mapContainerRef.current;
		if ( ! container ) {
			return undefined;
		}

		let frameId = 0;
		const timeoutIds = [];

		const updateMapDimensions = () => {
			const rect = container.getBoundingClientRect();
			const nextDimensions = {
				width: Math.max( 0, Math.round( rect.width ) ),
				height: Math.max( 0, Math.round( rect.height ) ),
			};

			setMapDimensions( ( previousDimensions ) =>
				previousDimensions.width === nextDimensions.width &&
				previousDimensions.height === nextDimensions.height
					? previousDimensions
					: nextDimensions
			);
		};

		updateMapDimensions();

		frameId = window.requestAnimationFrame( updateMapDimensions );
		timeoutIds.push( window.setTimeout( updateMapDimensions, 120 ) );
		timeoutIds.push( window.setTimeout( updateMapDimensions, 400 ) );

		const handleWindowResize = () => updateMapDimensions();
		window.addEventListener( 'resize', handleWindowResize );

		if ( window.ResizeObserver ) {
			const observer = new window.ResizeObserver( () =>
				updateMapDimensions()
			);
			observer.observe( container );

			return () => {
				observer.disconnect();
				window.removeEventListener( 'resize', handleWindowResize );
				window.cancelAnimationFrame( frameId );
				timeoutIds.forEach( ( id ) => window.clearTimeout( id ) );
			};
		}

		return () => {
			window.removeEventListener( 'resize', handleWindowResize );
			window.cancelAnimationFrame( frameId );
			timeoutIds.forEach( ( id ) => window.clearTimeout( id ) );
		};
	}, [ isLoading, error ] );

	const countries = useMemo( () => {
		if ( Array.isArray( data?.countries ) && data.countries.length > 0 ) {
			return data.countries;
		}

		if ( Array.isArray( data?.items ) ) {
			return data.items;
		}

		return [];
	}, [ data?.countries, data?.items ] );

	const countryCenterByCode = useMemo( () => {
		const centerLookup = new Map();
		const features = Array.isArray( worldGeo?.features )
			? worldGeo.features
			: [];

		features.forEach( ( feature ) => {
			const center = getFeatureGeometryCenter( feature );
			if ( ! center ) {
				return;
			}

			getFeatureCountryCodes( feature ).forEach( ( code ) => {
				if ( ! centerLookup.has( code ) ) {
					centerLookup.set( code, center );
				}
			} );
		} );

		return centerLookup;
	}, [] );

	const cityMarkers = useMemo( () => {
		if ( ! isMarkerMapMode( mapMode ) ) {
			return [];
		}

		const markerMaxHits = Math.max(
			...countries.map( ( city ) => getCityDataHits( city ) ),
			0
		);

		return countries
			.map( ( city, index ) => {
				const fallbackCountryCenter =
					countryCenterByCode.get(
						normalizeCountryCode( city?.country_code || '' )
					) || null;
				const rawLatitude = getCityCoordinate( city, 'latitude' );
				const rawLongitude = getCityCoordinate( city, 'longitude' );
				const hasInvalidCoordinates =
					! Number.isFinite( rawLatitude ) ||
					! Number.isFinite( rawLongitude );
				const hasZeroCoordinates =
					Math.abs( rawLatitude ) < 0.0001 &&
					Math.abs( rawLongitude ) < 0.0001;
				const cityNameCandidate =
					typeof city?.city_name === 'string'
						? city.city_name
						: typeof city?.city === 'string'
							? city.city
							: city?.label || '';
				const hasUnknownCity = isUnknownCityValue( cityNameCandidate );
				const canUseCountryFallback = Boolean( fallbackCountryCenter );
				const shouldUseCountryFallback =
					mapMode !== 'cities' &&
					canUseCountryFallback &&
					( hasInvalidCoordinates || hasZeroCoordinates );
				const resolvedCoordinates = resolveCityCoordinates(
					city,
					fallbackCountryCenter,
					shouldUseCountryFallback
				);
				const latitude = resolvedCoordinates.latitude;
				const longitude = resolvedCoordinates.longitude;
				const hits = getCityDataHits( city );
				const displayLabel =
					typeof city?.label === 'string' && city.label.trim() !== ''
						? city.label.trim()
						: getLocationLabel( city );
				const formattedDisplayLabel =
					mapMode === 'cities'
						? formatCityDisplayName(
								removeUnknownRegionFromCityLabel( displayLabel )
						  )
						: displayLabel;

				if (
					mapMode === 'cities' &&
					hasUnknownCity &&
					( hasInvalidCoordinates || hasZeroCoordinates )
				) {
					return null;
				}

				if (
					! Number.isFinite( latitude ) ||
					! Number.isFinite( longitude ) ||
					hits <= 0
				) {
					return null;
				}

				if (
					Math.abs( latitude ) < 0.0001 &&
					Math.abs( longitude ) < 0.0001
				) {
					return null;
				}

				const normalizedLatitude = Number( latitude.toFixed( 4 ) );
				const normalizedLongitude = Number( longitude.toFixed( 4 ) );
				const markerIdentityParts = [
					city?.visitor_id || city?.visitorId || '',
					city?.country_code || '',
					city?.region_code || '',
					city?.city_name || city?.city || '',
					normalizedLatitude,
					normalizedLongitude,
					city?.currentPageLabel || city?.current_page || '',
				];

				return {
					id: markerIdentityParts.join( '|' ) || `city-${ index }`,
					latitude,
					longitude,
					hits,
					color: CITY_MARKER_FILL_COLOR,
					radius: getCityMarkerRadius( hits, markerMaxHits ),
					opacity: getCityMarkerOpacity( hits, markerMaxHits ),
					pulseScale: getCityMarkerPulseScale( hits, markerMaxHits ),
					label:
						formattedDisplayLabel,
					currentPageLabel:
						typeof city?.currentPageLabel === 'string' &&
						city.currentPageLabel.trim() !== ''
							? city.currentPageLabel.trim()
							: '',
					tooltipLabel: sprintf(
						/* translators: 1: location label, 2: visit count, 3: approximation suffix. */
						__( '%1$s: %2$s visits%3$s', 'bimbeau-privacy-analytics' ),
						formattedDisplayLabel,
						new Intl.NumberFormat().format( hits ),
						resolvedCoordinates.usedCountryFallback
							? sprintf(
									/* translators: %s: approximation scope label. */
									__( ' (%s)', 'bimbeau-privacy-analytics' ),
									__( 'approximate country area', 'bimbeau-privacy-analytics' )
							  )
							: ''
					),
				};
			} )
			.filter( Boolean );
	}, [ countries, mapMode, countryCenterByCode ] );
	const cityMarkerDiagnostics = useMemo(
		() =>
			isMarkerMapMode( mapMode )
				? summarizeCityMarkerDiagnostics( countries )
				: null,
		[ countries, mapMode ]
	);

	const geoFeatures = useMemo( () => worldGeo?.features || [], [] );
	const geoJoinKey = useMemo(
		() => detectGeoJoinKey( geoFeatures ),
		[ geoFeatures ]
	);
	const normalizedGeoFeatures = useMemo(
		() =>
			geoFeatures.map( ( feature ) => {
				const normalizedId =
					getFeatureJoinCode( feature, geoJoinKey ) ||
					resolveFeatureId( feature ) ||
					normalizeCountryCode( feature?.id || '' );

				if ( ! normalizedId ) {
					return feature;
				}

				return {
					...feature,
					id: normalizedId,
				};
			} ),
		[ geoFeatures, geoJoinKey ]
	);

	const { isoA3ToA2, isoA2ToA3 } = useMemo( () => {
		const a3ToA2 = new Map();
		const a2ToA3 = new Map();
		normalizedGeoFeatures.forEach( ( feature ) => {
			const isoA2 = getFeatureJoinCode( feature, GEO_JOIN_KEYS.ISO_A2 );
			const isoA3 = getFeatureJoinCode( feature, GEO_JOIN_KEYS.ISO_A3 );
			if (
				isoA2 &&
				isoA3 &&
				! isUnknownCountryCode( isoA2 ) &&
				! isUnknownCountryCode( isoA3 )
			) {
				a3ToA2.set( isoA3, isoA2 );
				a2ToA3.set( isoA2, isoA3 );
			}
		} );

		return {
			isoA3ToA2: a3ToA2,
			isoA2ToA3: a2ToA3,
		};
	}, [ normalizedGeoFeatures ] );

	const countryNameToJoinCode = useMemo( () => {
		const namesLookup = new Map();

		normalizedGeoFeatures.forEach( ( feature ) => {
			const joinCode = getFeatureJoinCode( feature, geoJoinKey );
			if ( ! joinCode || isUnknownCountryCode( joinCode ) ) {
				return;
			}

			[
				feature?.properties?.NAME_EN,
				feature?.properties?.NAME,
				feature?.properties?.ADMIN,
				feature?.properties?.NAME_LONG,
			].forEach( ( name ) => {
				const key = normalizeCountryNameKey( name );
				if ( key ) {
					namesLookup.set( key, joinCode );
				}
			} );
		} );

		return namesLookup;
	}, [ normalizedGeoFeatures, geoJoinKey ] );

	const supportedJoinCodes = useMemo( () => {
		const codes = new Set();
		normalizedGeoFeatures.forEach( ( feature ) => {
			const joinCode = getFeatureJoinCode( feature, geoJoinKey );
			if ( joinCode && ! isUnknownCountryCode( joinCode ) ) {
				codes.add( joinCode );
			}
		} );
		return codes;
	}, [ normalizedGeoFeatures, geoJoinKey ] );

	const normalizeCountryForJoinKey = useCallback(
		( code ) => {
			const normalized = normalizeCountryCode( code );
			if ( ! normalized || isUnknownCountryCode( normalized ) ) {
				return '';
			}

			if ( supportedJoinCodes.has( normalized ) ) {
				return normalized;
			}

			if (
				geoJoinKey === GEO_JOIN_KEYS.ISO_A2 &&
				normalized.length === 3
			) {
				return isoA3ToA2.get( normalized ) || '';
			}

			if (
				geoJoinKey === GEO_JOIN_KEYS.ISO_A3 &&
				normalized.length === 2
			) {
				return isoA2ToA3.get( normalized ) || '';
			}

			const byName = countryNameToJoinCode.get(
				normalizeCountryNameKey( code )
			);
			if ( byName ) {
				return byName;
			}

			return '';
		},
		[
			geoJoinKey,
			supportedJoinCodes,
			isoA3ToA2,
			isoA2ToA3,
			countryNameToJoinCode,
		]
	);

	const { hitLookup, chartData, unresolvedCountryCodeCounts } =
		useMemo( () => {
			const lookup = new Map();
			const unresolvedCounts = new Map();

			countries.forEach( ( country ) => {
				const rawCode = getCountryDataCode( country );
				const resolvedCode = normalizeCountryForJoinKey( rawCode );

				// GeoJSON/data join key (id, ISO_A2, or ISO_A3) is detected from the embedded file.
				// Unknown or non-convertible country codes are ignored to keep map rendering stable.
				if ( ! resolvedCode ) {
					const unresolvedCode = normalizeCountryCode( rawCode );
					if (
						unresolvedCode &&
						! isUnknownCountryCode( unresolvedCode )
					) {
						const currentCount =
							unresolvedCounts.get( unresolvedCode ) || 0;
						unresolvedCounts.set(
							unresolvedCode,
							currentCount + 1
						);
					}
					return;
				}

				const hits = getCountryDataHits( country );
				if ( hits <= 0 ) {
					return;
				}

				const currentValue = lookup.get( resolvedCode ) || 0;
				const nextValue = sanitizeMapValue( currentValue + hits );
				lookup.set( resolvedCode, nextValue );
			} );

			const baseData = normalizedGeoFeatures
				.map( ( feature ) => getFeatureJoinCode( feature, geoJoinKey ) )
				.map( normalizeCountryCode )
				.filter( ( id ) => ! isUnknownCountryCode( id ) )
				.filter( Boolean )
				.filter( ( id ) => sanitizeMapValue( lookup.get( id ) ) > 0 )
				.map( ( id ) => ( {
					id,
					value: sanitizeMapValue( lookup.get( id ) ),
				} ) );

			return {
				hitLookup: lookup,
				chartData: baseData,
				unresolvedCountryCodeCounts: unresolvedCounts,
			};
		}, [
			countries,
			normalizedGeoFeatures,
			geoJoinKey,
			normalizeCountryForJoinKey,
		] );

	const joinDebugMetrics = useMemo( () => {
		const lookupKeys = Array.from( hitLookup.keys() );
		const matchedCodes = lookupKeys.filter( ( code ) =>
			supportedJoinCodes.has( code )
		);
		const unresolvedSample = Array.from(
			unresolvedCountryCodeCounts.entries()
		)
			.sort( ( left, right ) => right[ 1 ] - left[ 1 ] )
			.slice( 0, 20 )
			.map( ( [ id, count ] ) => ( { id, count } ) );

		return {
			featuresCount: normalizedGeoFeatures.length,
			countriesCount: countries.length,
			resolvedCodesCount: lookupKeys.length,
			matchedCount: matchedCodes.length,
			topUnmatchedIds: unresolvedSample,
		};
	}, [
		countries.length,
		normalizedGeoFeatures.length,
		hitLookup,
		supportedJoinCodes,
		unresolvedCountryCodeCounts,
	] );

	useEffect( () => {
		if ( process.env.NODE_ENV !== 'development' ) {
			return;
		}

		unresolvedCountryCodeCountsRef.current = new Map(
			unresolvedCountryCodeCounts
		);

		if ( unresolvedCountryCodeCountsRef.current.size === 0 ) {
			return;
		}

		const summary = Array.from(
			unresolvedCountryCodeCountsRef.current
		).map( ( [ code, count ] ) => `${ code }:${ count }` );

		// eslint-disable-next-line no-console
		console.debug(
			'[BimBeau Privacy Analytics] WorldMap unresolved country codes',
			summary.join( ', ' )
		);
	}, [ unresolvedCountryCodeCounts ] );

	const totalHits = useMemo(
		() => sanitizeMapValue( data?.totalHits ),
		[ data?.totalHits ]
	);

	useEffect( () => {
		if ( process.env.NODE_ENV !== 'development' ) {
			return;
		}

		if (
			joinDebugMetrics.countriesCount <= 0 ||
			totalHits <= 0 ||
			joinDebugMetrics.matchedCount !== 0 ||
			joinDebugMetrics.topUnmatchedIds.length === 0
		) {
			return;
		}

		// eslint-disable-next-line no-console
		console.warn( '[BimBeau Privacy Analytics] WorldMap country join mismatch detected', {
			geoJoinKey,
			totalHits,
			featuresCount: joinDebugMetrics.featuresCount,
			countriesCount: joinDebugMetrics.countriesCount,
			resolvedCodesCount: joinDebugMetrics.resolvedCodesCount,
			matchedCount: joinDebugMetrics.matchedCount,
			topUnmatchedIdsSample: joinDebugMetrics.topUnmatchedIds,
		} );
	}, [ geoJoinKey, joinDebugMetrics, totalHits ] );
	useEffect( () => {
		if ( ! isMarkerMapMode( mapMode ) || ! cityMarkerDiagnostics ) {
			return;
		}

		if ( cityMarkerDiagnostics.excludedCitiesCount <= 0 ) {
			return;
		}

		logger.debug( 'WorldMap city marker exclusions detected', {
			action: 'worldmap.city_markers.excluded',
			endpoint,
			range,
			requestedPerPage: 1000,
			totalItems: Number( data?.pagination?.totalItems || countries.length || 0 ),
			totalCities: cityMarkerDiagnostics.totalCities,
			renderableCities: cityMarkerDiagnostics.renderableCities,
			excludedCitiesCount: cityMarkerDiagnostics.excludedCitiesCount,
			reasonCounts: cityMarkerDiagnostics.reasonCounts,
			topExcludedCities: cityMarkerDiagnostics.topExcludedCities,
		} );
	}, [
		cityMarkerDiagnostics,
		countries.length,
		data?.pagination?.totalItems,
		endpoint,
		logger,
		mapMode,
		range,
	] );
	const formatHits = useCallback(
		( value ) => new Intl.NumberFormat().format( value ),
		[]
	);
	const formatShare = useCallback(
		( value ) =>
			new Intl.NumberFormat( undefined, {
				style: 'percent',
				minimumFractionDigits: 1,
				maximumFractionDigits: 1,
			} ).format( value ),
		[]
	);

	const maxDomainValue = useMemo( () => {
		const apiMax = sanitizeMapValue( data?.maxHits );
		if ( apiMax > 0 ) {
			return apiMax;
		}

		if ( isMarkerMapMode( mapMode ) ) {
			return Math.max(
				...cityMarkers.map( ( marker ) =>
					sanitizeMapValue( marker.hits )
				),
				0
			);
		}

		return Math.max( ...chartData.map( ( value ) => value.value ), 0 );
	}, [ data, chartData, cityMarkers, mapMode ] );

	const mapColorBuckets = useMemo(
		() => buildMapColorBuckets( maxDomainValue, mapColorRange ),
		[ mapColorRange, maxDomainValue ]
	);

	const colorScale = useMemo( () => {
		if ( mapColorBuckets.ranges.length <= 0 ) {
			return scaleQuantize().domain( [ 0, 1 ] ).range( [ NO_DATA_COLOR ] );
		}

		const thresholds = mapColorBuckets.ranges
			.slice( 0, -1 )
			.map( ( [ , end ] ) => end + 1 );

		return scaleThreshold()
			.domain( thresholds )
			.range( mapColorBuckets.colors );
	}, [ mapColorBuckets ] );

	const tooltipColorScale = colorScale;

	const mapLegendItems = useMemo( () => {
		const sanitizedMaxValue = sanitizeMapValue( maxDomainValue );

		if ( sanitizedMaxValue <= 0 ) {
			return [
				{
					color: NO_DATA_COLOR,
					label: formatHits( 0 ),
				},
			];
		}

		return [
			{
				color: NO_DATA_COLOR,
				label: formatHits( 0 ),
			},
			...mapColorBuckets.ranges.map( ( [ start, end ], index ) => ( {
				color: mapColorBuckets.colors[ index ],
				label:
					mapColorBuckets.openEndedLastLabel &&
					index === mapColorBuckets.ranges.length - 1
						? `${ formatHits( start ) }+`
						: `${ formatHits( start ) }–${ formatHits( end ) }`,
			} ) ),
		];
	}, [ formatHits, mapColorBuckets, maxDomainValue ] );

	const hasData = isMarkerMapMode( mapMode )
		? cityMarkers.length > 0
		: totalHits > 0;
	const hasCitiesWithoutRenderableMarkers =
		mapMode === 'cities' && countries.length > 0 && cityMarkers.length === 0;
	const effectiveEmptyLabel = hasCitiesWithoutRenderableMarkers
		? __(
				'City data is available for the selected period, but none of the cities have usable coordinates yet.',
				'bimbeau-privacy-analytics'
		  )
		: emptyLabel;

	useEffect( () => {
		if ( isLoading || error ) {
			return;
		}

		const container = mapContainerRef.current;
		if ( ! container ) {
			return undefined;
		}

		const svg = container.querySelector( 'svg' );
		if ( ! svg ) {
			return undefined;
		}

		markLegendLayerNode( svg );

		const featureLayer = getMapFeatureLayerNode( svg );

		mapSvgRef.current = svg;

		if ( ! featureLayer ) {
			mapLayerRef.current = null;
			return undefined;
		}

		if ( mapLayerRef.current !== featureLayer ) {
			mapLayerRef.current = featureLayer;
			mapContentBoundsRef.current = null;
		}

		return undefined;
	}, [
		choroplethWidth,
		choroplethHeight,
		chartData.length,
		isLoading,
		error,
	] );

	useEffect( () => {
		if ( isLoading || error ) {
			return;
		}

		const layer = mapLayerRef.current;
		const svg = mapSvgRef.current;
		markLegendLayerNode( svg );
		const activeLayer = layer?.isConnected
			? layer
			: getMapFeatureLayerNode( svg );
		if ( ! activeLayer ) {
			return;
		}

		if ( mapLayerRef.current !== activeLayer ) {
			mapLayerRef.current = activeLayer;
		}

		activeLayer.querySelectorAll( 'path' ).forEach( ( path ) => {
			path.setAttribute( 'vector-effect', 'non-scaling-stroke' );
			if ( isMarkerMapMode( mapMode ) ) {
				path.style.pointerEvents = 'none';
			} else {
				path.style.pointerEvents = '';
			}
		} );

		activeLayer.style.pointerEvents = '';

		updateMapContentBounds();
	}, [ viewport, isLoading, error, mapMode, updateMapContentBounds ] );

	useEffect( () => {
		setViewport( ( previousViewport ) =>
			clampViewport( previousViewport )
		);
	}, [ clampViewport ] );

	useEffect( () => {
		if ( isLoading || error || hasAppliedInitialResetRef.current ) {
			return;
		}

		if ( ! mapSvgRef.current ) {
			return;
		}

		hasAppliedInitialResetRef.current = true;
		handleResetViewport();
	}, [ handleResetViewport, isLoading, error ] );

	useEffect( () => {
		if ( mapMode !== 'realtime-markers' ) {
			hasAppliedRealtimeAutoFocusRef.current = false;
			return;
		}

		if (
			isLoading ||
			error ||
			hasAppliedRealtimeAutoFocusRef.current ||
			cityMarkers.length <= 0
		) {
			return;
		}

		const width = Math.max( choroplethWidth, 1 );
		const height = Math.max( choroplethHeight, 1 );
		const baseScale = getBaseProjectionScale( width, height );
		const defaultProjection = projectionById
			.mercator()
			.scale( baseScale )
			.translate( [ width * 0.5, height * 0.5 ] )
			.rotate( [ 0, 0, 0 ] );

		const projectedPoints = cityMarkers
			.map( ( marker ) =>
				defaultProjection( [ marker.longitude, marker.latitude ] )
			)
			.filter(
				( point ) =>
					Array.isArray( point ) &&
					Number.isFinite( point[ 0 ] ) &&
					Number.isFinite( point[ 1 ] )
			);

		if ( projectedPoints.length <= 0 ) {
			return;
		}

		let minX = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;
		projectedPoints.forEach( ( [ x, y ] ) => {
			minX = Math.min( minX, x );
			maxX = Math.max( maxX, x );
			minY = Math.min( minY, y );
			maxY = Math.max( maxY, y );
		} );

		const spanX = Math.max( maxX - minX, width * REALTIME_MARKER_SINGLE_POINT_SPAN_RATIO );
		const spanY = Math.max(
			maxY - minY,
			height * REALTIME_MARKER_SINGLE_POINT_SPAN_RATIO
		);
		const paddedSpanX = spanX * ( 1 + REALTIME_MARKER_AUTO_FOCUS_PADDING_RATIO );
		const paddedSpanY = spanY * ( 1 + REALTIME_MARKER_AUTO_FOCUS_PADDING_RATIO );
		const fittedScale = clamp(
			Math.min( width / Math.max( paddedSpanX, 1 ), height / Math.max( paddedSpanY, 1 ) ),
			VIEWPORT_ZOOM_MIN,
			VIEWPORT_ZOOM_MAX
		);
		const targetScale =
			projectedPoints.length === 1
				? Math.max( fittedScale, REALTIME_MARKER_SINGLE_POINT_TARGET_SCALE )
				: fittedScale;
		const centerX = ( minX + maxX ) / 2;
		const centerY = ( minY + maxY ) / 2;

		hasAppliedRealtimeAutoFocusRef.current = true;
		setViewport( () =>
			clampViewport( {
				scale: targetScale,
				translateX: ( width / 2 - centerX ) * targetScale,
				translateY: ( height / 2 - centerY ) * targetScale,
			} )
		);
	}, [
		choroplethHeight,
		choroplethWidth,
		cityMarkers,
		clampViewport,
		error,
		isLoading,
		mapMode,
	] );

	useEffect( () => stopDrag, [ stopDrag ] );

	useEffect( () => {
		setActiveCityTooltip( null );
	}, [ endpoint, mapMode, range ] );

	useEffect( () => {
		if ( process.env.NODE_ENV === 'production' ) {
			return;
		}

		if ( isLoading || error ) {
			return;
		}

		const container = mapContainerRef.current;
		if ( ! container ) {
			return;
		}

		const computedHeight = window.getComputedStyle( container ).height;
		const numericHeight = Number.parseFloat( computedHeight );

		if ( ! Number.isFinite( numericHeight ) || numericHeight > 0 ) {
			return;
		}

		// eslint-disable-next-line no-console
		console.warn(
			'[BimBeau Privacy Analytics] World map container height resolves to 0px. Check that admin styles are loaded.',
			{
				computedHeight,
			}
		);
	}, [ isLoading, error, hasData ] );

	const mapCursor = isDragging ? 'grabbing' : 'grab';
	const shouldShowGeolocationHelperMessage =
		mapMode !== 'realtime-markers';
	const noGeolocatedVisitsLabel =
		isMarkerMapMode( mapMode )
			? __(
					'No geolocated visits are available. Check your geolocation settings to start collecting city data.',
					'bimbeau-privacy-analytics'
			  )
			: __(
					'No geolocated visits are available. Check your geolocation settings to start collecting country data.',
					'bimbeau-privacy-analytics'
			  );

	const getTooltipData = ( feature ) => {
		const code =
			getFeatureJoinCode( feature, geoJoinKey ) ||
			resolveFeatureId( feature );
		const flagCode =
			code && code.length === 3 ? isoA3ToA2.get( code ) || code : code;
		const isUnknown = ! code || isUnknownCountryCode( code );
		const countryName = ! isUnknown
			? feature?.properties?.NAME_EN || feature?.properties?.NAME || ''
			: '';
		const resolvedName = countryName || unknownCountryLabel;
		const hits =
			! isUnknown && code ? sanitizeMapValue( hitLookup.get( code ) ) : 0;
		const visitsLabel = sprintf(
			/* translators: %s: visitor count. */
			__( '%s visitors', 'bimbeau-privacy-analytics' ),
			formatHits( hits )
		);
		const shareLabel =
			totalHits > 0
				? sprintf(
						/* translators: %s: share of total visitors. */
						__( '%s of total visitors', 'bimbeau-privacy-analytics' ),
						formatShare( hits / totalHits )
				  )
				: '';
		const flagClass = getCountryFlagClass( flagCode );

		return {
			countryName: resolvedName,
			value: hits,
			visitsLabel,
			shareLabel,
			hasData: hits > 0,
			dotColor: hits > 0 ? tooltipColorScale( hits ) : NO_DATA_COLOR,
			code,
			flagClass,
		};
	};

	const updateCityTooltipPosition = useCallback(
		( marker, event ) => {
			const container = mapContainerRef.current;
			if ( ! container || ! marker ) {
				return;
			}

			const containerRect = container.getBoundingClientRect();
			const targetRect = event?.currentTarget?.getBoundingClientRect?.();
			const markerCenterX = targetRect
				? targetRect.left - containerRect.left + targetRect.width / 2
				: 0;
			const markerTopY = targetRect
				? targetRect.top - containerRect.top
				: 0;

			setActiveCityTooltip( {
				id: marker.id,
				x: markerCenterX,
				y: markerTopY,
				cityName: marker.label,
				dotColor: marker.color,
				visitsLabel: sprintf(
					/* translators: %s: visit count. */
					__( '%s visits', 'bimbeau-privacy-analytics' ),
					formatHits( marker.hits )
				),
			} );
		},
		[ formatHits, mapMode ]
	);

	const handleCityMarkerLeave = useCallback( () => {
		setActiveCityTooltip( null );
	}, [] );

	return (
		<BpaCard
			title={ __( 'World map', 'bimbeau-privacy-analytics' ) }
			className="bbpa-world-map-card"
		>
			<DataState
				isLoading={ isLoading }
				error={ error }
				isEmpty={ ! isLoading && ! error && ! hasData }
				emptyLabel={ effectiveEmptyLabel }
				emptyAsNotice={ Boolean( emptyStateNoticeStatus ) }
				emptyNoticeStatus={ emptyStateNoticeStatus || 'warning' }
				loadingLabel={ __( 'Loading world map', 'bimbeau-privacy-analytics' ) }
			/>
			{ ! isLoading && ! error && (
				<>
					{ hasData === false &&
						! effectiveEmptyLabel &&
						shouldShowGeolocationHelperMessage && (
						<p
							className="bbpa-world-map__empty-message"
							role="status"
						>
							{ noGeolocatedVisitsLabel }
						</p>
					) }
					<div className="bbpa-world-map">
						{ topLeftOverlay ? (
							<div className="bbpa-world-map__overlay bbpa-world-map__overlay--top-left">
								{ topLeftOverlay }
							</div>
						) : null }
						<div className="bbpa-world-map__controls">
							<div
								className="components-button-group"
								aria-label={ __(
									'Map zoom controls',
									'bimbeau-privacy-analytics'
								) }
							>
								<Tooltip text={ zoomOutLabel }>
									<Button
										variant="secondary"
										onClick={ handleZoomOut }
										disabled={ isZoomOutDisabled }
										aria-label={ zoomOutLabel }
									>
										<span aria-hidden="true">−</span>
										<VisuallyHidden>
											{ zoomOutLabel }
										</VisuallyHidden>
									</Button>
								</Tooltip>
								<Tooltip text={ zoomInLabel }>
									<Button
										variant="secondary"
										onClick={ handleZoomIn }
										disabled={ isZoomInDisabled }
										aria-label={ zoomInLabel }
									>
										<span aria-hidden="true">+</span>
										<VisuallyHidden>
											{ zoomInLabel }
										</VisuallyHidden>
									</Button>
								</Tooltip>
								<Tooltip text={ resetZoomLabel }>
									<Button
										variant="secondary"
										onClick={ handleResetViewport }
										aria-label={ resetZoomLabel }
									>
										{ __( 'Reset', 'bimbeau-privacy-analytics' ) }
									</Button>
								</Tooltip>
							</div>
							{ controlsSlot }
						</div>
						<div
							className={ `bbpa-world-map__chart${
								mapMode === 'realtime-markers'
									? ' bbpa-world-map__chart--realtime-markers'
									: ''
							}` }
							ref={ mapContainerRef }
							onDoubleClick={ handleMapDoubleClick }
							onPointerDown={ handleMapPointerDown }
							onPointerMove={ handleMapPointerMove }
							onPointerUp={ handleMapPointerUp }
							onPointerCancel={ handleMapPointerUp }
							style={ {
								touchAction: 'none',
								userSelect: isDragging ? 'none' : undefined,
								cursor: mapCursor,
							} }
						>
							<WorldChoropleth
								data={ chartData }
								geoFeatures={ normalizedGeoFeatures }
								maxDomainValue={ maxDomainValue }
								countryColorScale={ colorScale }
								countryColorRange={ mapColorRange }
								width={ choroplethWidth }
								height={ choroplethHeight }
								mapSvgRef={ mapSvgRef }
								mapMode={ mapMode }
								cityMarkers={ cityMarkers }
								viewport={ viewport }
								onCityMarkerEnter={ updateCityTooltipPosition }
								onCityMarkerMove={ updateCityTooltipPosition }
								onCityMarkerLeave={ handleCityMarkerLeave }
								tooltipRenderer={ ( { feature } ) => {
									if ( isMarkerMapMode( mapMode ) ) {
										return null;
									}
									const tooltipData =
										getTooltipData( feature );

									return (
										<WorldMapTooltip
											key={
												tooltipData.code ||
												tooltipData.countryName
											}
											data={ tooltipData }
										/>
									);
								} }
							/>
							{ activeCityTooltip && isMarkerMapMode( mapMode ) && (
								<WorldMapCityTooltip
									data={ activeCityTooltip }
									x={ activeCityTooltip.x }
									y={ activeCityTooltip.y }
								/>
							) }
							{ ! isMarkerMapMode( mapMode ) && (
								<div
									className="bbpa-world-map__legend"
									aria-label={ __(
										'Map legend',
										'bimbeau-privacy-analytics'
									) }
								>
									{ mapLegendItems.map( ( item ) => (
										<div
											className="bbpa-world-map__legend-item"
											key={ item.color }
										>
											<span
												className="bbpa-world-map__legend-swatch"
												style={ {
													backgroundColor: item.color,
												} }
												aria-hidden="true"
											/>
											<span>{ item.label }</span>
										</div>
									) ) }
								</div>
							) }
						</div>
					</div>
				</>
			) }
		</BpaCard>
	);
};

export default WorldMap;
