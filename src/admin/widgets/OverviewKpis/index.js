import { __ } from '@wordpress/i18n';
import { Card, CardBody, Spinner, Tooltip } from '@wordpress/components';

import FeatureIcon from '../../components/icons/FeatureIcon';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import DataState from '../../components/DataState';
import { ADMIN_CONFIG, isPanelEnabled } from '../../constants';
import useRealtimeSnapshot from '../../hooks/useRealtimeSnapshot';
import { getAdminPanelUrl } from '../../lib/adminUrls';
import {
	calculateChangePercent,
	formatChangePercent,
	formatCompactMetricValue,
	formatCompactDurationMetricValue,
	formatRatioMetricValue,
} from '../../lib/formatters';

const KpiBadge = ( { children, status = 'info' } ) => {
	return (
		<span
			className={ `bbpa-kpi-card__badge bbpa-kpi-card__badge--${ status }` }
			role="status"
		>
			{ children }
		</span>
	);
};

const navigateToCardLink = ( href ) => {
	if ( ! href || typeof window === 'undefined' ) {
		return;
	}

	window.location.assign( href );
};

const OverviewKpis = ( { range } ) => {
	const { data: realtimeData } = useRealtimeSnapshot();
	const { data, isLoading, error } = useAdminEndpoint( '/overview', range, {
		namespace: ADMIN_CONFIG?.settings?.restNamespace,
	} );
	const overview = data?.overview || null;
	const comparisonOverview = data?.comparison?.overview || null;
	const isEmpty = ! isLoading && ! error && ! overview;

	if ( isLoading ) {
		const loadingCards = [
			{ icon: 'visits' },
			{ icon: 'pageViews' },
			{ icon: 'uniqueReferrers' },
			{ icon: 'layers' },
			{ icon: 'avgTimePerVisit' },
		];

		return (
			<>
				{ loadingCards.map( ( card, index ) => (
					<Card
						key={ `loading-${ card.icon }-${ index }` }
						className="bbpa-overview__summary-card"
					>
						<CardBody className="bbpa-kpi-card__body bbpa-kpi-card__body--loading">
							<div className="bbpa-kpi-card__content">
								<p className="bbpa-kpi-card__label bbpa-kpi-card__label--loading">
									<Spinner />
									<span>
										{ __( 'Loading…', 'bimbeau-privacy-analytics' ) }
									</span>
								</p>
								<span
									className="bbpa-kpi-card__value-skeleton"
									aria-hidden="true"
								/>
							</div>
							<FeatureIcon
								name={ card.icon }
								className="bbpa-kpi-card__icon"
								size={ 24 }
							/>
						</CardBody>
					</Card>
				) ) }
			</>
		);
	}

	if ( error || isEmpty ) {
		return (
			<Card className="bbpa-overview__summary-card bbpa-overview__summary-card--status">
				<CardBody>
					<DataState
						isLoading={ isLoading }
						error={ error }
						isEmpty={ isEmpty }
						emptyLabel={ __(
							'No overview metrics available.',
							'bimbeau-privacy-analytics'
						) }
						loadingLabel={ __( 'Loading KPIs…', 'bimbeau-privacy-analytics' ) }
						skeletonRows={ 3 }
					/>
				</CardBody>
			</Card>
		);
	}

	const cards = [
		{
			key: 'visits',
			label: __( 'Visitors', 'bimbeau-privacy-analytics' ),
			tooltip: __(
				'Visitors correspond to bounded visitor activity rows in the selected period.',
				'bimbeau-privacy-analytics'
			),
			value: overview.visitors,
			icon: 'visits',
			comparison: comparisonOverview?.visitors,
			href: getAdminPanelUrl( 'visitors' ),
		},
		isPanelEnabled( 'top-pages' ) && {
			key: 'pageViews',
			label: __( 'Page views', 'bimbeau-privacy-analytics' ),
			value: overview.pageViews,
			icon: 'pageViews',
			comparison: comparisonOverview?.pageViews,
			href: getAdminPanelUrl( 'top-pages' ),
		},
		isPanelEnabled( 'referrers' ) && {
			key: 'uniqueReferrers',
			label: __( 'Referring sites', 'bimbeau-privacy-analytics' ),
			value: overview.uniqueReferrers,
			icon: 'uniqueReferrers',
			comparison: comparisonOverview?.uniqueReferrers,
			href: getAdminPanelUrl( 'referrers' ),
		},
		isPanelEnabled( 'top-pages' ) && {
			key: 'avgPagesPerVisit',
			label: __( 'Pages / visit', 'bimbeau-privacy-analytics' ),
			tooltip: __(
				'Average number of page views per visit.',
				'bimbeau-privacy-analytics'
			),
			value:
				( Number( overview.pageViews ) || 0 ) /
				Math.max(
					1,
					Number( overview.visitors ) || 0
				),
			icon: 'layers',
			comparison: comparisonOverview
				? ( Number( comparisonOverview?.pageViews ) || 0 ) /
				  Math.max(
						1,
						Number(
							comparisonOverview?.visitors
						) || 0
				  )
				: null,
			href: getAdminPanelUrl( 'top-pages' ),
			formatValue: formatRatioMetricValue,
		},
		isPanelEnabled( 'visitors' ) && {
			key: 'avgTimePerVisit',
			label: __( 'Avg. duration', 'bimbeau-privacy-analytics' ),
			tooltip: __(
				'Average active time spent during a visit.',
				'bimbeau-privacy-analytics'
			),
			value: overview.avgTimePerVisitMs,
			icon: 'avgTimePerVisit',
			comparison: comparisonOverview?.avgTimePerVisitMs,
			href: getAdminPanelUrl( 'visitors' ),
			formatValue: formatCompactDurationMetricValue,
		},
		isPanelEnabled( 'realtime' ) && {
			key: 'realtime',
			label: __( 'Real-time', 'bimbeau-privacy-analytics' ),
			value: Number( realtimeData?.activeVisitors ?? 0 ),
			icon: 'activity',
			comparison: null,
			href: getAdminPanelUrl( 'realtime' ),
			className: 'bbpa-overview__summary-card--mobile-only',
		},
	].filter( Boolean );

	return (
		<>
			{ cards.map( ( card ) => {
				const currentValue = Number( card.value ) || 0;
				const previousValue =
					card.comparison === null || card.comparison === undefined
						? null
						: Number( card.comparison );
				const changePercent = calculateChangePercent(
					currentValue,
					previousValue
				);
				const changeLabel = formatChangePercent( changePercent );
				const isPositive = changePercent > 0;
				const isNegative = changePercent < 0;
				const reverseTrendStatus = Boolean( card.reverseTrendStatus );
				const isZero =
					changePercent === 0 || Object.is( changePercent, -0 );
				return (
					<Card
						key={ card.key }
						className={ `bbpa-overview__summary-card bbpa-overview__summary-card--interactive${
							card.className ? ` ${ card.className }` : ''
						}` }
						role="link"
						tabIndex={ 0 }
						onClick={ () => navigateToCardLink( card.href ) }
						onKeyDown={ ( event ) => {
							if (
								event.key !== 'Enter' &&
								event.key !== ' ' &&
								event.key !== 'Spacebar'
							) {
								return;
							}

							event.preventDefault();
							navigateToCardLink( card.href );
						} }
						aria-label={ card.label }
					>
						<CardBody className="bbpa-kpi-card__body">
							<div className="bbpa-kpi-card__content">
								<p className="bbpa-kpi-card__label">
									{ card.label }
									{ card.tooltip ? (
										<Tooltip text={ card.tooltip }>
											<span
												className="dashicons dashicons-editor-help bbpa-kpi-card__tooltip-button"
												aria-label={ card.tooltip }
											/>
										</Tooltip>
									) : null }
								</p>
								<p className="bbpa-kpi-card__value-row">
									<span className="bbpa-kpi-card__value">
										{ (
											card.formatValue ||
											formatCompactMetricValue
										)( currentValue ) }
									</span>
									{ changeLabel !== null && (
										<KpiBadge
											status={
												[
													[
														isPositive,
														reverseTrendStatus
															? 'error'
															: 'success',
													],
													[
														isNegative,
														reverseTrendStatus
															? 'success'
															: 'error',
													],
													[ isZero, 'warning' ],
												].find(
													( [ condition ] ) =>
														condition
												)?.[ 1 ] || 'info'
											}
										>
											{ changeLabel }
										</KpiBadge>
									) }
								</p>
							</div>
							<FeatureIcon
								name={ card.icon }
								className="bbpa-kpi-card__icon"
								size={ 24 }
							/>
						</CardBody>
					</Card>
				);
			} ) }
		</>
	);
};

export default OverviewKpis;
