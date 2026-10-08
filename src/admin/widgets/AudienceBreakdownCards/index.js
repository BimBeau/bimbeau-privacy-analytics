import { useMemo, useState } from '@wordpress/element';
import { ToggleControl } from '@wordpress/components';
import { __, _n, sprintf } from '@wordpress/i18n';

import useAdminEndpoint from '../../api/useAdminEndpoint';
import DataState from '../../components/DataState';
import BrandIcon from '../../components/icons/BrandIcon';
import BpaCard from '../../components/BpaCard';
import { ADMIN_CONFIG } from '../../constants';
import { buildAudienceBreakdownSections } from '../../lib/audienceBreakdowns';
import { formatDeviceClassLabel } from '../../lib/deviceClassLabel';
import {
	buildDeviceDetailsBreakdowns,
	getRobotTotals,
	withRobotDeviceItem,
} from '../../lib/deviceDetails';
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

const BreakdownCard = ( {
	kind,
	title,
	items,
	emptyLabel,
	totalHits,
	headerActions = null,
	extraSummary = null,
} ) => {
	const breakdownItems = items.map( ( item ) => ( {
		rawLabel: item.label,
		label: formatBreakdownLabel(
			item.label,
			__( 'Unknown', 'bimbeau-privacy-analytics' ),
			kind
		),
		hits: item.hits,
		share: item.share,
		isRobot: Boolean( item.isRobot ),
	} ) );

	if ( breakdownItems.length === 0 ) {
		return (
			<BpaCard
				className="bbpa-audience-breakdown-card"
				title={ title }
				headerActions={ headerActions }
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

	return (
		<BpaCard
			className="bbpa-audience-breakdown-card"
			title={ title }
			headerActions={ headerActions }
		>
			<ul className="bbpa-audience-breakdown-card__list">
				{ breakdownItems.map( ( item ) => (
					<li
						key={ item.isRobot ? 'robot' : item.label }
						className={ `bbpa-audience-breakdown-card__list-item${
							item.isRobot
								? ' bbpa-audience-breakdown-card__list-item--robot'
								: ''
						}` }
					>
						<span className="bbpa-audience-breakdown-card__label">
							<BrandIcon
								kind={ kind }
								value={ item.rawLabel }
								className="bbpa-audience-breakdown-card__icon"
								size={ 20 }
							/>
							<span>{ item.label }</span>
						</span>
						<span className="bbpa-audience-breakdown-card__metric">
							{ sprintf(
								/* translators: %s: page views count. */
								_n(
									'%s page view',
									'%s page views',
									item.hits,
									'bimbeau-privacy-analytics'
								),
								item.hits
							) }
						</span>
						<div
							className="bbpa-audience-breakdown-card__share"
							aria-label={ sprintf(
								/* translators: %1$s: percentage value, without the percent sign. */
								__( '%1$s%% share', 'bimbeau-privacy-analytics' ),
								item.share
							) }
						>
							<span
								className="bbpa-audience-breakdown-card__share-bar"
								style={ { width: `${ item.share }%` } }
								aria-hidden="true"
							/>
							<strong className="bbpa-audience-breakdown-card__share-value">
								{ `${ item.share }%` }
							</strong>
						</div>
					</li>
				) ) }
			</ul>
			<p className="bbpa-audience-breakdown-card__summary">
				{ sprintf(
					/* translators: %s: total page views in the selected range. */
					__(
						'Based on %s tracked page views in the selected range.',
						'bimbeau-privacy-analytics'
					),
					formatNumber( totalHits )
				) }
			</p>
			{ extraSummary ? (
				<p className="bbpa-audience-breakdown-card__summary">
					{ extraSummary }
				</p>
			) : null }
		</BpaCard>
	);
};

/**
 * Summary line of the robot row of the device card.
 *
 * @param {Object} robotsState { data, isLoading, error } of the bot /visitors/breakdowns request.
 * @param {Object} robotTotals { hits, robots } read from it.
 * @return {string|null} Summary, or null while loading.
 */
const getRobotsSummary = ( robotsState, robotTotals ) => {
	if ( robotsState.error ) {
		return __(
			'Robot page views could not be loaded.',
			'bimbeau-privacy-analytics'
		);
	}

	if ( robotsState.isLoading || ! robotsState.data ) {
		return null;
	}

	const excludedNote = __(
		'Robots stay excluded from every other report.',
		'bimbeau-privacy-analytics'
	);

	if ( robotTotals.robots === 0 ) {
		return `${ __(
			'No robot was detected in the selected range.',
			'bimbeau-privacy-analytics'
		) } ${ excludedNote }`;
	}

	return `${ sprintf(
		/* translators: 1: robot page views, 2: number of robots. */
		_n(
			'Includes %1$s page views of %2$s robot.',
			'Includes %1$s page views of %2$s robots.',
			robotTotals.robots,
			'bimbeau-privacy-analytics'
		),
		formatNumber( robotTotals.hits ),
		formatNumber( robotTotals.robots )
	) } ${ excludedNote }`;
};

/**
 * Browser, operating system, device and resolution breakdowns.
 *
 * The breakdowns come from GET /visitors/breakdowns: page view totals of every visitor matching the
 * range and the request parameters, grouped on the server.
 *
 * @param {Object}  props                    Component props.
 * @param {Object}  props.range              Selected range.
 * @param {Object}  props.requestParams      Extra /visitors/breakdowns parameters (page_path).
 * @param {boolean} props.includeResolutions Whether to render the resolution card.
 * @param {Object}  props.breakdownsState    Optional { data, isLoading, error } of the same
 *                                           /visitors/breakdowns request made by the parent: no request is sent then.
 * @param {boolean} props.allowRobotsToggle  Whether the device card offers the "Include robots" switch,
 *                                           which adds a robot row from the robot totals of the range.
 */
const AudienceBreakdownCards = ( {
	range,
	requestParams = {},
	includeResolutions = false,
	breakdownsState,
	allowRobotsToggle = false,
} ) => {
	const [ includeRobots, setIncludeRobots ] = useState( false );
	const showRobots = allowRobotsToggle && includeRobots;
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
	const robotsState = useAdminEndpoint(
		'/visitors/breakdowns',
		{
			...range,
			visitor_type: 'bot',
		},
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
			enabled: showRobots,
		}
	);
	const robotTotals = useMemo(
		() => getRobotTotals( robotsState.data ),
		[ robotsState.data ]
	);
	const hasRobotRow =
		showRobots &&
		! robotsState.isLoading &&
		! robotsState.error &&
		Boolean( robotsState.data );
	const deviceItems = useMemo(
		() =>
			hasRobotRow
				? withRobotDeviceItem( sections.devices, robotTotals.hits )
				: sections.devices,
		[ hasRobotRow, sections.devices, robotTotals.hits ]
	);
	const robotsToggle = allowRobotsToggle ? (
		<ToggleControl
			__nextHasNoMarginBottom
			className="bbpa-audience-breakdown-card__robots-toggle"
			label={ __( 'Include robots', 'bimbeau-privacy-analytics' ) }
			checked={ includeRobots }
			onChange={ ( value ) => setIncludeRobots( Boolean( value ) ) }
		/>
	) : null;
	const hasContent =
		sections.browsers.length > 0 ||
		sections.operatingSystems.length > 0 ||
		sections.devices.length > 0 ||
		( includeResolutions && sections.resolutions.length > 0 );

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
					<BreakdownCard
						kind="browser"
						title={ __( 'Browser usage', 'bimbeau-privacy-analytics' ) }
						items={ sections.browsers }
						totalHits={ stats.totalHits }
						emptyLabel={ __(
							'No browser usage available.',
							'bimbeau-privacy-analytics'
						) }
					/>
					<BreakdownCard
						kind="os"
						title={ __(
							'Most used operating systems',
							'bimbeau-privacy-analytics'
						) }
						items={ sections.operatingSystems }
						totalHits={ stats.totalHits }
						emptyLabel={ __(
							'No operating system usage available.',
							'bimbeau-privacy-analytics'
						) }
					/>
					<BreakdownCard
						kind="device"
						title={ __( 'Device usage breakdown', 'bimbeau-privacy-analytics' ) }
						items={ deviceItems }
						totalHits={ stats.totalHits }
						headerActions={ robotsToggle }
						extraSummary={
							showRobots
								? getRobotsSummary( robotsState, robotTotals )
								: null
						}
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
