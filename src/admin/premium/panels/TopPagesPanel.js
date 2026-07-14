import {
	Button,
	Notice,
	Flex,
	FlexItem,
	SelectControl,
	TabPanel,
} from '@wordpress/components';
import { useCallback, useEffect, useMemo, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import {
	LINE_CHART_HEIGHT,
	LINE_CHART_PADDING,
	LINE_CHART_WIDTH,
	buildLineChartData,
} from '../../charts/lineChart';
import ChartFrame from '../../components/ChartFrame';
import DataState from '../../components/DataState';
import BpaCard from '../../components/BpaCard';
import BrandIcon from '../../components/icons/BrandIcon';
import FeatureIcon from '../../components/icons/FeatureIcon';
import PageDetailsHeatMap from '../../components/PageDetailsHeatMap';
import { ADMIN_CONFIG } from '../../constants';
import {
	getPreviousRange,
	getRangeFromSelection,
	isSingleDayRange,
} from '../../lib/date';
import {
	getAdminPanelUrl,
	getInitialPageDetailsSelection,
	getPageDetailsAdminUrl,
	getPageDetailsTab,
} from '../../lib/adminUrls';
import {
	getPageDetailsMetricLabels,
	paginatePageDetailItems,
	sortPageDetailItems,
} from '../../lib/pageDetailsTable';
import {
	calculateChangePercent,
	formatChangePercent,
	formatDurationMetricValue,
} from '../../lib/formatters';
import {
	getPageDetailsHourlyAvailability,
	getPageDetailsHourlyUnavailableReason,
	normalizePageDetailsHourlyItems,
} from '../../lib/pageDetailsHeatmap';
import {
	getCountryFlagClass,
	getCountryLabel,
	isUnknownCountryCode,
} from '../../lib/countryNames';
import { parseTimeBucketDate } from '../../lib/timeBuckets';
import { buildDeviceDetailsBreakdowns } from '../../lib/deviceDetails';
import { createLogger } from '../../logger';
import AudienceBreakdownCards from '../../widgets/AudienceBreakdownCards';
import ReferrerSourcesTableCard from '../../widgets/ReferrerSourcesTableCard';
import VisitorsTableCard from '../../widgets/VisitorsTableCard';
import ReportTableCard from '../../widgets/ReportTableCard';

import TimeseriesChart from '../../widgets/TimeseriesChart';
import useSharedPageLabelDisplay from '../../hooks/useSharedPageLabelDisplay';
import TopPagesListPanel from '../../panels/TopPagesListPanel';
import { isVisitorOriginUnavailable } from '../../lib/geoipStatus';

const DEBUG_FLAG = () =>
	Boolean( window.BBPA_DEBUG ?? ADMIN_CONFIG?.settings?.debugEnabled );

const VisitorOriginUnavailableNotice = () => {
	if ( ! isVisitorOriginUnavailable() ) {
		return null;
	}

	return (
		<Notice status="info" isDismissible={ false }>
			<strong>{ __( 'Visitor origin unavailable', 'bimbeau-privacy-analytics' ) }</strong>
			<p>
				{ __(
					'Visitor origin will be available after the local GeoIP database is installed from the plugin geolocation settings.',
					'bimbeau-privacy-analytics'
				) }
			</p>
		</Notice>
	);
};

const getAdminLocale = () => {
	const configuredLocale = ADMIN_CONFIG?.settings?.locale;
	if ( typeof configuredLocale === 'string' && configuredLocale.trim() ) {
		return configuredLocale.trim().replace( /_/g, '-' );
	}

	if ( typeof document !== 'undefined' && document.documentElement?.lang ) {
		return document.documentElement.lang.trim().replace( /_/g, '-' );
	}

	return undefined;
};

const PageDetailsCountryLabel = ( { label, item } ) => {
	const countryCode = item?.code || item?.label || '';
	const flagClass = getCountryFlagClass( countryCode );
	const isUnknown = ! flagClass || isUnknownCountryCode( countryCode );
	const countryLabel = label || __( 'Unknown country', 'bimbeau-privacy-analytics' );
	const flagLabel = isUnknown
		? __( 'Unknown country flag', 'bimbeau-privacy-analytics' )
		: sprintf(
				/* translators: %s: country name. */
				__( 'Flag of %s', 'bimbeau-privacy-analytics' ),
				countryLabel
		  );

	return (
		<span className="bbpa-country-label">
			{ isUnknown ? (
				<span
					className="bbpa-country-flag bbpa-country-flag--unknown"
					role="img"
					aria-label={ flagLabel }
					title={ flagLabel }
				/>
			) : (
				<span
					className={ `bbpa-country-flag ${ flagClass }` }
					role="img"
					aria-label={ flagLabel }
					title={ flagLabel }
				/>
			) }
			<span>{ countryLabel }</span>
		</span>
	);
};

const renderPageDetailsCountryLabel = ( label, item ) => (
	<PageDetailsCountryLabel label={ label } item={ item } />
);

const buildSingleDayHourlyTimeseriesItems = ( items = [], range ) => {
	if ( ! Array.isArray( items ) || ! range?.start ) {
		return [];
	}

	const selectedDate = new Date( `${ range.start }T00:00:00` );
	let selectedDayOfWeek = null;
	if ( ! Number.isNaN( selectedDate.getTime() ) ) {
		selectedDayOfWeek =
			selectedDate.getDay() === 0 ? 7 : selectedDate.getDay();
	}
	const hasDayOfWeekBuckets = items.some( ( item ) =>
		Number.isFinite( Number( item?.dayOfWeek ) )
	);
	const valuesByHour = new Map();
	items.forEach( ( item ) => {
		const hour = Number( item?.hour );
		if ( Number.isNaN( hour ) || hour < 0 || hour > 23 ) {
			return;
		}

		if ( hasDayOfWeekBuckets && selectedDayOfWeek !== null ) {
			const dayOfWeek = Number( item?.dayOfWeek );
			if ( dayOfWeek !== selectedDayOfWeek ) {
				return;
			}
		}

		valuesByHour.set( hour, Number( item?.value ) || 0 );
	} );

	return Array.from( { length: 24 }, ( _, hour ) => ( {
		bucket: `${ range.start } ${ String( hour ).padStart( 2, '0' ) }:00:00`,
		value: valuesByHour.get( hour ) ?? 0,
	} ) );
};

const formatPageDetailsCityLabel = ( _, item ) => {
	const apiLabel = typeof item?.label === 'string' ? item.label.trim() : '';
	if ( apiLabel ) {
		return apiLabel;
	}

	const city = item?.city_name || '';
	const regionCode = item?.region_code || '';
	const countryCode = item?.country_code || '';
	const cityLabel =
		typeof city === 'string' && city.trim() !== ''
			? city.trim()
			: __( 'Unknown', 'bimbeau-privacy-analytics' );
	const suffix = [ regionCode, countryCode ]
		.map( ( part ) =>
			typeof part === 'string' ? part.trim().toUpperCase() : ''
		)
		.filter( Boolean )
		.join( ', ' );

	return suffix ? `${ cityLabel } (${ suffix })` : cityLabel;
};

const formatDeviceClassLabel = ( value ) => {
	const normalizedValue =
		typeof value === 'string' ? value.trim().toLowerCase() : '';

	if ( normalizedValue === 'mobile' ) {
		return __( 'Smartphone', 'bimbeau-privacy-analytics' );
	}

	if ( normalizedValue === 'desktop' ) {
		return __( 'Desktop', 'bimbeau-privacy-analytics' );
	}

	if ( normalizedValue === 'tablet' ) {
		return __( 'Tablet', 'bimbeau-privacy-analytics' );
	}

	return value || __( 'Unknown', 'bimbeau-privacy-analytics' );
};

const getTopCountryProfile = ( items = [] ) => {
	const normalizedItems = items
		.map( ( item ) => {
			const countryCode =
				typeof item?.label === 'string' ? item.label.trim() : '';

			return {
				countryCode,
				label:
					getCountryLabel( countryCode ) ||
					__( 'Unknown', 'bimbeau-privacy-analytics' ),
				visits: Number( item?.visits || 0 ),
			};
		} )
		.filter( ( item ) => item.visits > 0 );

	if ( normalizedItems.length === 0 ) {
		return null;
	}

	const total = normalizedItems.reduce(
		( sum, item ) => sum + item.visits,
		0
	);
	const topCountry = normalizedItems[ 0 ];
	const share =
		total > 0 ? Math.round( ( topCountry.visits / total ) * 100 ) : 0;

	return {
		label: topCountry.label,
		percentage: `${ share }%`,
		countryCode: topCountry.countryCode,
	};
};

const getTopBreakdownProfile = (
	items = [],
	formatter = ( value ) => value
) => {
	if ( ! Array.isArray( items ) || items.length === 0 ) {
		return null;
	}

	const topItem = items[ 0 ];
	const label = formatter( topItem.label || __( 'Unknown', 'bimbeau-privacy-analytics' ) );

	return {
		label,
		percentage: `${ topItem.share || 0 }%`,
	};
};

const PageDetailsChart = ( {
	isSingleDaySelection = false,
	currentItems,
	previousItems,
	currentSeriesLabel,
	previousSeriesLabel,
	previousSeriesLabelMobile,
	visitsSeriesLabel,
	previousVisitsSeriesLabel,
	previousVisitsSeriesLabelMobile,
	visitsItems,
	previousVisitsItems,
} ) => {
	const [ chartWidth, setChartWidth ] = useState( LINE_CHART_WIDTH );
	const [ activePoint, setActivePoint ] = useState( null );
	const adminLocale = useMemo( () => getAdminLocale(), [] );
	const hourLabelFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat( adminLocale, {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
			} ),
		[ adminLocale ]
	);
	const normalizeBucketLabel = useCallback(
		( value ) => {
			if ( typeof value !== 'string' ) {
				return value;
			}

			if ( ! isSingleDaySelection ) {
				return value;
			}

			const date = parseTimeBucketDate( value );

			if ( ! date ) {
				return value;
			}

			return hourLabelFormatter.format( date );
		},
		[ hourLabelFormatter, isSingleDaySelection ]
	);
	const currentSeries = useMemo(
		() =>
			currentItems.map( ( item ) => ( {
				bucket: normalizeBucketLabel( item.bucket ),
				value: item.value,
			} ) ),
		[ currentItems, normalizeBucketLabel ]
	);
	const previousSeries = useMemo( () => {
		const previousValuesByBucket = new Map(
			previousItems.map( ( item ) => [ item.bucket, item.value ?? 0 ] )
		);

		return currentItems.map( ( item ) => ( {
			bucket: normalizeBucketLabel( item.bucket ),
			value: previousValuesByBucket.get( item.bucket ) ?? 0,
		} ) );
	}, [ currentItems, normalizeBucketLabel, previousItems ] );
	const hasCompatibleHourlySeries = useMemo( () => {
		if ( ! isSingleDaySelection ) {
			return true;
		}

		const buildBucketSet = ( seriesItems = [] ) =>
			new Set( seriesItems.map( ( item ) => item?.bucket ) );
		const expectedBuckets = currentItems.map( ( item ) => item.bucket );
		const seriesBucketSets = [
			buildBucketSet( previousItems ),
			buildBucketSet( visitsItems || [] ),
			buildBucketSet( previousVisitsItems || [] ),
		];

		return expectedBuckets.every( ( bucket ) =>
			seriesBucketSets.every(
				( seriesSet ) => seriesSet.size === 0 || seriesSet.has( bucket )
			)
		);
	}, [
		currentItems,
		isSingleDaySelection,
		previousItems,
		previousVisitsItems,
		visitsItems,
	] );
	const chartData = useMemo(
		() => buildLineChartData( currentSeries, previousSeries, chartWidth ),
		[ currentSeries, previousSeries, chartWidth ]
	);
	const visitsChartData = useMemo( () => {
		if ( ! visitsItems || ! previousVisitsItems ) {
			return null;
		}

		const previousVisitsValuesByBucket = new Map(
			previousVisitsItems.map( ( item ) => [
				item.bucket,
				item.value ?? 0,
			] )
		);
		const visitsValuesByBucket = new Map(
			visitsItems.map( ( item ) => [ item.bucket, item.value ?? 0 ] )
		);
		const visitsCurrentSeries = currentItems.map( ( item ) => ( {
			bucket: normalizeBucketLabel( item.bucket ),
			value: visitsValuesByBucket.get( item.bucket ) ?? 0,
		} ) );
		const visitsPreviousSeries = currentItems.map( ( item ) => ( {
			bucket: normalizeBucketLabel( item.bucket ),
			value: previousVisitsValuesByBucket.get( item.bucket ) ?? 0,
		} ) );

		return buildLineChartData(
			visitsCurrentSeries,
			visitsPreviousSeries,
			chartWidth
		);
	}, [
		currentItems,
		normalizeBucketLabel,
		previousVisitsItems,
		visitsItems,
		chartWidth,
	] );
	const axisDateFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat( adminLocale, {
				day: '2-digit',
				month: 'short',
			} ),
		[ adminLocale ]
	);
	const tooltipDateFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat( adminLocale, {
				day: '2-digit',
				month: '2-digit',
				year: '2-digit',
			} ),
		[ adminLocale ]
	);
	const numberFormatter = useMemo( () => new Intl.NumberFormat(), [] );

	const formatAxisLabel = useCallback(
		( value ) => {
			if ( isSingleDaySelection ) {
				return value;
			}
			const date = parseTimeBucketDate( value );
			if ( ! date ) {
				return value;
			}

			return axisDateFormatter.format( date );
		},
		[ axisDateFormatter, isSingleDaySelection ]
	);
	const formatTooltipDate = useCallback(
		( value ) => {
			if ( isSingleDaySelection ) {
				return value;
			}
			const date = parseTimeBucketDate( value );
			if ( ! date ) {
				return value;
			}

			return tooltipDateFormatter.format( date );
		},
		[ isSingleDaySelection, tooltipDateFormatter ]
	);
	const handleChartResize = useCallback( ( { width } ) => {
		setChartWidth( ( previousWidth ) => {
			const nextWidth = Math.max(
				Math.round( width ),
				LINE_CHART_PADDING * 2 + 1
			);

			return previousWidth === nextWidth ? previousWidth : nextWidth;
		} );
	}, [] );
	const pointSummaries = useMemo(
		() =>
			new Map(
				chartData.currentPoints.map( ( point ) => [
					point.label,
					sprintf(
						/* translators: 1: formatted date, 2: current metric label, 3: current metric count, 4: visitors label, 5: visitors count, 6: previous metric label, 7: previous metric count, 8: previous visitors label, 9: previous visitors count */
						__(
							'%1$s: %2$s %3$s, %4$s %5$s, %6$s %7$s, %8$s %9$s',
							'bimbeau-privacy-analytics'
						),
						formatTooltipDate( point.label ),
						currentSeriesLabel,
						numberFormatter.format( point.currentValue ),
						visitsSeriesLabel,
						numberFormatter.format(
							visitsChartData?.currentPoints.find(
								( visitsPoint ) =>
									visitsPoint.label === point.label
							)?.currentValue ?? 0
						),
						previousSeriesLabel,
						numberFormatter.format( point.previousValue ),
						previousVisitsSeriesLabel,
						numberFormatter.format(
							visitsChartData?.currentPoints.find(
								( visitsPoint ) =>
									visitsPoint.label === point.label
							)?.previousValue ?? 0
						)
					),
				] )
			),
		[
			chartData.currentPoints,
			currentSeriesLabel,
			formatTooltipDate,
			numberFormatter,
			previousSeriesLabel,
			previousVisitsSeriesLabel,
			visitsChartData,
			visitsSeriesLabel,
		]
	);
	const handleChartMouseMove = useCallback(
		( event ) => {
			if ( ! chartData.currentPoints.length ) {
				return;
			}

			const bounds = event.currentTarget.getBoundingClientRect();
			if ( ! bounds.width ) {
				return;
			}

			const relativeX =
				( ( event.clientX - bounds.left ) / bounds.width ) *
				chartData.width;
			const clampedX = Math.min(
				chartData.width - chartData.padding,
				Math.max( chartData.padding, relativeX )
			);
			const pointSpan =
				chartData.currentPoints[ chartData.currentPoints.length - 1 ]
					.x - chartData.currentPoints[ 0 ].x;
			const step =
				chartData.currentPoints.length > 1
					? pointSpan / ( chartData.currentPoints.length - 1 )
					: 0;
			const index =
				step > 0
					? Math.round(
							( clampedX - chartData.currentPoints[ 0 ].x ) / step
					  )
					: 0;
			const closestPoint =
				chartData.currentPoints[
					Math.min(
						chartData.currentPoints.length - 1,
						Math.max( 0, index )
					)
				] ?? chartData.currentPoints[ 0 ];

			setActivePoint( ( previousPoint ) =>
				previousPoint?.label === closestPoint.label
					? previousPoint
					: closestPoint
			);
		},
		[ chartData ]
	);

	if ( ! hasCompatibleHourlySeries || ! chartData.currentPoints.length ) {
		return null;
	}

	return (
		<div className="bbpa-timeseries bbpa-timeseries--pageViews">
			<Flex className="bbpa-timeseries__legend" align="center" wrap>
				<FlexItem>
					<span className="bbpa-timeseries__legend-item">
						<span
							className="bbpa-timeseries__legend-swatch"
							aria-hidden="true"
						/>
						{ currentSeriesLabel }
					</span>
				</FlexItem>
				<FlexItem>
					<span className="bbpa-timeseries__legend-item">
						<span
							className="bbpa-timeseries__legend-swatch bbpa-timeseries__legend-swatch--previous"
							aria-hidden="true"
						/>
						<span className="bbpa-timeseries__legend-text">
							<span className="bbpa-timeseries__legend-text-desktop">
								{ previousSeriesLabel }
							</span>
							<span className="bbpa-timeseries__legend-text-mobile">
								{ previousSeriesLabelMobile ??
									previousSeriesLabel }
							</span>
						</span>
					</span>
				</FlexItem>
				{ visitsChartData && (
					<>
						<FlexItem>
							<span className="bbpa-timeseries__legend-item">
								<span
									className="bbpa-timeseries__legend-swatch bbpa-timeseries__legend-swatch--visits"
									aria-hidden="true"
								/>
								{ visitsSeriesLabel }
							</span>
						</FlexItem>
						<FlexItem>
							<span className="bbpa-timeseries__legend-item">
								<span
									className="bbpa-timeseries__legend-swatch bbpa-timeseries__legend-swatch--previous bbpa-timeseries__legend-swatch--previous-visits"
									aria-hidden="true"
								/>
								<span className="bbpa-timeseries__legend-text">
									<span className="bbpa-timeseries__legend-text-desktop">
										{ previousVisitsSeriesLabel }
									</span>
									<span className="bbpa-timeseries__legend-text-mobile">
										{ previousVisitsSeriesLabelMobile ??
											previousVisitsSeriesLabel }
									</span>
								</span>
							</span>
						</FlexItem>
					</>
				) }
			</Flex>
			<ChartFrame
				height={ LINE_CHART_HEIGHT }
				ariaLabel={ __( 'Daily page detail line chart', 'bimbeau-privacy-analytics' ) }
				onResize={ handleChartResize }
			>
				<div
					className="bbpa-timeseries__chart"
					onMouseLeave={ () => setActivePoint( null ) }
				>
					<svg
						viewBox={ `0 0 ${ chartData.width } ${ chartData.height }` }
						width="100%"
						height="100%"
						preserveAspectRatio="xMidYMid meet"
						className="bbpa-timeseries__svg"
						role="img"
						aria-label={ __(
							'Daily page detail line chart',
							'bimbeau-privacy-analytics'
						) }
						onMouseMove={ handleChartMouseMove }
					>
						<defs>
							<linearGradient
								id="bbpa-page-details-gradient"
								x1="0"
								y1="0"
								x2="0"
								y2="1"
							>
								<stop
									offset="0%"
									stopColor="var(--bbpa-timeseries-line-color)"
									stopOpacity="var(--bbpa-timeseries-gradient-opacity, 0.35)"
								/>
								<stop
									offset="100%"
									stopColor="var(--bbpa-timeseries-line-color)"
									stopOpacity="0"
								/>
							</linearGradient>
						</defs>
						<rect
							x="0"
							y="0"
							width={ chartData.width }
							height={ chartData.height }
							className="bbpa-timeseries__bg"
						/>
						{ chartData.yTicks.map( ( tick ) => (
							<g key={ `tick-${ tick.value }-${ tick.y }` }>
								<line
									x1={ chartData.padding }
									y1={ tick.y }
									x2={ chartData.width - chartData.padding }
									y2={ tick.y }
									className="bbpa-timeseries__grid-line"
								/>
								<text
									x={ chartData.padding - 8 }
									y={ tick.y + 4 }
									textAnchor="end"
									className="bbpa-timeseries__axis-label bbpa-timeseries__axis-label--y"
								>
									{ numberFormatter.format( tick.value ) }
								</text>
							</g>
						) ) }
						<line
							x1={ chartData.padding }
							y1={ chartData.padding }
							x2={ chartData.padding }
							y2={ chartData.height - chartData.padding }
							className="bbpa-timeseries__axis"
						/>
						<line
							x1={ chartData.padding }
							y1={ chartData.height - chartData.padding }
							x2={ chartData.width - chartData.padding }
							y2={ chartData.height - chartData.padding }
							className="bbpa-timeseries__axis"
						/>
						{ activePoint && (
							<line
								x1={ activePoint.x }
								y1={ chartData.padding }
								x2={ activePoint.x }
								y2={ chartData.height - chartData.padding }
								className="bbpa-timeseries__hover-line"
							/>
						) }
						<path
							d={ chartData.currentAreaPath }
							className="bbpa-timeseries__area bbpa-timeseries__area--current"
							fill="url(#bbpa-page-details-gradient)"
						/>
						<path
							d={ chartData.currentLinePath }
							className="bbpa-timeseries__line bbpa-timeseries__line--current"
						/>
						<path
							d={ chartData.previousLinePath }
							className="bbpa-timeseries__line bbpa-timeseries__line--previous"
						/>
						{ visitsChartData && (
							<>
								<path
									d={ visitsChartData.currentLinePath }
									className="bbpa-timeseries__line bbpa-timeseries__line--visits-current"
								/>
								<path
									d={ visitsChartData.previousLinePath }
									className="bbpa-timeseries__line bbpa-timeseries__line--previous bbpa-timeseries__line--visits-previous"
								/>
							</>
						) }
						{ chartData.xLabels.map( ( label ) => (
							<text
								key={ `label-${ label.label }` }
								x={ label.x }
								y={ chartData.height - chartData.padding + 18 }
								textAnchor="middle"
								className="bbpa-timeseries__axis-label"
							>
								{ formatAxisLabel( label.label ) }
							</text>
						) ) }
						{ chartData.currentPoints.map( ( point ) => (
							<circle
								key={ `${ point.label }-${ point.currentValue }` }
								cx={ point.x }
								cy={ point.y }
								r="4"
								className={ `bbpa-timeseries__point${
									activePoint?.label === point.label
										? ' is-active'
										: ''
								}` }
								onMouseEnter={ () => setActivePoint( point ) }
								onFocus={ () => setActivePoint( point ) }
								onBlur={ () => setActivePoint( null ) }
								tabIndex="0"
								aria-label={ pointSummaries.get( point.label ) }
							>
								<title>
									{ pointSummaries.get( point.label ) }
								</title>
							</circle>
						) ) }
					</svg>
					{ activePoint && (
						<div
							key={ `${ activePoint.label }-${ activePoint.currentValue }` }
							className="bbpa-timeseries__tooltip"
							role="status"
							style={ {
								left: `${
									( activePoint.x / chartData.width ) * 100
								}%`,
								top: `calc(${
									( activePoint.y / chartData.height ) * 100
								}% - 3px)`,
							} }
						>
							<div className="bbpa-timeseries__tooltip-date">
								{ formatTooltipDate( activePoint.label ) }
							</div>
							<div className="bbpa-timeseries__tooltip-metric">
								<span className="bbpa-timeseries__tooltip-bullet bbpa-timeseries__tooltip-bullet--pageviews-current" />
								{ sprintf(
									/* translators: 1: metric label, 2: metric value. */
									__( '%1$s: %2$s', 'bimbeau-privacy-analytics' ),
									currentSeriesLabel,
									numberFormatter.format(
										activePoint.currentValue
									)
								) }
							</div>
							<div className="bbpa-timeseries__tooltip-metric">
								<span className="bbpa-timeseries__tooltip-bullet bbpa-timeseries__tooltip-bullet--pageviews-previous" />
								{ sprintf(
									/* translators: 1: metric label, 2: metric value. */
									__( '%1$s: %2$s', 'bimbeau-privacy-analytics' ),
									previousSeriesLabel,
									numberFormatter.format(
										activePoint.previousValue
									)
								) }
							</div>
							{ visitsChartData && (
								<>
									<div className="bbpa-timeseries__tooltip-metric">
										<span className="bbpa-timeseries__tooltip-bullet bbpa-timeseries__tooltip-bullet--visits-current" />
										{ sprintf(
											/* translators: 1: metric label, 2: metric value. */
											__( '%1$s: %2$s', 'bimbeau-privacy-analytics' ),
											visitsSeriesLabel,
											numberFormatter.format(
												visitsChartData.currentPoints.find(
													( point ) =>
														point.label ===
														activePoint.label
												)?.currentValue ?? 0
											)
										) }
									</div>
									<div className="bbpa-timeseries__tooltip-metric">
										<span className="bbpa-timeseries__tooltip-bullet bbpa-timeseries__tooltip-bullet--visits-previous" />
										{ sprintf(
											/* translators: 1: metric label, 2: metric value. */
											__( '%1$s: %2$s', 'bimbeau-privacy-analytics' ),
											previousVisitsSeriesLabel,
											numberFormatter.format(
												visitsChartData.currentPoints.find(
													( point ) =>
														point.label ===
														activePoint.label
												)?.previousValue ?? 0
											)
										) }
									</div>
								</>
							) }
						</div>
					) }
				</div>
			</ChartFrame>
		</div>
	);
};

const PageDetailsPanel = ( { range, source, selectedPage, onBack } ) => {
	const handleBackClick = ( event ) => {
		event.preventDefault();
		event.stopPropagation();
		onBack();
	};
	const logger = useMemo(
		() => createLogger( { debugEnabled: DEBUG_FLAG } ),
		[]
	);
	const [ page, setPage ] = useState( 1 );
	const [ perPage, setPerPage ] = useState( 10 );
	const [ orderBy, setOrderBy ] = useState( 'value' );
	const [ order, setOrder ] = useState( 'desc' );
	const [ pageLabelDisplay, setPageLabelDisplay ] =
		useSharedPageLabelDisplay();
	const selectedPagePath = selectedPage?.label || '';
	const selectedPageTitle = selectedPage?.page_title || '';
	const { metricLabel } = useMemo(
		() => getPageDetailsMetricLabels( source ),
		[ source ]
	);
	const previousRange = useMemo( () => getPreviousRange( range ), [ range ] );
	const isTopPagesSource = source === 'top-pages';
	const isSingleDaySelection = useMemo(
		() => isSingleDayRange( range ),
		[ range ]
	);
	const detailsEndpoint = isSingleDaySelection
		? '/admin/page-details/hourly'
		: '/admin/page-details';
	const detailsRequestRange = useMemo( () => range, [ range ] );
	const previousDetailsRequestRange = useMemo(
		() => previousRange,
		[ previousRange ]
	);
	const { data, isLoading, error } = useAdminEndpoint( detailsEndpoint, {
		...detailsRequestRange,
		page_path: selectedPagePath,
		source,
	} );
	const {
		data: hourlyData,
		isLoading: isHourlyLoading,
		error: hourlyError,
	} = useAdminEndpoint( '/admin/page-details/hourly', {
		...detailsRequestRange,
		page_path: selectedPagePath,
		source,
	} );
	const {
		data: previousData,
		isLoading: isPreviousLoading,
		error: previousError,
	} = useAdminEndpoint(
		detailsEndpoint,
		{
			...( previousDetailsRequestRange || {} ),
			page_path: selectedPagePath,
			source,
		},
		{
			enabled: Boolean( previousDetailsRequestRange ),
		}
	);
	const {
		data: visitsData,
		isLoading: isVisitsLoading,
		error: visitsError,
	} = useAdminEndpoint(
		detailsEndpoint,
		{
			...detailsRequestRange,
			page_path: selectedPagePath,
			source: 'entry-pages',
		},
		{
			enabled: isTopPagesSource,
		}
	);
	const {
		data: previousVisitsData,
		isLoading: isPreviousVisitsLoading,
		error: previousVisitsError,
	} = useAdminEndpoint(
		detailsEndpoint,
		{
			...( previousDetailsRequestRange || {} ),
			page_path: selectedPagePath,
			source: 'entry-pages',
		},
		{
			enabled: isTopPagesSource && Boolean( previousDetailsRequestRange ),
		}
	);
	const items = useMemo( () => data?.items || [], [ data ] );
	const previousItems = useMemo(
		() => previousData?.items || [],
		[ previousData ]
	);
	const visitsItems = useMemo(
		() => visitsData?.items || [],
		[ visitsData ]
	);
	const previousVisitsItems = useMemo(
		() => previousVisitsData?.items || [],
		[ previousVisitsData ]
	);
	const hourlyItems = useMemo(
		() => normalizePageDetailsHourlyItems( hourlyData?.items ),
		[ hourlyData ]
	);
	const chartItems = useMemo(
		() =>
			isSingleDaySelection
				? buildSingleDayHourlyTimeseriesItems(
						hourlyData?.items,
						range
				  )
				: items,
		[ hourlyData?.items, isSingleDaySelection, items, range ]
	);
	const previousChartItems = useMemo(
		() =>
			isSingleDaySelection
				? buildSingleDayHourlyTimeseriesItems(
						previousData?.items,
						range
				  )
				: previousItems,
		[ isSingleDaySelection, previousData?.items, previousItems, range ]
	);
	const hasVisitsHourlyBuckets = useMemo(
		() =>
			Array.isArray( visitsData?.items ) &&
			visitsData.items.some( ( item ) =>
				Number.isFinite( Number( item?.hour ) )
			),
		[ visitsData?.items ]
	);
	const hasPreviousVisitsHourlyBuckets = useMemo(
		() =>
			Array.isArray( previousVisitsData?.items ) &&
			previousVisitsData.items.some( ( item ) =>
				Number.isFinite( Number( item?.hour ) )
			),
		[ previousVisitsData?.items ]
	);
	const visitsChartItems = useMemo(
		() =>
			isSingleDaySelection
				? buildSingleDayHourlyTimeseriesItems(
						hasVisitsHourlyBuckets
							? visitsData?.items
							: hourlyData?.items,
						range
				  )
				: visitsItems,
		[
			hasVisitsHourlyBuckets,
			hourlyData?.items,
			isSingleDaySelection,
			range,
			visitsData?.items,
			visitsItems,
		]
	);
	const previousVisitsChartItems = useMemo(
		() =>
			isSingleDaySelection
				? buildSingleDayHourlyTimeseriesItems(
						hasPreviousVisitsHourlyBuckets
							? previousVisitsData?.items
							: previousData?.items,
						range
				  )
				: previousVisitsItems,
		[
			hasPreviousVisitsHourlyBuckets,
			isSingleDaySelection,
			previousData?.items,
			range,
			previousVisitsData?.items,
			previousVisitsItems,
		]
	);
	const isHourlyAvailable = useMemo(
		() => getPageDetailsHourlyAvailability( hourlyData ),
		[ hourlyData ]
	);
	const hourlyUnavailableReason = useMemo(
		() => getPageDetailsHourlyUnavailableReason( hourlyData ),
		[ hourlyData ]
	);
	const sortedItems = useMemo(
		() => sortPageDetailItems( items, orderBy, order ),
		[ items, orderBy, order ]
	);
	const paginatedItems = useMemo(
		() => paginatePageDetailItems( sortedItems, page, perPage ),
		[ sortedItems, page, perPage ]
	);
	const isPanelLoading =
		isLoading ||
		isPreviousLoading ||
		isHourlyLoading ||
		( isTopPagesSource && ( isVisitsLoading || isPreviousVisitsLoading ) );
	const panelError =
		error ||
		previousError ||
		hourlyError ||
		( isTopPagesSource ? visitsError || previousVisitsError : null );
	const totalPages = paginatedItems.pagination.totalPages;
	const totalItems = paginatedItems.pagination.totalItems;
	const currentPage = paginatedItems.pagination.page;
	const canPrevious = currentPage > 1;
	const canNext = currentPage < totalPages;
	const totalValueFormatter = useMemo( () => new Intl.NumberFormat(), [] );
	const totalValue = useMemo(
		() =>
			items.reduce(
				( sum, item ) => sum + ( Number( item?.value ) || 0 ),
				0
			),
		[ items ]
	);
	const previousTotalValue = useMemo(
		() =>
			previousItems.reduce(
				( sum, item ) => sum + ( Number( item?.value ) || 0 ),
				0
			),
		[ previousItems ]
	);
	const totalChangeLabel = useMemo( () => {
		const change = calculateChangePercent( totalValue, previousTotalValue );

		return formatChangePercent( change );
	}, [ previousTotalValue, totalValue ] );
	const totalChangeStatus = useMemo( () => {
		const change = calculateChangePercent( totalValue, previousTotalValue );

		if ( change > 0 ) {
			return 'success';
		}

		if ( change < 0 ) {
			return 'error';
		}

		if ( change === 0 || Object.is( change, -0 ) ) {
			return 'warning';
		}

		return 'info';
	}, [ previousTotalValue, totalValue ] );
	const orderLabel =
		order === 'asc'
			? __( 'Ascending', 'bimbeau-privacy-analytics' )
			: __( 'Descending', 'bimbeau-privacy-analytics' );
	const fallbackPageLabel =
		selectedPagePath === '/'
			? __( 'Accueil', 'bimbeau-privacy-analytics' )
			: selectedPagePath;
	const { data: selectedTopPageData } = useAdminEndpoint(
		'/top-pages',
		{
			...range,
			page_path: selectedPagePath,
			page: 1,
			per_page: 1,
			orderby: 'hits',
			order: 'desc',
		},
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
			enabled: isTopPagesSource && Boolean( selectedPagePath ),
		}
	);
	const selectedTopPageRow = useMemo(
		() => ( selectedTopPageData?.items || [] )[ 0 ] || null,
		[ selectedTopPageData?.items ]
	);
	const hydratedPageTitle = useMemo(
		() =>
			selectedPageTitle ||
			( typeof selectedTopPageRow?.page_title === 'string'
				? selectedTopPageRow.page_title
				: '' ),
		[ selectedPageTitle, selectedTopPageRow?.page_title ]
	);
	const displayedPageLabel =
		pageLabelDisplay === 'title' && hydratedPageTitle
			? hydratedPageTitle
			: fallbackPageLabel;
	const averageTimeOnPageMs = useMemo( () => {
		const selectedValue = Number( selectedPage?.avg_time_on_page_ms );
		if ( Number.isFinite( selectedValue ) && selectedValue > 0 ) {
			return selectedValue;
		}

		const topPageValue = Number( selectedTopPageRow?.avg_time_on_page_ms );
		if ( Number.isFinite( topPageValue ) && topPageValue > 0 ) {
			return topPageValue;
		}

		return 0;
	}, [
		selectedPage?.avg_time_on_page_ms,
		selectedTopPageRow?.avg_time_on_page_ms,
	] );
	const averageTimeOnPageLabel = useMemo(
		() => formatDurationMetricValue( averageTimeOnPageMs ),
		[ averageTimeOnPageMs ]
	);
	const selectedPostId = Number( selectedPage?.post_id ) || 0;
	const hydratedPostId = useMemo( () => {
		if ( selectedPostId > 0 ) {
			return selectedPostId;
		}

		const topPagePostId = Number( selectedTopPageRow?.post_id );
		if ( Number.isFinite( topPagePostId ) && topPagePostId > 0 ) {
			return topPagePostId;
		}

		return 0;
	}, [ selectedPostId, selectedTopPageRow?.post_id ] );
	const postEditUrl =
		hydratedPostId > 0
			? `/wp-admin/post.php?post=${ hydratedPostId }&action=edit`
			: '';
	const frontPageUrl = useMemo( () => {
		if ( ! selectedPagePath || typeof window === 'undefined' ) {
			return '';
		}

		try {
			return new window.URL(
				selectedPagePath,
				window.location.origin
			).toString();
		} catch ( urlError ) {
			return '';
		}
	}, [ selectedPagePath ] );
	const detailsRequestParams = useMemo(
		() => ( {
			page_path: selectedPagePath,
		} ),
		[ selectedPagePath ]
	);
	const { data: visitorsDetailsData, isLoading: isVisitorsDetailsLoading } =
		useAdminEndpoint(
			'/visitors',
			{
				...range,
				...detailsRequestParams,
				page: 1,
				per_page: 500,
				orderby: 'pages',
				order: 'desc',
			},
			{
				namespace: ADMIN_CONFIG?.settings?.restNamespace,
			}
		);
	const { data: countriesDetailsData, isLoading: isCountriesDetailsLoading } =
		useAdminEndpoint(
			'/geo-countries',
			{
				...range,
				...detailsRequestParams,
				page: 1,
				per_page: 100,
				orderby: 'visits',
				order: 'desc',
			},
			{
				namespace: ADMIN_CONFIG?.settings?.restNamespace,
			}
		);
	const visitorDetailsStats = useMemo(
		() => buildDeviceDetailsBreakdowns( visitorsDetailsData?.items || [] ),
		[ visitorsDetailsData ]
	);
	const isProfileDetailsLoading =
		isPanelLoading || isVisitorsDetailsLoading || isCountriesDetailsLoading;
	const noDataLabel = __( 'No data', 'bimbeau-privacy-analytics' );
	const profileRows = useMemo(
		() => [
			{
				label: __( 'Country', 'bimbeau-privacy-analytics' ),
				kind: 'country',
				value: getTopCountryProfile(
					countriesDetailsData?.items || []
				),
			},
			{
				label: __( 'Browser', 'bimbeau-privacy-analytics' ),
				kind: 'browser',
				value: getTopBreakdownProfile( visitorDetailsStats.browsers ),
			},
			{
				label: __( 'System', 'bimbeau-privacy-analytics' ),
				kind: 'os',
				value: getTopBreakdownProfile(
					visitorDetailsStats.operatingSystems
				),
			},
			{
				label: __( 'Device', 'bimbeau-privacy-analytics' ),
				kind: 'device',
				value: getTopBreakdownProfile(
					visitorDetailsStats.devices,
					formatDeviceClassLabel
				),
			},
		],
		[ countriesDetailsData?.items, visitorDetailsStats ]
	);

	useEffect( () => {
		setPage( 1 );
		setPerPage( 10 );
		setOrderBy( 'value' );
		setOrder( 'desc' );
	}, [ range.end, range.start, selectedPagePath, source ] );

	useEffect( () => {
		if ( page > totalPages ) {
			setPage( totalPages );
		}
	}, [ page, totalPages ] );

	useEffect( () => {
		if ( ! selectedPagePath ) {
			return;
		}

		logger.debug( 'Page details daily payload received', {
			action: 'page-details.daily.payload',
			source,
			pagePath: selectedPagePath,
			range,
			itemsCount: items.length,
			nonZeroDays: items.filter( ( item ) => Number( item?.value ) > 0 )
				.length,
			totalValue,
			hasError: Boolean( error ),
		} );
	}, [ error, items, logger, range, selectedPagePath, source, totalValue ] );

	useEffect( () => {
		if ( ! selectedPagePath ) {
			return;
		}

		logger.debug( 'Page details hourly heatmap payload received', {
			action: 'page-details.hourly.payload',
			source,
			pagePath: selectedPagePath,
			range,
			hourlyAvailable: isHourlyAvailable,
			hourlyUnavailableReason,
			itemsCount: hourlyItems.length,
			nonZeroCells: hourlyItems.filter(
				( item ) => Number( item?.value ) > 0
			).length,
			hasError: Boolean( hourlyError ),
		} );
	}, [
		hourlyData,
		hourlyError,
		hourlyItems,
		hourlyUnavailableReason,
		isHourlyAvailable,
		logger,
		range,
		selectedPagePath,
		source,
	] );

	return (
		<div className="bbpa-page-details">
			<div className="bbpa-page-details__overview-grid">
				<BpaCard title={ __( 'Summary', 'bimbeau-privacy-analytics' ) }>
					<div className="bbpa-page-details__summary">
						<div className="bbpa-page-details__summary-columns">
							<div className="bbpa-page-details__summary-column bbpa-page-details__summary-column--main">
								<div className="bbpa-page-details__summary-top-row">
									<p className="bbpa-page-details__value-row">
										{ isProfileDetailsLoading ? (
											<span className="bbpa-kpi-card__value-skeleton" />
										) : (
											<strong className="bbpa-page-details__total">
												{ totalValueFormatter.format(
													totalValue
												) }
											</strong>
										) }
										{ ! isPanelLoading &&
											totalChangeLabel && (
												<span
													className={ `bbpa-kpi-card__badge bbpa-kpi-card__badge--${ totalChangeStatus }` }
												>
													{ totalChangeLabel }
												</span>
											) }
									</p>
									<span
										className="bbpa-key-stats__views-icon bbpa-page-details__views-icon-corner"
										aria-hidden="true"
									>
										<FeatureIcon
											name="pageViews"
											size={ 18 }
										/>
									</span>
								</div>
								<p className="bbpa-page-details__path">
									{ isProfileDetailsLoading ? (
										<span className="bbpa-kpi-card__value-skeleton" />
									) : (
										displayedPageLabel
									) }
								</p>
								<p className="bbpa-page-details__avg-time">
									{ isPanelLoading
										? ' '
										: sprintf(
												/* translators: %s: Formatted average time spent on the page. */
												__(
													'Avg. time on page: %s',
													'bimbeau-privacy-analytics'
												),
												averageTimeOnPageLabel
										  ) }
								</p>
							</div>
							<div className="bbpa-page-details__summary-column">
								<div className="bbpa-page-details__kpi-grid">
									{ profileRows.map( ( row ) => {
										const profileLabel =
											row.value?.label || noDataLabel;
										const profilePercentage =
											row.value?.percentage ||
											noDataLabel;

										return (
											<div
												key={ row.label }
												className="bbpa-page-details__profile-kpi"
											>
												<p className="bbpa-kpi-card__label">
													{ row.label }
												</p>
												<p className="bbpa-kpi-card__value-row">
													{ isProfileDetailsLoading ? (
														<span className="bbpa-kpi-card__value-skeleton" />
													) : (
														<span className="bbpa-kpi-card__value">
															{
																profilePercentage
															}
														</span>
													) }
												</p>
												<p className="bbpa-page-details__profile-kpi-dimension">
													{ isProfileDetailsLoading ? (
														<span className="bbpa-kpi-card__value-skeleton" />
													) : (
														<span className="bbpa-brand-label">
															<BrandIcon
																kind={
																	row.kind
																}
																value={
																	profileLabel
																}
																className="bbpa-brand-icon"
															/>
															<span>
																{ profileLabel }
															</span>
														</span>
													) }
												</p>
											</div>
										);
									} ) }
								</div>
							</div>
						</div>
						<Flex justify="flex-start" gap={ 2 }>
							<Button
								variant="secondary"
								type="button"
								onClick={ handleBackClick }
							>
								{ __( 'Back', 'bimbeau-privacy-analytics' ) }
							</Button>
							{ frontPageUrl && (
								<Button
									variant="secondary"
									href={ frontPageUrl }
									target="_blank"
									rel="noreferrer"
								>
									{ __( 'View', 'bimbeau-privacy-analytics' ) }
								</Button>
							) }
							{ postEditUrl && (
								<Button variant="link" href={ postEditUrl }>
									{ __( 'Open in WordPress', 'bimbeau-privacy-analytics' ) }
								</Button>
							) }
						</Flex>
					</div>
				</BpaCard>
				<BpaCard title={ __( 'Daily page views', 'bimbeau-privacy-analytics' ) }>
					<div className="bbpa-page-details__chart-block">
						{ ! isPanelLoading &&
							! panelError &&
							chartItems.length > 0 && (
								<PageDetailsChart
									isSingleDaySelection={
										isSingleDaySelection
									}
									currentItems={ chartItems }
									previousItems={ previousChartItems }
									currentSeriesLabel={ __(
										'Page views',
										'bimbeau-privacy-analytics'
									) }
									previousSeriesLabel={ __(
										'Prev. page views',
										'bimbeau-privacy-analytics'
									) }
									previousSeriesLabelMobile={ __(
										'Prev. page views',
										'bimbeau-privacy-analytics'
									) }
									visitsSeriesLabel={ __(
										'Visitors',
										'bimbeau-privacy-analytics'
									) }
									previousVisitsSeriesLabel={ __(
										'Prev. visitors',
										'bimbeau-privacy-analytics'
									) }
									previousVisitsSeriesLabelMobile={ __(
										'Prev. visitors',
										'bimbeau-privacy-analytics'
									) }
									visitsItems={
										isTopPagesSource
											? visitsChartItems
											: null
									}
									previousVisitsItems={
										isTopPagesSource
											? previousVisitsChartItems
											: null
									}
								/>
							) }
					</div>
					<DataState
						isLoading={ isPanelLoading }
						error={ panelError }
						isEmpty={
							! isPanelLoading &&
							! panelError &&
							items.length === 0
						}
						emptyLabel={ __(
							'No details available for this page.',
							'bimbeau-privacy-analytics'
						) }
					/>
				</BpaCard>
			</div>
			{ ! isPanelLoading && ! panelError && items.length > 0 && (
				<>
					<div className="bbpa-page-details__overview-grid">
						<BpaCard title={ __( 'Hourly heatmap', 'bimbeau-privacy-analytics' ) }>
							<PageDetailsHeatMap
								items={ hourlyItems }
								hourlyAvailable={ isHourlyAvailable }
								hourlyUnavailableReason={
									hourlyUnavailableReason
								}
								metricLabel={ metricLabel }
								source={ source }
							/>
						</BpaCard>
						<BpaCard title={ __( 'Page views list', 'bimbeau-privacy-analytics' ) }>
							<div className="bbpa-table-controls">
								<div className="bbpa-table-controls__group">
									<SelectControl
										label={ __( 'Sort by', 'bimbeau-privacy-analytics' ) }
										value={ orderBy }
										options={ [
											{
												label: metricLabel,
												value: 'value',
											},
											{
												label: __(
													'Date',
													'bimbeau-privacy-analytics'
												),
												value: 'bucket',
											},
										] }
										onChange={ ( value ) => {
											setOrderBy( value );
											setPage( 1 );
										} }
										__next40pxDefaultSize
										__nextHasNoMarginBottom
									/>
									<SelectControl
										label={ __( 'Display', 'bimbeau-privacy-analytics' ) }
										value={ pageLabelDisplay }
										options={ [
											{
												label: __(
													'URL',
													'bimbeau-privacy-analytics'
												),
												value: 'url',
											},
											{
												label: __(
													'Title',
													'bimbeau-privacy-analytics'
												),
												value: 'title',
											},
										] }
										onChange={ ( value ) =>
											setPageLabelDisplay( value )
										}
										disabled={ ! hydratedPageTitle }
										__next40pxDefaultSize
										__nextHasNoMarginBottom
									/>
									<Button
										variant="secondary"
										onClick={ () => {
											setOrder(
												order === 'asc' ? 'desc' : 'asc'
											);
											setPage( 1 );
										} }
									>
										{ orderLabel }
									</Button>
									<SelectControl
										className="bbpa-table-controls__rows-control"
										label={ __( 'Rows', 'bimbeau-privacy-analytics' ) }
										value={ String( perPage ) }
										options={ [
											{ label: '5', value: '5' },
											{ label: '10', value: '10' },
											{ label: '20', value: '20' },
										] }
										onChange={ ( value ) => {
											setPerPage( Number( value ) );
											setPage( 1 );
										} }
										__next40pxDefaultSize
										__nextHasNoMarginBottom
									/>
								</div>
							</div>
							<div className="bbpa-table-scroll">
								<table
									className="widefat striped bbpa-report-table"
									aria-label={ __(
										'Table: Page details by date',
										'bimbeau-privacy-analytics'
									) }
								>
									<thead>
										<tr>
											<th scope="col">
												{ __( 'Date', 'bimbeau-privacy-analytics' ) }
											</th>
											<th scope="col">{ metricLabel }</th>
										</tr>
									</thead>
									<tbody>
										{ paginatedItems.items.map(
											( item ) => (
												<tr key={ item.bucket }>
													<td>{ item.bucket }</td>
													<td>{ item.value }</td>
												</tr>
											)
										) }
									</tbody>
								</table>
							</div>
							<Flex
								className="bbpa-table-pagination"
								justify="space-between"
								align="center"
							>
								<FlexItem>
									<div className="components-button-group">
										<Button
											variant="secondary"
											onClick={ () =>
												setPage( ( previousPage ) =>
													Math.max(
														previousPage - 1,
														1
													)
												)
											}
											disabled={ ! canPrevious }
										>
											{ __( 'Previous', 'bimbeau-privacy-analytics' ) }
										</Button>
										<Button
											variant="secondary"
											onClick={ () =>
												setPage( ( previousPage ) =>
													Math.min(
														previousPage + 1,
														totalPages
													)
												)
											}
											disabled={ ! canNext }
										>
											{ __( 'Next', 'bimbeau-privacy-analytics' ) }
										</Button>
									</div>
								</FlexItem>
								<FlexItem className="bbpa-table-pagination__meta">
									{ `${ __(
										'Page',
										'bimbeau-privacy-analytics'
									) } ${ currentPage } ${ __(
										'of',
										'bimbeau-privacy-analytics'
									) } ${ totalPages }` }
								</FlexItem>
								<FlexItem className="bbpa-table-pagination__meta">
									{ `${ totalItems } ${ __(
										'items',
										'bimbeau-privacy-analytics'
									) }` }
								</FlexItem>
							</Flex>
						</BpaCard>
					</div>
					<ReferrerSourcesTableCard
						range={ range }
						requestParams={ detailsRequestParams }
					/>
					<VisitorsTableCard
						range={ range }
						requestParams={ detailsRequestParams }
					/>
					<AudienceBreakdownCards
						range={ range }
						requestParams={ detailsRequestParams }
						includeResolutions
					/>
					<div className="bbpa-page-details__geo-grid">
						<VisitorOriginUnavailableNotice />
						<ReportTableCard
							title={ __( 'Top countries', 'bimbeau-privacy-analytics' ) }
							labelHeader={ __( 'Country', 'bimbeau-privacy-analytics' ) }
							range={ range }
							endpoint="/geo-countries"
							emptyLabel={ __(
								'No country data available.',
								'bimbeau-privacy-analytics'
							) }
							labelFallback={ __( 'Unknown', 'bimbeau-privacy-analytics' ) }
							requestParams={ detailsRequestParams }
							formatLabel={ getCountryLabel }
							renderLabel={ renderPageDetailsCountryLabel }
							metricLabel={ __( 'Visits', 'bimbeau-privacy-analytics' ) }
							metricValueKey="visits"
							showMetricTrend
						/>
						{}
					</div>
				</>
			) }
		</div>
	);
};

const TopPagesPanel = ( { rangeSelection } ) => {
	const range = useMemo(
		() => getRangeFromSelection( rangeSelection ),
		[ rangeSelection ]
	);
	const initialPageDetailsSelection = useMemo(
		() => getInitialPageDetailsSelection(),
		[]
	);
	const [ selectedPage, setSelectedPage ] = useState(
		initialPageDetailsSelection.selectedPage
	);
	const [ selectedSource, setSelectedSource ] = useState(
		initialPageDetailsSelection.selectedSource
	);

	const openDetails = useCallback( ( source ) => {
		return ( item ) => {
			if ( typeof window !== 'undefined' && window.history ) {
				const detailUrl = getPageDetailsAdminUrl( item?.label, source );
				if ( detailUrl ) {
					window.history.pushState( {}, '', detailUrl );
				}
			}

			setSelectedPage( item || null );
			setSelectedSource( source );
		};
	}, [] );

	const closeDetails = useCallback( () => {
		if ( typeof window !== 'undefined' && window.history ) {
			const listUrl = getAdminPanelUrl( 'top-pages', {
				bbpa_tab: getPageDetailsTab( selectedSource ),
			} );

			if ( listUrl ) {
				window.history.pushState( {}, '', listUrl );
			}
		}

		setSelectedPage( null );
	}, [ selectedSource ] );

	useEffect( () => {
		if ( typeof window === 'undefined' ) {
			return undefined;
		}

		const onPopState = () => {
			const nextSelection = getInitialPageDetailsSelection();
			setSelectedPage( nextSelection.selectedPage );
			setSelectedSource( nextSelection.selectedSource );
		};

		window.addEventListener( 'popstate', onPopState );

		return () => {
			window.removeEventListener( 'popstate', onPopState );
		};
	}, [] );

	if ( selectedPage ) {
		return (
			<PageDetailsPanel
				range={ range }
				source={ selectedSource }
				selectedPage={ selectedPage }
				onBack={ closeDetails }
			/>
		);
	}

	return (
		<TopPagesListPanel
			rangeSelection={ rangeSelection }
			onOpenDetails={ openDetails }
			getRowHref={ ( source ) => ( item ) =>
				getPageDetailsAdminUrl( item?.label, source )
			}
		/>
	);
};

export default TopPagesPanel;
