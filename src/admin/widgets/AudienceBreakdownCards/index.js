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
	DEVICE_DETAILS_VISITOR_SAMPLE_SIZE,
	buildDeviceDetailsBreakdowns,
	sumRobotPageViews,
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
	sample,
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
				{ sample
					? sprintf(
							/* translators: 1: page views counted in the breakdown, 2: number of visitors read, 3: number of visitors in the selected range. */
							__(
								'Based on %1$s page views of the %2$s most active visitors, out of %3$s visitors in the selected range.',
								'bimbeau-privacy-analytics'
							),
							formatNumber( totalHits ),
							formatNumber( sample.readVisitors ),
							formatNumber( sample.totalVisitors )
					  )
					: sprintf(
							/* translators: %s: total page views in the selected range. */
							__(
								'Based on %s tracked page views in the selected range.',
								'bimbeau-privacy-analytics'
							),
							totalHits
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
 * @param {Object} robotsState { data, isLoading, error } of the bot /visitors request.
 * @param {number} robotHits   Robot page views read.
 * @return {string|null} Summary, or null while loading.
 */
const getRobotsSummary = ( robotsState, robotHits ) => {
	if ( robotsState.error ) {
		return __(
			'Robot page views could not be loaded.',
			'bimbeau-privacy-analytics'
		);
	}

	if ( robotsState.isLoading || ! robotsState.data ) {
		return null;
	}

	const readRobots = Array.isArray( robotsState.data?.items )
		? robotsState.data.items.length
		: 0;
	const totalRobots = Number( robotsState.data?.pagination?.totalItems );
	const excludedNote = __(
		'Robots stay excluded from every other report.',
		'bimbeau-privacy-analytics'
	);

	if ( readRobots === 0 ) {
		return `${ __(
			'No robot was detected in the selected range.',
			'bimbeau-privacy-analytics'
		) } ${ excludedNote }`;
	}

	if ( Number.isFinite( totalRobots ) && totalRobots > readRobots ) {
		return `${ sprintf(
			/* translators: 1: robot page views, 2: number of robots read, 3: number of robots in the selected range. */
			__(
				'Includes %1$s page views of the %2$s most active robots, out of %3$s robots in the selected range.',
				'bimbeau-privacy-analytics'
			),
			formatNumber( robotHits ),
			formatNumber( readRobots ),
			formatNumber( totalRobots )
		) } ${ excludedNote }`;
	}

	return `${ sprintf(
		/* translators: 1: robot page views, 2: number of robots. */
		_n(
			'Includes %1$s page views of %2$s robot.',
			'Includes %1$s page views of %2$s robots.',
			readRobots,
			'bimbeau-privacy-analytics'
		),
		formatNumber( robotHits ),
		formatNumber( readRobots )
	) } ${ excludedNote }`;
};

/**
 * Visitors read versus visitors of the range, when /visitors returned only the
 * most active visitors of the range.
 *
 * @param {Object|null} data /visitors response.
 * @return {{readVisitors: number, totalVisitors: number}|null} Sample sizes, or null when every visitor was read.
 */
const getVisitorSample = ( data ) => {
	const readVisitors = Array.isArray( data?.items ) ? data.items.length : 0;
	const totalVisitors = Number( data?.pagination?.totalItems );

	if ( ! Number.isFinite( totalVisitors ) || totalVisitors <= readVisitors ) {
		return null;
	}

	return { readVisitors, totalVisitors };
};

/**
 * Browser, operating system, device and resolution breakdowns.
 *
 * The breakdowns are built from the most active visitors of the range (one
 * /visitors page of DEVICE_DETAILS_VISITOR_SAMPLE_SIZE rows); the summary says
 * so when the range has more visitors.
 *
 * @param {Object}  props                    Component props.
 * @param {Object}  props.range              Selected range.
 * @param {Object}  props.requestParams      Extra /visitors parameters.
 * @param {boolean} props.includeResolutions Whether to render the resolution card.
 * @param {Object}  props.visitorsState      Optional { data, isLoading, error } of the same
 *                                           /visitors request made by the parent: no request is sent then.
 * @param {boolean} props.allowRobotsToggle  Whether the device card offers the "Include robots" switch,
 *                                           which adds a robot row read from the Robots list of the
 *                                           Visitors report (most active robots, same sample size).
 */
const AudienceBreakdownCards = ( {
	range,
	requestParams = {},
	includeResolutions = false,
	visitorsState,
	allowRobotsToggle = false,
} ) => {
	const [ includeRobots, setIncludeRobots ] = useState( false );
	const showRobots = allowRobotsToggle && includeRobots;
	const hasVisitorsState = Boolean( visitorsState );
	const endpointState = useAdminEndpoint(
		'/visitors',
		{
			...range,
			...requestParams,
			page: 1,
			per_page: DEVICE_DETAILS_VISITOR_SAMPLE_SIZE,
			orderby: 'pages',
			order: 'desc',
		},
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
			enabled: ! hasVisitorsState,
		}
	);
	const { data, isLoading, error } = hasVisitorsState
		? visitorsState
		: endpointState;
	const stats = useMemo(
		() => buildDeviceDetailsBreakdowns( data?.items || [] ),
		[ data ]
	);
	const sample = useMemo( () => getVisitorSample( data ), [ data ] );
	const sections = useMemo(
		() => buildAudienceBreakdownSections( stats ),
		[ stats ]
	);
	const robotsState = useAdminEndpoint(
		'/visitors',
		{
			...range,
			visitor_type: 'bot',
			page: 1,
			per_page: DEVICE_DETAILS_VISITOR_SAMPLE_SIZE,
			orderby: 'pages',
			order: 'desc',
		},
		{
			namespace: ADMIN_CONFIG?.settings?.restNamespace,
			enabled: showRobots,
		}
	);
	const robotHits = useMemo(
		() => sumRobotPageViews( robotsState.data?.items ),
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
				? withRobotDeviceItem( sections.devices, robotHits )
				: sections.devices,
		[ hasRobotRow, sections.devices, robotHits ]
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
						sample={ sample }
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
						sample={ sample }
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
						sample={ sample }
						headerActions={ robotsToggle }
						extraSummary={
							showRobots
								? getRobotsSummary( robotsState, robotHits )
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
							sample={ sample }
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
