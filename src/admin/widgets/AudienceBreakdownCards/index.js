import { useMemo } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import DataState from '../../components/DataState';
import BrandIcon from '../../components/icons/BrandIcon';
import FeatureIcon from '../../components/icons/FeatureIcon';
import BrandNotice from '../../components/BrandNotice';
import BpaCard from '../../components/BpaCard';
import { ADMIN_CONFIG } from '../../constants';
import { buildAudienceBreakdownSections } from '../../lib/audienceBreakdowns';
import { getPreviousRange } from '../../lib/date';
import { formatDeviceClassLabel } from '../../lib/deviceClassLabel';
import { buildDeviceDetailsBreakdowns } from '../../lib/deviceDetails';
import { formatNumber } from '../../lib/formatters';
import './styles.css';

const formatBreakdownLabel = ( label, fallbackLabel, kind ) => {
	if ( typeof label !== 'string' || label.trim() === '' ) {
		return fallbackLabel;
	}

	const normalizedLabel = label.trim();
	const lowercaseLabel = normalizedLabel.toLowerCase();

	if ( lowercaseLabel === 'desktop' ) {
		return __( 'Desktop', 'bimbeau-privacy-analytics' );
	}

	if ( lowercaseLabel === 'mobile' ) {
		return __( 'Smartphone', 'bimbeau-privacy-analytics' );
	}

	if ( lowercaseLabel === 'tablet' ) {
		return __( 'Tablet', 'bimbeau-privacy-analytics' );
	}

	if ( kind === 'device' && lowercaseLabel === 'bot' ) {
		return formatDeviceClassLabel( lowercaseLabel );
	}

	return normalizedLabel;
};

/**
 * Name of a screen width bucket of formatScreenResolution(), shown before the bucket itself.
 *
 * @param {string} bucket Bucket ("0-480px", "1441px+").
 * @return {string} Name, or an empty string for any other value.
 */
const getResolutionBucketName = ( bucket ) => {
	switch ( bucket ) {
		case '0-480px':
			return __( 'Mobile', 'bimbeau-privacy-analytics' );
		case '481-768px':
			return __( 'Small tablet', 'bimbeau-privacy-analytics' );
		case '769-1024px':
			return __( 'Tablet', 'bimbeau-privacy-analytics' );
		case '1025-1440px':
			return __( 'Laptop', 'bimbeau-privacy-analytics' );
		case '1441px+':
			return __( 'Large screen', 'bimbeau-privacy-analytics' );
		default:
			return '';
	}
};

/**
 * Percentage with one decimal, in the admin locale ("72.7%", "72,7 %").
 *
 * @param {number} value Percentage (0-100).
 * @return {string} Formatted percentage.
 */
const formatShare = ( value ) =>
	formatNumber( value / 100, {
		style: 'percent',
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	} );

const toShare = ( hits, base ) =>
	base > 0 ? ( ( Number( hits ) || 0 ) / base ) * 100 : 0;

/**
 * Shares of the previous period, by raw label, over the page views with this detail.
 *
 * @param {Array}  items           Previous items ({ label, hits }).
 * @param {number} identifiedTotal Previous page views with this detail.
 * @return {Map|null} Shares by label, or null when the previous period has no data.
 */
const getPreviousShares = ( items, identifiedTotal ) => {
	if ( ! ( identifiedTotal > 0 ) ) {
		return null;
	}

	return new Map(
		( Array.isArray( items ) ? items : [] ).map( ( item ) => [
			item.label,
			toShare( item.hits, identifiedTotal ),
		] )
	);
};

/**
 * Change of a share against the previous period, in percentage points.
 *
 * @param {Object} props               Component props.
 * @param {number} props.share         Current share (0-100).
 * @param {number} props.previousShare Previous share (0-100).
 */
const ShareTrend = ( { share, previousShare } ) => {
	const change = Math.round( ( share - previousShare ) * 10 ) / 10;
	let modifier = 'neutral';
	let sign = '';
	if ( change > 0 ) {
		modifier = 'positive';
		sign = '+';
	} else if ( change < 0 ) {
		modifier = 'negative';
		sign = '−';
	}

	return (
		<span
			className={ `bbpa-report-table__trend bbpa-report-table__trend--${ modifier } bbpa-audience-breakdown-card__trend` }
			title={ sprintf(
				/* translators: %s: share of the previous period, for example 21.9%. */
				__( 'Previous period: %s', 'bimbeau-privacy-analytics' ),
				formatShare( previousShare )
			) }
		>
			{ sprintf(
				/* translators: %s: signed change of a rate, in percentage points (for example +1.2). */
				__( '%s pt', 'bimbeau-privacy-analytics' ),
				`${ sign }${ formatNumber( Math.abs( change ), {
					maximumFractionDigits: 1,
				} ) }`
			) }
			{ modifier !== 'neutral' && (
				<FeatureIcon
					name={ change < 0 ? 'trendingDown' : 'trendingUp' }
					size={ 12 }
				/>
			) }
		</span>
	);
};

const BreakdownCard = ( {
	kind,
	title,
	items,
	emptyLabel,
	totalHits,
	identifiedHits,
	previousShares = null,
} ) => {
	const breakdownItems = items.map( ( item ) => ( {
		rawLabel: item.label,
		label: formatBreakdownLabel(
			item.label,
			__( 'Unknown', 'bimbeau-privacy-analytics' ),
			kind
		),
		bucketName:
			kind === 'resolution' ? getResolutionBucketName( item.label ) : '',
		hits: item.hits,
		share: toShare( item.hits, identifiedHits ),
		previousShare: previousShares
			? previousShares.get( item.label ) ?? 0
			: null,
	} ) );

	if ( breakdownItems.length === 0 ) {
		return (
			<BpaCard
				className="bbpa-audience-breakdown-card"
				title={ title }
			>
				<DataState
					isLoading={ false }
					error={ null }
					isEmpty
					emptyLabel={ emptyLabel }
				/>
			</BpaCard>
		);
	}

	// Page views without this detail (visitors without advanced statistics) are left out of the
	// shares and shown apart.
	const missingHits = Math.max( 0, totalHits - identifiedHits );

	return (
		<BpaCard
			className="bbpa-audience-breakdown-card"
			title={ title }
		>
			<ul className="bbpa-audience-breakdown-card__list">
				{ breakdownItems.map( ( item ) => (
					<li
						key={ item.rawLabel }
						className="bbpa-audience-breakdown-card__list-item"
					>
						<span className="bbpa-audience-breakdown-card__label">
							<BrandIcon
								kind={ kind }
								value={ item.rawLabel }
								className="bbpa-audience-breakdown-card__icon"
								size={ 20 }
							/>
							{ item.bucketName ? (
								<span>
									{ item.bucketName }{ ' ' }
									<span className="bbpa-audience-breakdown-card__label-detail">
										{ item.label }
									</span>
								</span>
							) : (
								<span>{ item.label }</span>
							) }
						</span>
						<strong className="bbpa-audience-breakdown-card__share-value">
							{ formatShare( item.share ) }
						</strong>
						<div
							className="bbpa-audience-breakdown-card__share"
							aria-hidden="true"
						>
							<span
								className="bbpa-audience-breakdown-card__share-bar"
								style={ { width: `${ Math.min( 100, item.share ) }%` } }
							/>
						</div>
						<span className="bbpa-audience-breakdown-card__metric">
							{ sprintf(
								/* translators: %s: page views count. */
								_n(
									'%s page view',
									'%s page views',
									item.hits,
									'bimbeau-privacy-analytics'
								),
								formatNumber( item.hits )
							) }
						</span>
						{ item.previousShare !== null ? (
							<ShareTrend
								share={ item.share }
								previousShare={ item.previousShare }
							/>
						) : null }
					</li>
				) ) }
			</ul>
			{ missingHits > 0 ? (
				<div className="bbpa-audience-breakdown-card__unidentified">
					<span>{ __( 'Not identified', 'bimbeau-privacy-analytics' ) }</span>
					<span className="bbpa-audience-breakdown-card__unidentified-share">
						{ formatShare( toShare( missingHits, totalHits ) ) }
					</span>
					<span className="bbpa-audience-breakdown-card__metric">
						{ sprintf(
							/* translators: %s: page views count. */
							_n(
								'%s page view',
								'%s page views',
								missingHits,
								'bimbeau-privacy-analytics'
							),
							formatNumber( missingHits )
						) }
					</span>
				</div>
			) : null }
			<p className="bbpa-audience-breakdown-card__summary">
				{ missingHits > 0
					? sprintf(
							/* translators: %s: page views with a known value for this card. */
							__(
								'Shares of the %s page views where this detail is known.',
								'bimbeau-privacy-analytics'
							),
							formatNumber( identifiedHits )
					  )
					: sprintf(
							/* translators: %s: total page views in the selected range. */
							__(
								'Based on %s tracked page views in the selected range.',
								'bimbeau-privacy-analytics'
							),
							formatNumber( totalHits )
					  ) }
			</p>
		</BpaCard>
	);
};

/**
 * Browser, operating system, device and resolution breakdowns.
 *
 * The breakdowns come from GET /visitors/breakdowns: page view totals of every visitor matching the
 * range and the request parameters, grouped on the server. Browser, operating system and resolution
 * are only stored for the visitors with advanced statistics, so their shares are computed over the
 * page views where the detail is known and the other page views are shown apart.
 *
 * @param {Object}  props                    Component props.
 * @param {Object}  props.range              Selected range.
 * @param {Object}  props.requestParams      Extra /visitors/breakdowns parameters (page_path).
 * @param {boolean} props.includeResolutions Whether to render the resolution card.
 * @param {Object}  props.breakdownsState    Optional { data, isLoading, error } of the same
 *                                           /visitors/breakdowns request made by the parent: no request is sent then.
 * @param {boolean} props.showTrends         Whether each share shows its change against the previous
 *                                           period of the same length (one more /visitors/breakdowns request).
 */
const AudienceBreakdownCards = ( {
	range,
	requestParams = {},
	includeResolutions = false,
	breakdownsState,
	showTrends = false,
} ) => {
	const hasBreakdownsState = Boolean( breakdownsState );
	const endpointState = useAdminEndpoint(
		'/visitors/breakdowns',
		{
			...range,
			...requestParams,
		},
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
			enabled: ! hasBreakdownsState,
		}
	);
	const { data, isLoading, error } = hasBreakdownsState
		? breakdownsState
		: endpointState;
	const stats = useMemo( () => buildDeviceDetailsBreakdowns( data ), [ data ] );
	const sections = useMemo(
		() => buildAudienceBreakdownSections( stats ),
		[ stats ]
	);
	const previousRange = useMemo(
		() => ( showTrends ? getPreviousRange( range ) : null ),
		[ showTrends, range ]
	);
	const previousState = useAdminEndpoint(
		'/visitors/breakdowns',
		{
			...( previousRange || {} ),
			...requestParams,
		},
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
			enabled: Boolean( previousRange ),
		}
	);
	const previousShares = useMemo( () => {
		if (
			! previousRange ||
			previousState.isLoading ||
			previousState.error ||
			! previousState.data
		) {
			return null;
		}

		const previousStats = buildDeviceDetailsBreakdowns( previousState.data );

		return {
			browsers: getPreviousShares(
				previousStats.browsers,
				previousStats.browsersIdentifiedTotal
			),
			operatingSystems: getPreviousShares(
				previousStats.operatingSystems,
				previousStats.operatingSystemsIdentifiedTotal
			),
			devices: getPreviousShares(
				previousStats.devices,
				previousStats.devicesIdentifiedTotal
			),
			resolutions: getPreviousShares(
				previousStats.resolutions,
				previousStats.resolutionsIdentifiedTotal
			),
		};
	}, [
		previousRange,
		previousState.isLoading,
		previousState.error,
		previousState.data,
	] );
	const hasContent =
		sections.browsers.length > 0 ||
		sections.operatingSystems.length > 0 ||
		sections.devices.length > 0 ||
		( includeResolutions && sections.resolutions.length > 0 );
	const detailedHits = stats.browsersIdentifiedTotal;
	const showCoverageNotice =
		stats.totalHits > 0 && detailedHits < stats.totalHits;

	return (
		<div className="bbpa-audience-breakdown-grid">
			<DataState
				isLoading={ isLoading }
				error={ error }
				isEmpty={ ! isLoading && ! error && ! hasContent }
				emptyLabel={ __(
					'No audience breakdowns available.',
					'bimbeau-privacy-analytics'
				) }
				loadingLabel={ __(
					'Loading audience breakdowns…',
					'bimbeau-privacy-analytics'
				) }
			/>
			{ ! isLoading && ! error && hasContent ? (
				<>
					{ showCoverageNotice ? (
						<BrandNotice
							status="info"
							isDismissible={ false }
							className="bbpa-audience-breakdown-grid__notice"
						>
							{ sprintf(
								/* translators: 1: page views with advanced statistics, 2: all page views, 3: share of the first in the second (32%). */
								__(
									'Browser, operating system and screen details are only known for visitors with advanced statistics: %1$s of %2$s page views (%3$s). Their shares are computed over these page views.',
									'bimbeau-privacy-analytics'
								),
								formatNumber( detailedHits ),
								formatNumber( stats.totalHits ),
								formatShare( toShare( detailedHits, stats.totalHits ) )
							) }
						</BrandNotice>
					) : null }
					<BreakdownCard
						kind="browser"
						title={ __( 'Browser usage', 'bimbeau-privacy-analytics' ) }
						items={ sections.browsers }
						totalHits={ stats.totalHits }
						identifiedHits={ stats.browsersIdentifiedTotal }
						previousShares={ previousShares?.browsers ?? null }
						emptyLabel={ __(
							'No browser usage available.',
							'bimbeau-privacy-analytics'
						) }
					/>
					<BreakdownCard
						kind="os"
						title={ __( 'Operating systems', 'bimbeau-privacy-analytics' ) }
						items={ sections.operatingSystems }
						totalHits={ stats.totalHits }
						identifiedHits={ stats.operatingSystemsIdentifiedTotal }
						previousShares={ previousShares?.operatingSystems ?? null }
						emptyLabel={ __(
							'No operating system usage available.',
							'bimbeau-privacy-analytics'
						) }
					/>
					<BreakdownCard
						kind="device"
						title={ __( 'Device usage breakdown', 'bimbeau-privacy-analytics' ) }
						items={ sections.devices }
						totalHits={ stats.totalHits }
						identifiedHits={ stats.devicesIdentifiedTotal }
						previousShares={ previousShares?.devices ?? null }
						emptyLabel={ __(
							'No device usage available.',
							'bimbeau-privacy-analytics'
						) }
					/>
					{ includeResolutions ? (
						<BreakdownCard
							kind="resolution"
							title={ __( 'Resolution', 'bimbeau-privacy-analytics' ) }
							items={ sections.resolutions }
							totalHits={ stats.totalHits }
							identifiedHits={ stats.resolutionsIdentifiedTotal }
							previousShares={ previousShares?.resolutions ?? null }
							emptyLabel={ __(
								'No resolution data available.',
								'bimbeau-privacy-analytics'
							) }
						/>
					) : null }
				</>
			) : null }
		</div>
	);
};

export default AudienceBreakdownCards;
