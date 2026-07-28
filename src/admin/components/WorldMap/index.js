import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from '@wordpress/element';
import { Choropleth, projectionById } from '@nivo/geo';
import { __, sprintf } from '@wordpress/i18n';
import { Button, Tooltip, VisuallyHidden } from '@wordpress/components';
import { scaleQuantize } from 'd3-scale';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import { ADMIN_CONFIG } from '../../constants';
import BpaCard from '../BpaCard';
import DataState from '../DataState';
import worldGeo from '../../data/world-countries.geojson';
import {
	buildHeatmapThemeColorRange,
	DEFAULT_HEATMAP_THEME_COLOR,
} from '../../lib/heatmapTheme';
import {
	INITIAL_VIEWPORT,
	VIEWPORT_ZOOM_MAX,
	VIEWPORT_ZOOM_MIN,
	VIEWPORT_ZOOM_STEP,
	clampViewportToMapBounds,
	zoomViewportAtPoint,
} from './mapViewport';

export const NO_DATA_COLOR = '#eeeeee';
const FALLBACK_WIDTH = 960;
const FALLBACK_HEIGHT = 420;
const CODE_ALIASES = { EL: 'GR', FX: 'FR', UK: 'GB' };
const ALPHA3_OVERRIDES = {
	FRA: 'FR',
	GBR: 'GB',
	GRC: 'GR',
	NOR: 'NO',
	USA: 'US',
};
const FALLBACK_COLOR_RANGE = [
	'rgb(239, 241, 254)',
	'rgb(219, 226, 251)',
	'rgb(191, 201, 247)',
	'rgb(156, 171, 244)',
	'rgb(112, 135, 239)',
	DEFAULT_HEATMAP_THEME_COLOR,
];

export const normalizeMapValue = ( value ) => {
	if ( value === null || value === undefined || value === '' ) {
		return 0;
	}
	const numericValue = Number( value );
	return Number.isFinite( numericValue ) && numericValue > 0
		? numericValue
		: 0;
};

export const normalizeColorRange = ( range ) => {
	if ( ! Array.isArray( range ) ) {
		return FALLBACK_COLOR_RANGE;
	}
	const colors = range.filter(
		( color ) => typeof color === 'string' && color.trim()
	);
	return colors.length >= 2 ? colors : FALLBACK_COLOR_RANGE;
};

export const normalizeCode = ( value ) => {
	const code = String( value || '' )
		.trim()
		.toUpperCase();
	return CODE_ALIASES[ code ] || ALPHA3_OVERRIDES[ code ] || code;
};

export const selectCountryEntries = ( data ) => {
	if ( Array.isArray( data?.countries ) && data.countries.length > 0 ) {
		return data.countries;
	}
	return Array.isArray( data?.items ) ? data.items : [];
};

const featureCode = ( feature ) => {
	const properties = feature?.properties || {};
	return normalizeCode(
		( properties.ISO_A2 !== '-99' && properties.ISO_A2 ) ||
			( properties.WB_A2 !== '-99' && properties.WB_A2 ) ||
			properties.ADM0_A3 ||
			properties.ISO_A3 ||
			feature?.id
	);
};

const featureName = ( feature ) =>
	feature?.properties?.NAME_EN ||
	feature?.properties?.ADMIN ||
	featureCode( feature );

const collectGeometryRings = ( coordinates, rings = [] ) => {
	if ( ! Array.isArray( coordinates ) ) {
		return rings;
	}
	const isRing =
		coordinates.length >= 3 &&
		coordinates.every(
			( position ) =>
				Array.isArray( position ) &&
				Number.isFinite( Number( position[ 0 ] ) ) &&
				Number.isFinite( Number( position[ 1 ] ) )
		);
	if ( isRing ) {
		rings.push(
			coordinates.map( ( position ) => [
				Number( position[ 0 ] ),
				Number( position[ 1 ] ),
			] )
		);
		return rings;
	}
	coordinates.forEach( ( child ) => collectGeometryRings( child, rings ) );
	return rings;
};

export const getCountryRepresentativePoint = ( feature ) => {
	const rings = collectGeometryRings( feature?.geometry?.coordinates );
	const polygonMetrics = rings.map( ( ring ) => {
		let twiceArea = 0;
		let firstTotal = 0;
		let secondTotal = 0;
		for ( let index = 0; index < ring.length; index += 1 ) {
			const current = ring[ index ];
			const next = ring[ ( index + 1 ) % ring.length ];
			const cross = current[ 0 ] * next[ 1 ] - next[ 0 ] * current[ 1 ];
			twiceArea += cross;
			firstTotal += ( current[ 0 ] + next[ 0 ] ) * cross;
			secondTotal += ( current[ 1 ] + next[ 1 ] ) * cross;
		}
		return {
			area: Math.abs( twiceArea ),
			point:
				Math.abs( twiceArea ) > Number.EPSILON
					? [
							firstTotal / ( 3 * twiceArea ),
							secondTotal / ( 3 * twiceArea ),
					  ]
					: null,
		};
	} );
	const largestPolygon = polygonMetrics.sort(
		( left, right ) => right.area - left.area
	)[ 0 ];
	if ( ! largestPolygon?.point?.every( Number.isFinite ) ) {
		return null;
	}
	return largestPolygon.point;
};

export const CountryMarkerLayer = ( {
	features = [],
	projection,
	markerData = [],
} ) => {
	if (
		typeof projection !== 'function' ||
		! Array.isArray( features ) ||
		! Array.isArray( markerData )
	) {
		return null;
	}
	const markers = new Map(
		markerData
			.map( ( item ) => ( {
				...item,
				id: normalizeCode( item?.id ),
				value: normalizeMapValue( item?.value ),
			} ) )
			.filter( ( item ) => item.id && item.value > 0 )
			.map( ( item ) => [ item.id, item ] )
	);
	return (
		<g className="bbpa-world-map__country-markers">
			{ features.map( ( feature ) => {
				const marker = markers.get( featureCode( feature ) );
				const representativePoint = marker
					? getCountryRepresentativePoint( feature )
					: null;
				const projectedPoint = representativePoint
					? projection( representativePoint )
					: null;
				if ( ! marker || ! projectedPoint?.every( Number.isFinite ) ) {
					return null;
				}
				return (
					<circle
						key={ marker.id }
						cx={ projectedPoint[ 0 ] }
						cy={ projectedPoint[ 1 ] }
						r={ Math.min( 18, 5 + Math.sqrt( marker.value ) * 2 ) }
						fill={ DEFAULT_HEATMAP_THEME_COLOR }
						stroke="#ffffff"
						strokeWidth="2"
					>
						<title>{ `${ marker.label }: ${ marker.value }` }</title>
					</circle>
				);
			} ) }
		</g>
	);
};

export const createCountryMarkerProjection = ( {
	width,
	height,
	zoom = 1,
} ) => {
	const safeWidth = Number( width );
	const safeHeight = Number( height );
	const safeZoom = normalizeMapValue( zoom ) || 1;
	const projectionFactory = projectionById?.mercator;

	if (
		typeof projectionFactory !== 'function' ||
		! Number.isFinite( safeWidth ) ||
		! Number.isFinite( safeHeight ) ||
		safeWidth <= 0 ||
		safeHeight <= 0
	) {
		return null;
	}

	return projectionFactory()
		.scale( 130 * safeZoom )
		.translate( [ safeWidth * 0.5, safeHeight * 0.5 ] );
};

export const normalizeCountryData = (
	entries = [],
	features = worldGeo.features || []
) => {
	const safeEntries = Array.isArray( entries ) ? entries : [];
	const safeFeatures = Array.isArray( features ) ? features : [];
	const names = new Map(
		safeFeatures.map( ( feature ) => [
			featureName( feature ).toLowerCase(),
			featureCode( feature ),
		] )
	);
	const values = new Map();
	safeEntries.forEach( ( entry ) => {
		const rawCode = entry?.code || entry?.country_code || entry?.label;
		const code =
			normalizeCode( rawCode ) ||
			names.get(
				String( entry?.country || entry?.label || '' ).toLowerCase()
			);
		if ( ! code ) {
			return;
		}
		const value = normalizeMapValue(
			entry?.visitors ??
				entry?.visits ??
				entry?.hits ??
				entry?.metric ??
				entry?.count
		);
		if ( value === 0 ) {
			return;
		}
		values.set( code, ( values.get( code ) || 0 ) + value );
	} );
	return safeFeatures
		.map( ( feature ) => ( {
			id: featureCode( feature ),
			value: values.get( featureCode( feature ) ) || 0,
		} ) )
		.filter( ( item ) => item.id && item.value > 0 );
};

export const WorldChoropleth = ( {
	data = [],
	geoFeatures = [],
	maxDomainValue,
	tooltipRenderer,
	width = FALLBACK_WIDTH,
	height = FALLBACK_HEIGHT,
	colorRange,
	viewport = INITIAL_VIEWPORT,
	markerData = [],
} ) => {
	const range = normalizeColorRange(
		colorRange || buildHeatmapThemeColorRange( DEFAULT_HEATMAP_THEME_COLOR )
	);
	const sanitizedData = Array.isArray( data )
		? data
				.map( ( item ) => ( {
					...item,
					value: normalizeMapValue( item?.value ),
				} ) )
				.filter( ( item ) => item.id && item.value > 0 )
		: [];
	const sanitizedMaxDomainValue = Math.max(
		normalizeMapValue( maxDomainValue ),
		...sanitizedData.map( ( item ) => item.value ),
		0
	);
	const domain = [ 0, Math.max( 1, sanitizedMaxDomainValue ) ];
	const colorScale = scaleQuantize().domain( domain ).range( range );
	const safeMarkerData = Array.isArray( markerData ) ? markerData : [];
	const markerProjection = createCountryMarkerProjection( {
		width,
		height,
		zoom: viewport.scale,
	} );
	const baseProjectionScale = Math.max(
		110,
		Math.min( 460, Math.max( width / 6.7, height / 2.95 ) )
	);
	return (
		<Choropleth
			data={ sanitizedData }
			features={ Array.isArray( geoFeatures ) ? geoFeatures : [] }
			match="id"
			value="value"
			colors={ colorScale }
			unknownColor={ NO_DATA_COLOR }
			domain={ domain }
			projectionType="mercator"
			projectionScale={ baseProjectionScale * viewport.scale }
			projectionTranslation={ [
				0.5 + viewport.translateX / Math.max( width, 1 ),
				0.5 + viewport.translateY / Math.max( height, 1 ),
			] }
			borderWidth={ 0.5 }
			borderColor="#ffffff"
			tooltip={ tooltipRenderer }
			layers={
				safeMarkerData.length > 0
					? [
							'features',
							( layerProps ) => (
								<CountryMarkerLayer
									{ ...layerProps }
									features={
										Array.isArray( geoFeatures )
											? geoFeatures
											: []
									}
									projection={ markerProjection }
									markerData={ safeMarkerData }
								/>
							),
					  ]
					: undefined
			}
			width={ width }
			height={ height }
		/>
	);
};

const WorldMap = ( {
	range,
	endpoint = '/geo-countries',
	emptyLabel,
	emptyStateNoticeStatus,
	unknownCountryLabel = __( 'Unknown country', 'bimbeau-privacy-analytics' ),
	dataOverride,
	isLoadingOverride,
	errorOverride,
	topLeftOverlay,
	controlsSlot,
	mapMode = 'countries',
} ) => {
	const chartRef = useRef( null );
	const [ dimensions, setDimensions ] = useState( {
		width: FALLBACK_WIDTH,
		height: FALLBACK_HEIGHT,
	} );
	const [ viewport, setViewport ] = useState( { ...INITIAL_VIEWPORT } );
	const [ isDragging, setIsDragging ] = useState( false );
	const pointersRef = useRef( new Map() );
	const dragRef = useRef( null );
	const pinchRef = useRef( null );
	const params = useMemo(
		() => ( {
			from: range?.from,
			to: range?.to,
			per_page: 250,
			orderby: 'hits',
			order: 'desc',
		} ),
		[ range?.from, range?.to ]
	);
	const endpointOptions = dataOverride
		? { namespace: ADMIN_CONFIG?.settings?.restNamespace, enabled: false }
		: { namespace: ADMIN_CONFIG?.settings?.restNamespace };
	const endpointState = useAdminEndpoint( endpoint, params, endpointOptions );
	const data = dataOverride ?? endpointState.data;
	const isLoading = isLoadingOverride ?? endpointState.isLoading;
	const error = errorOverride ?? endpointState.error;
	useEffect( () => {
		const node = chartRef.current;
		if ( ! node ) {
			return undefined;
		}
		const measure = () => {
			const width = Math.max(
				280,
				Math.round(
					node.getBoundingClientRect().width || FALLBACK_WIDTH
				)
			);
			setDimensions( {
				width,
				height: Math.max(
					320,
					Math.min( FALLBACK_HEIGHT, Math.round( width * 0.55 ) )
				),
			} );
		};
		measure();
		const observer =
			typeof window.ResizeObserver === 'function'
				? new window.ResizeObserver( measure )
				: null;
		observer?.observe( node );
		window.addEventListener( 'resize', measure );
		return () => {
			observer?.disconnect();
			window.removeEventListener( 'resize', measure );
		};
	}, [] );
	const countryEntries = useMemo( () => {
		return selectCountryEntries( data );
	}, [ data ] );
	const chartData = useMemo(
		() => normalizeCountryData( countryEntries ),
		[ countryEntries ]
	);
	const countryMarkerData = useMemo(
		() =>
			mapMode === 'country-markers'
				? countryEntries
						.map( ( entry ) => ( {
							id: normalizeCode(
								entry?.country_code || entry?.code || entry?.id
							),
							label:
								entry?.label ||
								entry?.country ||
								entry?.country_code ||
								entry?.code,
							value: normalizeMapValue(
								entry?.visits ?? entry?.visitors ?? entry?.count
							),
							pages: Array.isArray( entry?.pages )
								? entry.pages
								: [],
						} ) )
						.filter( ( item ) => item.id && item.value > 0 )
				: [],
		[ countryEntries, mapMode ]
	);
	const maxDomainValue = Math.max(
		normalizeMapValue(
			data?.maxVisitors ??
				data?.max_visitors ??
				data?.maxHits ??
				data?.max_hits
		),
		...chartData.map( ( item ) => item.value ),
		0
	);
	const hasData =
		mapMode === 'country-markers'
			? countryMarkerData.length > 0
			: chartData.some( ( item ) => item.value > 0 );
	const applyZoom = useCallback(
		( scale, x = dimensions.width / 2, y = dimensions.height / 2 ) =>
			setViewport( ( current ) =>
				zoomViewportAtPoint(
					current,
					scale,
					x,
					y,
					dimensions.width,
					dimensions.height
				)
			),
		[ dimensions.height, dimensions.width ]
	);
	const getMapPoint = useCallback( ( clientX, clientY ) => {
		const rect = chartRef.current?.getBoundingClientRect?.();
		return {
			x: ( Number( clientX ) || 0 ) - ( rect?.left || 0 ),
			y: ( Number( clientY ) || 0 ) - ( rect?.top || 0 ),
		};
	}, [] );
	const handlePointerDown = useCallback(
		( event ) => {
			event.currentTarget.setPointerCapture?.( event.pointerId );
			pointersRef.current.set( event.pointerId, {
				x: event.clientX,
				y: event.clientY,
			} );
			if ( pointersRef.current.size === 2 ) {
				const [ first, second ] = pointersRef.current.values();
				pinchRef.current = {
					distance: Math.hypot(
						second.x - first.x,
						second.y - first.y
					),
					scale: viewport.scale,
				};
				return;
			}
			dragRef.current = {
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY,
			};
			setIsDragging( true );
		},
		[ viewport.scale ]
	);
	const handlePointerMove = useCallback(
		( event ) => {
			if ( ! pointersRef.current.has( event.pointerId ) ) {
				return;
			}
			pointersRef.current.set( event.pointerId, {
				x: event.clientX,
				y: event.clientY,
			} );
			if ( pointersRef.current.size === 2 && pinchRef.current ) {
				const [ first, second ] = pointersRef.current.values();
				const distance = Math.hypot(
					second.x - first.x,
					second.y - first.y
				);
				const center = getMapPoint(
					( first.x + second.x ) / 2,
					( first.y + second.y ) / 2
				);
				applyZoom(
					pinchRef.current.scale *
						( distance / pinchRef.current.distance ),
					center.x,
					center.y
				);
				return;
			}
			if ( dragRef.current?.id !== event.pointerId ) {
				return;
			}
			event.preventDefault();
			const deltaX = event.clientX - dragRef.current.x;
			const deltaY = event.clientY - dragRef.current.y;
			dragRef.current = {
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY,
			};
			setViewport( ( current ) =>
				clampViewportToMapBounds(
					{
						...current,
						translateX: current.translateX + deltaX,
						translateY: current.translateY + deltaY,
					},
					dimensions.width,
					dimensions.height
				)
			);
		},
		[ applyZoom, dimensions.height, dimensions.width, getMapPoint ]
	);
	const handlePointerUp = useCallback( ( event ) => {
		pointersRef.current.delete( event.pointerId );
		event.currentTarget.releasePointerCapture?.( event.pointerId );
		dragRef.current = null;
		pinchRef.current = null;
		setIsDragging( false );
	}, [] );
	useEffect(
		() => () => {
			pointersRef.current.clear();
			dragRef.current = null;
			pinchRef.current = null;
		},
		[]
	);

	return (
		<BpaCard
			title={ __( 'World map', 'bimbeau-privacy-analytics' ) }
			className="bbpa-world-map-card"
		>
			{ ( isLoading || error || ! hasData ) && (
				<DataState
					isLoading={ isLoading }
					error={ error }
					emptyLabel={ emptyLabel }
					emptyStateNoticeStatus={ emptyStateNoticeStatus }
				/>
			) }
			{ ! isLoading && ! error && (
				<div className="bbpa-world-map" ref={ chartRef }>
					<div
						className="bbpa-world-map__chart"
						style={ {
							height: dimensions.height,
							touchAction: 'none',
							cursor: isDragging ? 'grabbing' : 'grab',
						} }
						onDoubleClick={ ( event ) => {
							const point = getMapPoint(
								event.clientX,
								event.clientY
							);
							applyZoom(
								viewport.scale + VIEWPORT_ZOOM_STEP,
								point.x,
								point.y
							);
						} }
						onPointerDown={ handlePointerDown }
						onPointerMove={ handlePointerMove }
						onPointerUp={ handlePointerUp }
						onPointerCancel={ handlePointerUp }
					>
						{ topLeftOverlay ? (
							<div className="bbpa-world-map__overlay bbpa-world-map__overlay--top-left">
								{ topLeftOverlay }
							</div>
						) : null }
						<div className="bbpa-world-map__controls">
							<Tooltip
								text={ __(
									'Zoom in',
									'bimbeau-privacy-analytics'
								) }
							>
								<Button
									variant="secondary"
									label={ __(
										'Zoom in',
										'bimbeau-privacy-analytics'
									) }
									disabled={
										viewport.scale >= VIEWPORT_ZOOM_MAX
									}
									onClick={ () =>
										applyZoom(
											viewport.scale + VIEWPORT_ZOOM_STEP
										)
									}
								>
									<span aria-hidden="true">+</span>
									<VisuallyHidden>
										{ __(
											'Zoom in',
											'bimbeau-privacy-analytics'
										) }
									</VisuallyHidden>
								</Button>
							</Tooltip>
							<Tooltip
								text={ __(
									'Zoom out',
									'bimbeau-privacy-analytics'
								) }
							>
								<Button
									variant="secondary"
									label={ __(
										'Zoom out',
										'bimbeau-privacy-analytics'
									) }
									disabled={
										viewport.scale <= VIEWPORT_ZOOM_MIN
									}
									onClick={ () =>
										applyZoom(
											viewport.scale - VIEWPORT_ZOOM_STEP
										)
									}
								>
									<span aria-hidden="true">−</span>
									<VisuallyHidden>
										{ __(
											'Zoom out',
											'bimbeau-privacy-analytics'
										) }
									</VisuallyHidden>
								</Button>
							</Tooltip>
							<Button
								variant="secondary"
								onClick={ () =>
									setViewport( { ...INITIAL_VIEWPORT } )
								}
							>
								{ __( 'Reset', 'bimbeau-privacy-analytics' ) }
							</Button>
							{ controlsSlot }
						</div>
						<WorldChoropleth
							data={
								mapMode === 'country-markers' ? [] : chartData
							}
							markerData={ countryMarkerData }
							geoFeatures={ worldGeo.features || [] }
							maxDomainValue={ maxDomainValue }
							width={ dimensions.width }
							height={ dimensions.height }
							viewport={ viewport }
							tooltipRenderer={ ( { feature } ) => {
								const name = featureName( feature );
								const value = Number( feature?.value ) || 0;
								return (
									<div className="bbpa-world-map__tooltip">
										<strong>
											{ name || unknownCountryLabel }
										</strong>
										<span>
											{ sprintf(
												/* translators: %s: visit count. */ __(
													'%s visits',
													'bimbeau-privacy-analytics'
												),
												value
											) }
										</span>
									</div>
								);
							} }
						/>
						<div className="bbpa-world-map__legend">
							<div className="bbpa-world-map__legend-item">
								<span
									className="bbpa-world-map__legend-swatch"
									style={ { background: NO_DATA_COLOR } }
								/>
								<span>
									{ __(
										'No data',
										'bimbeau-privacy-analytics'
									) }
								</span>
							</div>
							{ normalizeColorRange().map(
								( color, index, colors ) => (
									<div
										className="bbpa-world-map__legend-item"
										key={ color }
									>
										<span
											className="bbpa-world-map__legend-swatch"
											style={ { background: color } }
										/>
										<span>{ `${ Math.max(
											1,
											Math.ceil(
												( maxDomainValue * index ) /
													colors.length
											)
										) }–${ Math.max(
											1,
											Math.ceil(
												( maxDomainValue *
													( index + 1 ) ) /
													colors.length
											)
										) }` }</span>
									</div>
								)
							) }
						</div>
					</div>
				</div>
			) }
		</BpaCard>
	);
};

export default WorldMap;
