import Notice from '../BrandNotice';
import { useEffect, useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { ResponsiveHeatMapCanvas } from '@nivo/heatmap';

import ChartFrame from '../ChartFrame';
import {
	buildHeatmapThemeColorInterpolator,
	buildPageDetailsHeatmapData,
	DEFAULT_HEATMAP_THEME_COLOR,
	formatPageDetailsHeatmapHour,
	getPageDetailsHeatmapEmptyLabel,
	getHeatmapLabelTextColor,
	HEATMAP_THEME_COLOR_PROPERTY,
} from '../../lib/pageDetailsHeatmap';

const HEATMAP_HEIGHT = 480;
const MOBILE_VIEWPORT_MEDIA_QUERY = '(max-width: 782px)';

const resolveCanvasColor = ( color ) => {
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

const resolveHeatmapThemeColor = () => {
	if ( typeof window === 'undefined' || typeof document === 'undefined' ) {
		return DEFAULT_HEATMAP_THEME_COLOR;
	}

	const themeColor = window
		.getComputedStyle( document.documentElement )
		.getPropertyValue( HEATMAP_THEME_COLOR_PROPERTY )
		.trim();

	return resolveCanvasColor( themeColor || DEFAULT_HEATMAP_THEME_COLOR );
};

const PageDetailsHeatMap = ( {
	ariaLabel,
	emptyDataLabel,
	items,
	hourlyAvailable,
	hourlyUnavailableReason,
	metricLabel,
	source,
	unavailableLabel,
	useShortDayLabels = false,
} ) => {
	const numberFormatter = useMemo( () => new Intl.NumberFormat(), [] );
	const [ heatmapThemeColor, setHeatmapThemeColor ] = useState(
		resolveHeatmapThemeColor
	);
	const [ isMobileViewport, setIsMobileViewport ] = useState( () => {
		if ( typeof window === 'undefined' || ! window.matchMedia ) {
			return false;
		}

		return window.matchMedia( MOBILE_VIEWPORT_MEDIA_QUERY ).matches;
	} );
	const { data, days, dayLabels, dayShortLabels, maxValue } = useMemo(
		() => buildPageDetailsHeatmapData( items ),
		[ items ]
	);
	const visibleDayLabels =
		useShortDayLabels || isMobileViewport ? dayShortLabels : dayLabels;
	const heatmapColorInterpolator = useMemo(
		() => buildHeatmapThemeColorInterpolator( heatmapThemeColor ),
		[ heatmapThemeColor ]
	);

	useEffect( () => {
		if ( typeof window === 'undefined' || ! window.matchMedia ) {
			return undefined;
		}

		const mediaQueryList = window.matchMedia( MOBILE_VIEWPORT_MEDIA_QUERY );
		const handleViewportChange = ( event ) => {
			setIsMobileViewport( event.matches );
		};

		setIsMobileViewport( mediaQueryList.matches );
		mediaQueryList.addEventListener( 'change', handleViewportChange );

		return () => {
			mediaQueryList.removeEventListener(
				'change',
				handleViewportChange
			);
		};
	}, [] );

	useEffect( () => {
		if (
			typeof window === 'undefined' ||
			typeof document === 'undefined'
		) {
			return undefined;
		}

		const updateHeatmapThemeColor = () => {
			setHeatmapThemeColor( resolveHeatmapThemeColor() );
		};

		updateHeatmapThemeColor();
		window.addEventListener( 'focus', updateHeatmapThemeColor );

		if ( typeof window.MutationObserver === 'undefined' ) {
			return () => {
				window.removeEventListener( 'focus', updateHeatmapThemeColor );
			};
		}

		const observer = new window.MutationObserver( updateHeatmapThemeColor );
		observer.observe( document.documentElement, {
			attributes: true,
			attributeFilter: [ 'class', 'style' ],
		} );

		return () => {
			observer.disconnect();
			window.removeEventListener( 'focus', updateHeatmapThemeColor );
		};
	}, [] );

	if ( ! hourlyAvailable ) {
		return (
			<Notice status="info" isDismissible={ false }>
				{ unavailableLabel ||
					getPageDetailsHeatmapEmptyLabel(
						source,
						hourlyUnavailableReason
					) }
			</Notice>
		);
	}

	if ( ! data.length || ! days.length ) {
		return (
			<Notice status="info" isDismissible={ false }>
				{ emptyDataLabel ||
					__(
						'No hourly details available for this page.',
						'bimbeau-privacy-analytics'
					) }
			</Notice>
		);
	}

	const resolvedAriaLabel =
		ariaLabel || __( 'Page details heatmap by day and hour', 'bimbeau-privacy-analytics' );

	return (
		<div className="bbpa-page-details__heatmap">
			<ChartFrame
				height={ HEATMAP_HEIGHT }
				ariaLabel={ resolvedAriaLabel }
			>
				<ResponsiveHeatMapCanvas
					data={ data }
					margin={ {
						top: 12,
						right: 16,
						bottom: 72,
						left: 56,
					} }
					colors={ {
						type: 'sequential',
						interpolator: heatmapColorInterpolator,
						minValue: 0,
						maxValue,
					} }
					emptyColor="rgba(227, 232, 239, 0.65)"
					borderRadius={ 3 }
					borderWidth={ 1 }
					borderColor="rgba(255, 255, 255, 0.9)"
					enableLabels
					label={ ( cell ) => {
						const value = Number( cell?.value ) || 0;

						if ( value <= 0 ) {
							return '';
						}

						return numberFormatter.format( value );
					} }
					labelTextColor={ ( cell ) =>
						getHeatmapLabelTextColor( cell?.color )
					}
					axisTop={ null }
					axisRight={ null }
					axisBottom={ {
						tickSize: 0,
						tickPadding: 10,
						tickRotation: 0,
						format: ( value ) => visibleDayLabels[ value ] || value,
					} }
					axisLeft={ {
						tickSize: 0,
						tickPadding: 10,
						format: ( value ) => value,
					} }
					inactiveOpacity={ 1 }
					hoverTarget="cell"
					valueFormat=" >-.0f"
					legends={ [
						{
							anchor: 'bottom-left',
							translateY: 58,
							length: isMobileViewport ? 220 : 320,
							thickness: 10,
							direction: 'row',
							tickPosition: 'after',
							tickSize: 0,
							tickSpacing: 6,
							title: `${ metricLabel } →`,
							titleAlign: 'start',
							titleOffset: 4,
						},
					] }
					tooltip={ ( { cell } ) => {
						const hour = Number.parseInt( cell?.serieId, 10 );
						const day = cell?.data?.x || '';
						const dayLabel = dayLabels[ day ] || day;
						const value = Number( cell?.value ) || 0;

						return (
							<div className="bbpa-world-map__tooltip bbpa-page-details__heatmap-tooltip">
								<div className="bbpa-world-map__tooltip-title">
									<strong>{ `${ dayLabel } • ${ formatPageDetailsHeatmapHour(
										hour
									) }` }</strong>
								</div>
								<div className="bbpa-world-map__tooltip-value">
									<span
										className="bbpa-world-map__tooltip-dot"
										style={ {
											background:
												cell?.color ||
												heatmapThemeColor,
										} }
									/>
									<span>{ `${ metricLabel }: ${ numberFormatter.format(
										value
									) }` }</span>
								</div>
							</div>
						);
					} }
					role="img"
					ariaLabel={ resolvedAriaLabel }
				/>
			</ChartFrame>
		</div>
	);
};

export default PageDetailsHeatMap;
