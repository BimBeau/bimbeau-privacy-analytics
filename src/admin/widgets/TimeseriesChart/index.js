import { useCallback, useMemo, useState } from '@wordpress/element';
import { Flex, FlexItem } from '@wordpress/components';
import { __, _n, sprintf } from '@wordpress/i18n';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import ChartFrame from '../../components/ChartFrame';
import DataState from '../../components/DataState';
import BpaCard from '../../components/BpaCard';
import {
	LINE_CHART_HEIGHT,
	LINE_CHART_PADDING,
	LINE_CHART_WIDTH,
	buildLineChartData,
} from '../../charts/lineChart';
import {
	getPreviousRange,
	isSingleDayRange,
	toHourlyRange,
} from '../../lib/date';
import { parseTimeBucketDate } from '../../lib/timeBuckets';
import { ADMIN_CONFIG } from '../../constants';

const metricConfig = {
	overview: {
		key: 'pageViews',
		secondaryKey: 'visitors',
		previousKey: 'pageViews',
		previousSecondaryKey: 'visitors',
		label: __( 'Page views', 'bimbeau-privacy-analytics' ),
		secondaryLabel: __( 'Visitors', 'bimbeau-privacy-analytics' ),
		previousLabel: __( 'Previous page views', 'bimbeau-privacy-analytics' ),
		previousSecondaryLabel: __( 'Previous visitors', 'bimbeau-privacy-analytics' ),
		previousLabelMobile: __( 'Prev. page views', 'bimbeau-privacy-analytics' ),
		previousSecondaryLabelMobile: __( 'Prev. visitors', 'bimbeau-privacy-analytics' ),
		title: __( 'Daily page views and visitors', 'bimbeau-privacy-analytics' ),
		ariaLabel: __(
			'Daily page views and visitors line chart',
			'bimbeau-privacy-analytics'
		),
		comparePreviousRange: true,
		supportsOverviewComparison: true,
	},
	pageViews: {
		key: 'pageViews',
		label: __( 'Page views', 'bimbeau-privacy-analytics' ),
		title: __( 'Daily page views', 'bimbeau-privacy-analytics' ),
		ariaLabel: __( 'Daily page views line chart', 'bimbeau-privacy-analytics' ),
		tooltipLabel: ( value ) =>
			`${ new Intl.NumberFormat().format( value ) } ${ _n(
				'page view',
				'page views',
				value,
				'bimbeau-privacy-analytics'
			) }`,
	},
	visits: {
		key: 'visits',
		label: __( 'Visitors', 'bimbeau-privacy-analytics' ),
		title: __( 'Daily visitors', 'bimbeau-privacy-analytics' ),
		ariaLabel: __( 'Daily visitors line chart', 'bimbeau-privacy-analytics' ),
		tooltipLabel: ( value ) =>
			`${ new Intl.NumberFormat().format( value ) } ${ _n(
				'visitor',
				'visitors',
				value,
				'bimbeau-privacy-analytics'
			) }`,
		comparePreviousRange: true,
	},
};

const TimeseriesChart = ( { range, metric = 'pageViews' } ) => {
	const config = metricConfig[ metric ] ?? metricConfig.pageViews;
	const comparePreviousRange = config.comparePreviousRange !== false;
	const isOverviewComparison = Boolean( config.supportsOverviewComparison );
	const isSingleDaySelection = useMemo(
		() => isSingleDayRange( range ),
		[ range ]
	);
	const endpoint = isSingleDaySelection
		? '/admin/timeseries/hour'
		: '/admin/timeseries/day';
	const requestRange = useMemo(
		() => ( isSingleDaySelection ? toHourlyRange( range ) : range ),
		[ isSingleDaySelection, range ]
	);
	const previousRange = useMemo( () => getPreviousRange( range ), [ range ] );
	const previousRequestRange = useMemo(
		() =>
			isSingleDaySelection
				? toHourlyRange( previousRange )
				: previousRange,
		[ isSingleDaySelection, previousRange ]
	);
	const {
		data: currentData,
		isLoading: isCurrentLoading,
		error: currentError,
	} = useAdminEndpoint( endpoint, requestRange );
	const {
		data: previousData,
		isLoading: isPreviousLoading,
		error: previousError,
	} = useAdminEndpoint( endpoint, previousRequestRange, {
		enabled: comparePreviousRange && Boolean( previousRange ),
	} );
	const items = currentData?.items ?? [];
	const previousItems = previousData?.items ?? [];
	const currentSeries = useMemo(
		() =>
			items.map( ( item ) => ( {
				bucket: item.bucket,
				value: item[ config.key ] ?? 0,
			} ) ),
		[ items, config.key ]
	);
	const previousSeries = useMemo( () => {
		if ( isOverviewComparison ) {
			return [];
		}

		if ( ! comparePreviousRange && config.secondaryKey ) {
			return items.map( ( item ) => ( {
				bucket: item.bucket,
				value: item[ config.secondaryKey ] ?? 0,
			} ) );
		}

		const previousValues = previousItems.map(
			( item ) => item[ config.key ] ?? 0
		);
		return items.map( ( item, index ) => ( {
			bucket: item.bucket,
			value: previousValues[ index ] ?? 0,
		} ) );
	}, [
		items,
		previousItems,
		config.key,
		config.secondaryKey,
		comparePreviousRange,
		isOverviewComparison,
	] );

	const overviewSeries = useMemo( () => {
		if ( ! isOverviewComparison ) {
			return null;
		}

		const pageViewsCurrent = items.map( ( item ) => ( {
			bucket: item.bucket,
			value: item[ config.key ] ?? 0,
		} ) );
		const visitorsCurrent = items.map( ( item ) => ( {
			bucket: item.bucket,
			value: item[ config.secondaryKey ] ?? 0,
		} ) );

		const pageViewsPreviousValues = previousItems.map(
			( item ) => item[ config.previousKey ] ?? 0
		);
		const visitorsPreviousValues = previousItems.map(
			( item ) => item[ config.previousSecondaryKey ] ?? 0
		);

		const pageViewsPrevious = items.map( ( item, index ) => ( {
			bucket: item.bucket,
			value: pageViewsPreviousValues[ index ] ?? 0,
		} ) );
		const visitorsPrevious = items.map( ( item, index ) => ( {
			bucket: item.bucket,
			value: visitorsPreviousValues[ index ] ?? 0,
		} ) );

		return {
			pageViewsCurrent,
			pageViewsPrevious,
			visitorsCurrent,
			visitorsPrevious,
		};
	}, [
		isOverviewComparison,
		items,
		previousItems,
		config.key,
		config.secondaryKey,
		config.previousKey,
		config.previousSecondaryKey,
	] );
	const [ chartWidth, setChartWidth ] = useState( LINE_CHART_WIDTH );
	const chartMaxValue = useMemo( () => {
		if ( isOverviewComparison && overviewSeries ) {
			return Math.max(
				0,
				...overviewSeries.pageViewsCurrent.map(
					( item ) => item.value
				),
				...overviewSeries.pageViewsPrevious.map(
					( item ) => item.value
				),
				...overviewSeries.visitorsCurrent.map( ( item ) => item.value ),
				...overviewSeries.visitorsPrevious.map( ( item ) => item.value )
			);
		}

		if ( ! comparePreviousRange && config.secondaryKey ) {
			return Math.max(
				0,
				...items.map( ( item ) => item.pageViews ?? 0 ),
				...items.map( ( item ) => item.visits ?? 0 ),
				...previousItems.map( ( item ) => item.pageViews ?? 0 ),
				...previousItems.map( ( item ) => item.visits ?? 0 )
			);
		}

		return null;
	}, [
		items,
		previousItems,
		comparePreviousRange,
		config.secondaryKey,
		isOverviewComparison,
		overviewSeries,
	] );
	const chartData = useMemo(
		() =>
			buildLineChartData( currentSeries, previousSeries, chartWidth, {
				maxValue: chartMaxValue,
			} ),
		[ currentSeries, previousSeries, chartWidth, chartMaxValue ]
	);
	const pageViewsOverviewChartData = useMemo( () => {
		if ( ! overviewSeries ) {
			return null;
		}

		return buildLineChartData(
			overviewSeries.pageViewsCurrent,
			overviewSeries.pageViewsPrevious,
			chartWidth,
			{ maxValue: chartMaxValue }
		);
	}, [ overviewSeries, chartWidth, chartMaxValue ] );
	const visitorsOverviewChartData = useMemo( () => {
		if ( ! overviewSeries ) {
			return null;
		}

		return buildLineChartData(
			overviewSeries.visitorsCurrent,
			overviewSeries.visitorsPrevious,
			chartWidth,
			{ maxValue: chartMaxValue }
		);
	}, [ overviewSeries, chartWidth, chartMaxValue ] );
	const primaryChartData =
		isOverviewComparison && pageViewsOverviewChartData
			? pageViewsOverviewChartData
			: chartData;
	const [ activePoint, setActivePoint ] = useState( null );
	// ResizeObserver updates width without changing the fixed 240px height.
	const handleChartResize = useCallback( ( { width } ) => {
		const nextWidth = Math.max(
			Math.round( width ),
			LINE_CHART_PADDING * 2 + 1
		);
		setChartWidth( ( prev ) => ( prev === nextWidth ? prev : nextWidth ) );
	}, [] );

	const siteLocale = useMemo( () => {
		const configuredLocale = ADMIN_CONFIG?.settings?.locale || '';
		const htmlLang = document?.documentElement?.lang || '';
		const normalizedLocale = String( configuredLocale || htmlLang )
			.trim()
			.replace( /_/g, '-' );

		return normalizedLocale || undefined;
	}, [] );
	const axisDateFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat( siteLocale, {
				day: '2-digit',
				month: 'short',
			} ),
		[ siteLocale ]
	);
	const axisHourFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat( siteLocale, {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
			} ),
		[ siteLocale ]
	);
	const tooltipDateFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat( siteLocale, {
				day: '2-digit',
				month: '2-digit',
				year: '2-digit',
			} ),
		[ siteLocale ]
	);
	const numberFormatter = useMemo( () => new Intl.NumberFormat(), [] );
	const parseBucketDate = useCallback(
		( value ) => parseTimeBucketDate( value ),
		[]
	);

	const formatAxisLabel = useCallback(
		( value ) => {
			const date = parseBucketDate( value );
			if ( ! date ) {
				return value;
			}

			return isSingleDaySelection
				? axisHourFormatter.format( date )
				: axisDateFormatter.format( date );
		},
		[
			axisDateFormatter,
			axisHourFormatter,
			isSingleDaySelection,
			parseBucketDate,
		]
	);

	const formatYAxisValue = useCallback(
		( value ) => numberFormatter.format( value ),
		[ numberFormatter ]
	);

	const formatTooltipDate = useCallback(
		( value ) => {
			const date = parseBucketDate( value );
			if ( ! date ) {
				return value;
			}

			if ( isSingleDaySelection ) {
				return `${ tooltipDateFormatter.format(
					date
				) } ${ axisHourFormatter.format( date ) }`;
			}

			return tooltipDateFormatter.format( date );
		},
		[
			axisHourFormatter,
			isSingleDaySelection,
			parseBucketDate,
			tooltipDateFormatter,
		]
	);

	const formatMetricLabel = useCallback(
		( value ) => {
			const formattedValue = numberFormatter.format( value );
			const metricUnit =
				config.key === 'visits'
					? _n( 'visitor', 'visitors', value, 'bimbeau-privacy-analytics' )
					: _n( 'page view', 'page views', value, 'bimbeau-privacy-analytics' );

			return `${ formattedValue } ${ metricUnit }`;
		},
		[ config.key, numberFormatter ]
	);
	const resolveOverviewActivePoint = useCallback(
		( point ) => {
			if ( ! isOverviewComparison || ! visitorsOverviewChartData ) {
				return point;
			}

			const visitorsPoint =
				visitorsOverviewChartData.currentPoints.find(
					( candidate ) => candidate.label === point.label
				) ?? point;

			return {
				...point,
				visitorsCurrentValue: visitorsPoint.currentValue,
				visitorsPreviousValue: visitorsPoint.previousValue,
			};
		},
		[ isOverviewComparison, visitorsOverviewChartData ]
	);

	const pointSummaries = useMemo(
		() =>
			new Map(
				primaryChartData.currentPoints.map( ( point ) => {
					const visitorsPoint =
						visitorsOverviewChartData?.currentPoints.find(
							( candidate ) => candidate.label === point.label
						);

					if ( isOverviewComparison ) {
						return [
							point.label,
							sprintf(
								/* translators: 1: formatted date, 2: current page views count, 3: current visitors count, 4: previous page views count, 5: previous visitors count */
								__(
									'%1$s: Page views %2$s, Visitors %3$s, Previous page views %4$s, Previous visitors %5$s',
									'bimbeau-privacy-analytics'
								),
								formatTooltipDate( point.label ),
								numberFormatter.format( point.currentValue ),
								numberFormatter.format(
									visitorsPoint?.currentValue ?? 0
								),
								numberFormatter.format( point.previousValue ),
								numberFormatter.format(
									visitorsPoint?.previousValue ?? 0
								)
							),
						];
					}

					if ( comparePreviousRange ) {
						return [
							point.label,
							sprintf(
								/* translators: 1: formatted date, 2: current metric count, 3: previous metric count */
								__(
									'%1$s: Current %2$s, Previous %3$s',
									'bimbeau-privacy-analytics'
								),
								formatTooltipDate( point.label ),
								formatMetricLabel( point.currentValue ),
								formatMetricLabel( point.previousValue )
							),
						];
					}

					return [
						point.label,
						sprintf(
							/* translators: 1: formatted date, 2: page view count, 3: visitor count */
							__( '%1$s: %2$s, %3$s', 'bimbeau-privacy-analytics' ),
							formatTooltipDate( point.label ),
							sprintf(
								/* translators: 1: page view count */
								__( 'Page views: %1$s', 'bimbeau-privacy-analytics' ),
								numberFormatter.format( point.currentValue )
							),
							sprintf(
								/* translators: 1: visitor count */
								__( 'Visitors: %1$s', 'bimbeau-privacy-analytics' ),
								numberFormatter.format( point.previousValue )
							)
						),
					];
				} )
			),
		[
			primaryChartData.currentPoints,
			isOverviewComparison,
			comparePreviousRange,
			formatMetricLabel,
			formatTooltipDate,
			numberFormatter,
			visitorsOverviewChartData,
		]
	);

	const handleChartMouseMove = useCallback(
		( event ) => {
			if ( ! primaryChartData.currentPoints.length ) {
				return;
			}

			const bounds = event.currentTarget.getBoundingClientRect();
			if ( ! bounds.width ) {
				return;
			}

			const relativeX =
				( ( event.clientX - bounds.left ) / bounds.width ) *
				primaryChartData.width;

			const clampedX = Math.min(
				primaryChartData.width - primaryChartData.padding,
				Math.max( primaryChartData.padding, relativeX )
			);
			const pointSpan =
				primaryChartData.currentPoints[
					primaryChartData.currentPoints.length - 1
				].x - primaryChartData.currentPoints[ 0 ].x;
			const step =
				primaryChartData.currentPoints.length > 1
					? pointSpan / ( primaryChartData.currentPoints.length - 1 )
					: 0;
			const index =
				step > 0
					? Math.round(
							( clampedX -
								primaryChartData.currentPoints[ 0 ].x ) /
								step
					  )
					: 0;
			const closestPoint =
				primaryChartData.currentPoints[
					Math.min(
						primaryChartData.currentPoints.length - 1,
						Math.max( 0, index )
					)
				] ?? primaryChartData.currentPoints[ 0 ];
			const resolvedPoint = resolveOverviewActivePoint( closestPoint );

			setActivePoint( ( previous ) =>
				previous?.label === resolvedPoint.label
					? previous
					: resolvedPoint
			);
		},
		[
			primaryChartData.currentPoints,
			primaryChartData.padding,
			primaryChartData.width,
			resolveOverviewActivePoint,
		]
	);

	const chartTooltip = activePoint ? (
		<>
			<div className="bbpa-timeseries__tooltip-date">
				{ formatTooltipDate( activePoint.label ) }
			</div>
			{ isOverviewComparison && (
				<>
					<div className="bbpa-timeseries__tooltip-metric">
						<span className="bbpa-timeseries__tooltip-bullet bbpa-timeseries__tooltip-bullet--pageviews-current" />
						{ sprintf(
							/* translators: 1: page view count */
							__( 'Page views: %1$s', 'bimbeau-privacy-analytics' ),
							numberFormatter.format( activePoint.currentValue )
						) }
					</div>
					<div className="bbpa-timeseries__tooltip-metric">
						<span className="bbpa-timeseries__tooltip-bullet bbpa-timeseries__tooltip-bullet--visits-current" />
						{ sprintf(
							/* translators: 1: visitor count */
							__( 'Visitors: %1$s', 'bimbeau-privacy-analytics' ),
							numberFormatter.format(
								activePoint.visitorsCurrentValue ?? 0
							)
						) }
					</div>
					<div className="bbpa-timeseries__tooltip-metric">
						<span className="bbpa-timeseries__tooltip-bullet bbpa-timeseries__tooltip-bullet--pageviews-previous" />
						{ sprintf(
							/* translators: 1: previous page view count */
							__( 'Previous page views: %1$s', 'bimbeau-privacy-analytics' ),
							numberFormatter.format( activePoint.previousValue )
						) }
					</div>
					<div className="bbpa-timeseries__tooltip-metric">
						<span className="bbpa-timeseries__tooltip-bullet bbpa-timeseries__tooltip-bullet--visits-previous" />
						{ sprintf(
							/* translators: 1: previous visitor count */
							__( 'Previous visitors: %1$s', 'bimbeau-privacy-analytics' ),
							numberFormatter.format(
								activePoint.visitorsPreviousValue ?? 0
							)
						) }
					</div>
				</>
			) }
			{ ! isOverviewComparison && (
				<>
					<div className="bbpa-timeseries__tooltip-metric">
						{ comparePreviousRange
							? sprintf(
									/* translators: 1: current metric count */
									__( 'Current: %1$s', 'bimbeau-privacy-analytics' ),
									formatMetricLabel(
										activePoint.currentValue
									)
							  )
							: sprintf(
									/* translators: 1: page view count */
									__( 'Page views: %1$s', 'bimbeau-privacy-analytics' ),
									numberFormatter.format(
										activePoint.currentValue
									)
							  ) }
					</div>
					<div className="bbpa-timeseries__tooltip-metric">
						{ comparePreviousRange
							? sprintf(
									/* translators: 1: previous metric count */
									__( 'Previous: %1$s', 'bimbeau-privacy-analytics' ),
									formatMetricLabel(
										activePoint.previousValue
									)
							  )
							: sprintf(
									/* translators: 1: visitor count */
									__( 'Visitors: %1$s', 'bimbeau-privacy-analytics' ),
									numberFormatter.format(
										activePoint.previousValue
									)
							  ) }
					</div>
				</>
			) }
		</>
	) : null;
	const isLoading =
		isCurrentLoading || ( comparePreviousRange && isPreviousLoading );
	const error =
		currentError || ( comparePreviousRange ? previousError : null );
	const currentGradientId = `bbpa-timeseries-gradient-${ config.key }`;

	return (
		<BpaCard title={ config.title }>
			<DataState
				isLoading={ isLoading }
				error={ error }
				isEmpty={ ! isLoading && ! error && items.length === 0 }
				emptyLabel={ __(
					'No data available for this period.',
					'bimbeau-privacy-analytics'
				) }
				loadingLabel={ __( 'Loading chart…', 'bimbeau-privacy-analytics' ) }
			/>
			{ ! isLoading && ! error && items.length > 0 && (
				<div
					className={ `bbpa-timeseries bbpa-timeseries--${ config.key }${
						! comparePreviousRange && config.secondaryKey
							? ' bbpa-timeseries--dual-metric'
							: ''
					}` }
				>
					<Flex className="bbpa-timeseries__legend" align="center" wrap>
						{ isOverviewComparison && (
							<>
								<FlexItem>
									<span className="bbpa-timeseries__legend-item">
										<span
											className="bbpa-timeseries__legend-swatch"
											aria-hidden="true"
										/>
										{ config.label }
									</span>
								</FlexItem>
								<FlexItem>
									<span className="bbpa-timeseries__legend-item">
										<span
											className="bbpa-timeseries__legend-swatch bbpa-timeseries__legend-swatch--visits"
											aria-hidden="true"
										/>
										{ config.secondaryLabel }
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
												{ config.previousLabel }
											</span>
											<span className="bbpa-timeseries__legend-text-mobile">
												{ config.previousLabelMobile ??
													config.previousLabel }
											</span>
										</span>
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
												{
													config.previousSecondaryLabel
												}
											</span>
											<span className="bbpa-timeseries__legend-text-mobile">
												{ config.previousSecondaryLabelMobile ||
													config.previousSecondaryLabel }
											</span>
										</span>
									</span>
								</FlexItem>
							</>
						) }
						{ ! isOverviewComparison && (
							<>
								<FlexItem>
									<span className="bbpa-timeseries__legend-item">
										<span
											className="bbpa-timeseries__legend-swatch"
											aria-hidden="true"
										/>
										{ comparePreviousRange
											? sprintf(
													/* translators: 1: metric label */
													__(
														'Current %s',
														'bimbeau-privacy-analytics'
													),
													config.label
											  )
											: config.label }
									</span>
								</FlexItem>
								<FlexItem>
									<span className="bbpa-timeseries__legend-item">
										<span
											className="bbpa-timeseries__legend-swatch bbpa-timeseries__legend-swatch--previous"
											aria-hidden="true"
										/>
										{ comparePreviousRange
											? sprintf(
													/* translators: 1: metric label */
													__(
														'Previous %s',
														'bimbeau-privacy-analytics'
													),
													config.secondaryLabel ??
														config.label
											  )
											: config.secondaryLabel ??
											  config.label }
									</span>
								</FlexItem>
							</>
						) }
					</Flex>
					<ChartFrame
						height={ LINE_CHART_HEIGHT }
						ariaLabel={ config.ariaLabel }
						onResize={ handleChartResize }
					>
						<div
							className="bbpa-timeseries__chart"
							onMouseLeave={ () => setActivePoint( null ) }
						>
							<svg
								viewBox={ `0 0 ${ primaryChartData.width } ${ primaryChartData.height }` }
								width="100%"
								height="100%"
								preserveAspectRatio="xMidYMid meet"
								className="bbpa-timeseries__svg"
								role="img"
								aria-label={ config.ariaLabel }
								onMouseMove={ handleChartMouseMove }
							>
								<defs>
									<linearGradient
										id={ currentGradientId }
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
									width={ primaryChartData.width }
									height={ primaryChartData.height }
									className="bbpa-timeseries__bg"
								/>
								{ primaryChartData.yTicks.map( ( tick ) => (
									<g
										key={ `tick-${ tick.value }-${ tick.y }` }
									>
										<line
											x1={ primaryChartData.padding }
											y1={ tick.y }
											x2={
												primaryChartData.width -
												primaryChartData.padding
											}
											y2={ tick.y }
											className="bbpa-timeseries__grid-line"
										/>
										<text
											x={ primaryChartData.padding - 8 }
											y={ tick.y + 4 }
											textAnchor="end"
											className="bbpa-timeseries__axis-label bbpa-timeseries__axis-label--y"
										>
											{ formatYAxisValue( tick.value ) }
										</text>
									</g>
								) ) }
								<line
									x1={ primaryChartData.padding }
									y1={ primaryChartData.padding }
									x2={ primaryChartData.padding }
									y2={
										primaryChartData.height -
										primaryChartData.padding
									}
									className="bbpa-timeseries__axis"
								/>
								<line
									x1={ primaryChartData.padding }
									y1={
										primaryChartData.height -
										primaryChartData.padding
									}
									x2={
										primaryChartData.width -
										primaryChartData.padding
									}
									y2={
										primaryChartData.height -
										primaryChartData.padding
									}
									className="bbpa-timeseries__axis"
								/>
								{ activePoint && (
									<line
										x1={ activePoint.x }
										y1={ primaryChartData.padding }
										x2={ activePoint.x }
										y2={
											primaryChartData.height -
											primaryChartData.padding
										}
										className="bbpa-timeseries__hover-line"
									/>
								) }
								<path
									d={ primaryChartData.currentAreaPath }
									className="bbpa-timeseries__area bbpa-timeseries__area--current"
									fill={ `url(#${ currentGradientId })` }
								/>
								<path
									d={ primaryChartData.currentLinePath }
									className="bbpa-timeseries__line bbpa-timeseries__line--current"
								/>
								{ isOverviewComparison &&
									visitorsOverviewChartData && (
										<path
											d={
												visitorsOverviewChartData.currentLinePath
											}
											className="bbpa-timeseries__line bbpa-timeseries__line--visits-current"
										/>
									) }
								<path
									d={ primaryChartData.previousLinePath }
									className="bbpa-timeseries__line bbpa-timeseries__line--previous"
								/>
								{ isOverviewComparison &&
									visitorsOverviewChartData && (
										<path
											d={
												visitorsOverviewChartData.previousLinePath
											}
											className="bbpa-timeseries__line bbpa-timeseries__line--previous bbpa-timeseries__line--visits-previous"
										/>
									) }
								{ primaryChartData.xLabels.map( ( label ) => (
									<text
										key={ `label-${ label.label }` }
										x={ label.x }
										y={
											primaryChartData.height -
											primaryChartData.padding +
											18
										}
										textAnchor="middle"
										className="bbpa-timeseries__axis-label"
									>
										{ formatAxisLabel( label.label ) }
									</text>
								) ) }
								{ primaryChartData.currentPoints.map(
									( point ) => (
										<circle
											key={ `${ point.label }-${ point.currentValue }` }
											cx={ point.x }
											cy={ point.y }
											r="4"
											className={ `bbpa-timeseries__point${
												activePoint?.label ===
												point.label
													? ' is-active'
													: ''
											}` }
											onMouseEnter={ () =>
												setActivePoint(
													resolveOverviewActivePoint(
														point
													)
												)
											}
											onFocus={ () =>
												setActivePoint(
													resolveOverviewActivePoint(
														point
													)
												)
											}
											onBlur={ () =>
												setActivePoint( null )
											}
											tabIndex="0"
											aria-label={ pointSummaries.get(
												point.label
											) }
										>
											<title>
												{ pointSummaries.get(
													point.label
												) }
											</title>
										</circle>
									)
								) }
							</svg>
							{ activePoint && (
								<div
									key={ `${ activePoint.label }-${ activePoint.currentValue }` }
									className="bbpa-timeseries__tooltip"
									role="status"
									style={ {
										left: `${
											( activePoint.x /
												primaryChartData.width ) *
											100
										}%`,
										top: `calc(${
											( activePoint.y /
												primaryChartData.height ) *
											100
										}% - 3px)`,
									} }
								>
									{ chartTooltip }
								</div>
							) }
						</div>
					</ChartFrame>
				</div>
			) }
		</BpaCard>
	);
};

export default TimeseriesChart;
