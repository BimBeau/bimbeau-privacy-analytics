import { forwardRef, useCallback, useEffect, useRef } from '@wordpress/element';
import { Button, Card, CardBody, Spinner } from '@wordpress/components';
import { arrowRight, close } from '@wordpress/icons';
import { __, _n, sprintf } from '@wordpress/i18n';

import { getAdminPanelUrl } from '../../lib/adminUrls';
import { formatNumber } from '../../lib/formatters';
import MetricTrend from '../MetricTrend';
import { isPanelEnabled } from '../../constants';

// Number of sources listed; the others are counted under the list.
export const CHANNEL_DETAILS_MAX_SOURCES = 6;

const getSourcesTitle = ( channelKey ) => {
	switch ( channelKey ) {
		case 'organic-search':
		case 'paid-search':
			return __( 'Search engines', 'bimbeau-privacy-analytics' );
		case 'organic-social':
		case 'paid-social':
			return __( 'Social networks', 'bimbeau-privacy-analytics' );
		case 'ai-assistants':
			return __( 'AI assistants', 'bimbeau-privacy-analytics' );
		case 'referrals':
			return __( 'Referring sites', 'bimbeau-privacy-analytics' );
		default:
			return __( 'Main sources', 'bimbeau-privacy-analytics' );
	}
};

/**
 * Detailed report of a channel: the entry pages for direct visits, the referrers otherwise. Null
 * when that report is turned off in the settings.
 *
 * @param {string} channelKey Channel key.
 * @return {{href: string, label: string}|null} Link to the report.
 */
export const getChannelReportLink = ( channelKey ) => {
	if ( channelKey === 'direct' ) {
		return isPanelEnabled( 'top-pages' )
			? {
					href: getAdminPanelUrl( 'top-pages', { bbpa_tab: 'entry-pages' } ),
					label: __( 'See entry pages', 'bimbeau-privacy-analytics' ),
			  }
			: null;
	}

	return isPanelEnabled( 'referrers' )
		? {
				href: getAdminPanelUrl( 'referrers' ),
				label: __( 'See all referrers', 'bimbeau-privacy-analytics' ),
		  }
		: null;
};

const getDifferenceModifier = ( difference ) => {
	if ( difference > 0 ) {
		return 'positive';
	}

	return difference < 0 ? 'negative' : 'neutral';
};

const ChannelSources = ( { channel, sources, isLoading, error, isPartial } ) => {
	if ( isLoading ) {
		return <Spinner />;
	}

	if ( error ) {
		return (
			<p className="bbpa-channel-details__note">
				{ __( 'The sources of this channel could not be loaded.', 'bimbeau-privacy-analytics' ) }
			</p>
		);
	}

	if ( sources.length === 0 ) {
		return (
			<p className="bbpa-channel-details__note">
				{ __( 'No source was recorded for this channel in this period.', 'bimbeau-privacy-analytics' ) }
			</p>
		);
	}

	const shown = sources.slice( 0, CHANNEL_DETAILS_MAX_SOURCES );
	const otherCount = sources.length - shown.length;
	const scale = Math.max( channel.visits, ...shown.map( ( source ) => source.visits ) );

	return (
		<>
			<ul className="bbpa-channel-details__sources">
				{ shown.map( ( source ) => (
					<li key={ source.domain || '-' }>
						<span className="bbpa-channel-details__source-name">
							{ source.domain ||
								__( 'No referring site', 'bimbeau-privacy-analytics' ) }
						</span>
						<span className="bbpa-channel-details__source-figures">
							<MetricTrend
								value={ source.visits }
								previousValue={ source.previousVisits }
							/>
							<span className="bbpa-channel-details__source-visits">
								{ formatNumber( source.visits ) }
							</span>
						</span>
						<span className="bbpa-channel-details__source-bar" aria-hidden="true">
							<span
								style={ {
									width: `${ scale > 0 ? Math.min( 100, ( source.visits / scale ) * 100 ) : 0 }%`,
								} }
							/>
						</span>
					</li>
				) ) }
			</ul>
			{ otherCount > 0 ? (
				<p className="description">
					{ sprintf(
						/* translators: %s: number of other sources of the channel. */
						_n(
							'And %s other source.',
							'And %s other sources.',
							otherCount,
							'bimbeau-privacy-analytics'
						),
						formatNumber( otherCount )
					) }
				</p>
			) : null }
			{ isPartial ? (
				<p className="description">
					{ __(
						'Only the referring sites with the most visits are listed.',
						'bimbeau-privacy-analytics'
					) }
				</p>
			) : null }
		</>
	);
};

/**
 * Detail panel of an acquisition channel: visits against the previous period, then the sites the
 * visits come from, or an explanation for direct visits, and a link to the detailed report.
 *
 * @param {Object}      props                Component props.
 * @param {string}      props.id             Id of the panel (target of the `aria-controls` of the rows).
 * @param {Object}      props.channel        Selected row: `key`, `label` and `visits`.
 * @param {number|null} props.previousVisits Visits of the previous period, null while loading.
 * @param {Object[]}    props.sources        Sources of the channel (`getChannelSources()`), with
 *                                           `previousVisits` (null when unknown) once loaded.
 * @param {boolean}     props.isLoading      Whether the sources are loading.
 * @param {Object|null} props.error          Error of the sources request.
 * @param {boolean}     props.isPartial      Whether only a part of the referring sites was loaded.
 * @param {Function}    props.onClose        Close handler.
 */
const ChannelDetails = forwardRef(
	(
		{ id, channel, previousVisits, sources = [], isLoading, error, isPartial, onClose },
		ref
	) => {
		const titleId = `${ id }-title`;
		const isDirect = channel.key === 'direct';
		const hasPrevious = previousVisits !== null && previousVisits !== undefined;
		const difference = hasPrevious ? channel.visits - previousVisits : 0;
		const reportLink = getChannelReportLink( channel.key );
		const panelRef = useRef( null );
		const setPanelRef = useCallback(
			( node ) => {
				panelRef.current = node;
				if ( typeof ref === 'function' ) {
					ref( node );
				} else if ( ref ) {
					ref.current = node;
				}
			},
			[ ref ]
		);

		// Escape closes the panel while the focus is inside it.
		useEffect( () => {
			const node = panelRef.current;
			if ( ! node ) {
				return undefined;
			}
			const onKeyDown = ( event ) => {
				if ( event.key === 'Escape' ) {
					event.stopPropagation();
					onClose();
				}
			};
			node.addEventListener( 'keydown', onKeyDown );

			return () => node.removeEventListener( 'keydown', onKeyDown );
		}, [ onClose ] );

		return (
			<aside
				id={ id }
				ref={ setPanelRef }
				className="bbpa-channel-details"
				aria-labelledby={ titleId }
				aria-live="polite"
			>
				<Card>
					<CardBody className="bbpa-channel-details__body">
						<div className="bbpa-channel-details__header">
							<div>
								<p className="bbpa-channel-details__kicker">
									{ __( 'Channel details', 'bimbeau-privacy-analytics' ) }
								</p>
								<h2 id={ titleId } className="bbpa-channel-details__title">
									{ channel.label }
								</h2>
							</div>
							<Button
								icon={ close }
								label={ __( 'Close channel details', 'bimbeau-privacy-analytics' ) }
								onClick={ onClose }
								size="compact"
							/>
						</div>
						<dl className="bbpa-channel-details__stats">
							<div>
								<dt>{ __( 'Visits', 'bimbeau-privacy-analytics' ) }</dt>
								<dd>{ formatNumber( channel.visits ) }</dd>
							</div>
							<div>
								<dt>{ __( 'Difference', 'bimbeau-privacy-analytics' ) }</dt>
								<dd>
									{ hasPrevious ? (
										<span
											className={ `bbpa-report-table__trend--${ getDifferenceModifier(
												difference
											) }` }
											title={ sprintf(
												/* translators: 1: Value of the previous period, 2: Difference with the current period (+120). */
												__( 'Previous period: %1$s (%2$s)', 'bimbeau-privacy-analytics' ),
												formatNumber( previousVisits ),
												formatNumber( difference, { signDisplay: 'exceptZero' } )
											) }
										>
											{ formatNumber( difference, { signDisplay: 'exceptZero' } ) }
										</span>
									) : (
										'–'
									) }
								</dd>
							</div>
						</dl>
						{ isDirect ? (
							<p className="bbpa-channel-details__note">
								{ __(
									'No referring site is sent for these visits: address typed in, bookmark, or link opened from an app, a document or an email without UTM parameters.',
									'bimbeau-privacy-analytics'
								) }
							</p>
						) : (
							<section className="bbpa-channel-details__section">
								<h3 className="bbpa-channel-details__subtitle">
									{ getSourcesTitle( channel.key ) }
								</h3>
								<ChannelSources
									channel={ channel }
									sources={ sources }
									isLoading={ isLoading }
									error={ error }
									isPartial={ isPartial }
								/>
							</section>
						) }
						{ reportLink ? (
							<Button
								variant="link"
								href={ reportLink.href }
								icon={ arrowRight }
								iconPosition="right"
								iconSize={ 16 }
								className="bbpa-channel-details__link"
							>
								{ reportLink.label }
							</Button>
						) : null }
					</CardBody>
				</Card>
			</aside>
		);
	}
);

export default ChannelDetails;
