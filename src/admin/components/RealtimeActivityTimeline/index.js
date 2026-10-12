import { createInterpolateElement, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { DataViews } from '@wordpress/dataviews';
import { __, sprintf } from '@wordpress/i18n';

import { getCountryFlagClass } from '../../lib/countryNames';
import { formatTimeSince, toUnixSeconds } from '../../lib/relativeTime';
import { registerDataViewsTranslations } from '../../lib/dataviewsTranslations';
import {
	getActivityDisplayPath,
	getActivityEntrySource,
	getActivityPageLabel,
} from '../../lib/realtimeActivity';

// The clock also drives the recent state of the bullets, so it ticks as often as the real-time poll.
const TIMELINE_REFRESH_MS = 5000;
// The real-time snapshot carries the last 20 actions; the feed scrolls inside the height of the map.
const TIMELINE_DEFAULT_LIMIT = 20;
// Same freshness as the map markers: an action stays highlighted during its first minute.
const RECENT_ACTION_SECONDS = 60;

const getTimestamp = ( item ) => toUnixSeconds( item?.timestamp ) ?? 0;
const getItemId = ( item ) => String( item?.id || '' );

/**
 * Sentence of an action, with the page or element name as `<target />`.
 *
 * @param {Object} item Activity item.
 * @return {string} Translated sentence.
 */
const getActionSentence = ( item ) => {
	if ( item?.type === 'pageview' && item?.is_entry ) {
		/* translators: Recent activity of the real-time panel. <target /> is the page name. */
		return __( 'Arrives on <target />', 'bimbeau-privacy-analytics' );
	}

	if ( item?.type === 'pageview' || ! item?.type ) {
		/* translators: Recent activity of the real-time panel. <target /> is the page name. */
		return __( 'Views <target />', 'bimbeau-privacy-analytics' );
	}

	if ( item?.trigger_type === 'click' ) {
		/* translators: Recent activity of the real-time panel. <target /> is the name of the tracked click. */
		return __( 'Clicks <target />', 'bimbeau-privacy-analytics' );
	}

	if ( item?.trigger_type === 'form_submit' ) {
		/* translators: Recent activity of the real-time panel. <target /> is the name of the tracked form. */
		return __( 'Submits <target />', 'bimbeau-privacy-analytics' );
	}

	if ( item?.trigger_type === 'page_view' ) {
		/* translators: Recent activity of the real-time panel. <target /> is the name of the tracked page view event. */
		return __( 'Reaches <target />', 'bimbeau-privacy-analytics' );
	}

	/* translators: Recent activity of the real-time panel. <target /> is the name of the tracked event. */
	return __( 'Triggers <target />', 'bimbeau-privacy-analytics' );
};

const getTargetLabel = ( item ) => {
	if ( item?.type && item.type !== 'pageview' ) {
		const label = typeof item?.label === 'string' ? item.label.trim() : '';
		return label || __( 'an event', 'bimbeau-privacy-analytics' );
	}

	return getActivityPageLabel( item ).label;
};

/**
 * Line under the action: the page address (when the action names it differently) and, for a visit entry, its
 * source.
 *
 * @param {Object} item Activity item.
 * @return {string} Description, possibly empty.
 */
const getActionDescription = ( item ) => {
	const parts = [];
	const isPageView = ! item?.type || item.type === 'pageview';
	if ( ! isPageView || getActivityPageLabel( item ).hasTitle ) {
		const displayPath = getActivityDisplayPath( item?.page_path );
		// The homepage is already named: its address adds nothing.
		if ( displayPath && displayPath !== '/' ) {
			parts.push( displayPath );
		}
	}

	if ( isPageView && item?.is_entry ) {
		const source = getActivityEntrySource( item );
		if ( source ) {
			/* translators: %s: source of the visit (a website, an ad network or a channel). */
			parts.push( sprintf( __( 'from %s', 'bimbeau-privacy-analytics' ), source ) );
		} else {
			parts.push( __( 'direct access', 'bimbeau-privacy-analytics' ) );
		}
	}

	return parts.join( ' · ' );
};

/**
 * Feed of the latest actions next to the real-time map: one line per page view (and, in Premium, per tracked
 * event), newest first. Each line reads as a sentence ("Arrives on Home page"), with the address and the visit
 * source underneath and the elapsed time on the right.
 *
 * The bullet of an action is blue during its first minute, like the fresh map markers, then grey. An action
 * received after the feed was first displayed also sends one halo from its bullet.
 *
 * @param {Object}   props
 * @param {Object[]} props.items          Activity items of the real-time snapshot (`id`, `type`, `visitor_id`,
 *                                        `country_code`, `timestamp`, `page_path`, `page_title`, `is_entry`,
 *                                        `referrer_domain`, `source_category`, `label`, `trigger_type`).
 * @param {number}   props.limit          Maximum number of actions shown.
 * @param {Function} props.onHoverVisitor Called with the hovered visitor id, or '' on leave.
 */
const RealtimeActivityTimeline = ( { items = [], limit = TIMELINE_DEFAULT_LIMIT, onHoverVisitor } ) => {
	registerDataViewsTranslations();
	const [ nowSeconds, setNowSeconds ] = useState( () => Date.now() / 1000 );
	const seenIdsRef = useRef( null );
	const newIdsRef = useRef( new Set() );

	useEffect( () => {
		const timer = setInterval( () => setNowSeconds( Date.now() / 1000 ), TIMELINE_REFRESH_MS );
		return () => clearInterval( timer );
	}, [] );

	const data = useMemo(
		() =>
			[ ...items ]
				.filter( ( item ) => getItemId( item ) !== '' )
				.sort( ( a, b ) => getTimestamp( b ) - getTimestamp( a ) )
				.slice( 0, limit ),
		[ items, limit ]
	);

	// Actions already listed when the feed first renders are not announced: only later arrivals send a halo.
	const newIds = useMemo( () => {
		const ids = data.map( getItemId );
		if ( seenIdsRef.current === null ) {
			seenIdsRef.current = new Set( ids );
			return newIdsRef.current;
		}

		const next = new Set();
		ids.forEach( ( id ) => {
			if ( newIdsRef.current.has( id ) || ! seenIdsRef.current.has( id ) ) {
				next.add( id );
			}
			seenIdsRef.current.add( id );
		} );
		newIdsRef.current = next;
		return next;
	}, [ data ] );

	const fields = useMemo(
		() => [
			{
				id: 'action',
				label: __( 'Action', 'bimbeau-privacy-analytics' ),
				enableSorting: false,
				enableHiding: false,
				getValue: ( { item } ) => getTargetLabel( item ),
				render: ( { item } ) => {
					const flagClass = getCountryFlagClass( item?.country_code );
					const visitorId = String( item?.visitor_id || '' );
					const hover = () => onHoverVisitor?.( visitorId );
					const leave = () => onHoverVisitor?.( '' );
					const id = getItemId( item );
					const isRecent = nowSeconds - getTimestamp( item ) < RECENT_ACTION_SECONDS;
					const target = getTargetLabel( item );

					return (
						<span
							className="bbpa-realtime-timeline__visit"
							data-bbpa-recent={ isRecent ? 'true' : undefined }
							data-bbpa-new={ newIds.has( id ) ? 'true' : undefined }
							onMouseEnter={ hover }
							onMouseLeave={ leave }
							onFocus={ hover }
							onBlur={ leave }
							tabIndex={ 0 }
						>
							<span
								className={ `bbpa-country-flag ${ flagClass || 'bbpa-country-flag--unknown' }` }
								aria-hidden="true"
							/>
							<span className="bbpa-realtime-timeline__action" title={ target }>
								{ createInterpolateElement( getActionSentence( item ), {
									target: <strong className="bbpa-realtime-timeline__target">{ target }</strong>,
								} ) }
							</span>
						</span>
					);
				},
			},
			{
				id: 'details',
				label: __( 'Details', 'bimbeau-privacy-analytics' ),
				enableSorting: false,
				enableHiding: false,
				getValue: ( { item } ) => getActionDescription( item ),
				render: ( { item } ) => {
					const description = getActionDescription( item );
					return description ? (
						<span className="bbpa-realtime-timeline__details" title={ description }>
							{ description }
						</span>
					) : null;
				},
			},
			{
				id: 'last_activity',
				label: __( 'Last activity', 'bimbeau-privacy-analytics' ),
				enableSorting: false,
				enableHiding: false,
				getValue: ( { item } ) => getTimestamp( item ),
				render: ( { item } ) => (
					<span className="bbpa-realtime-timeline__time">
						{ formatTimeSince( getTimestamp( item ), nowSeconds ) }
					</span>
				),
			},
		],
		[ newIds, nowSeconds, onHoverVisitor ]
	);

	const view = {
		type: 'activity',
		perPage: limit,
		page: 1,
		titleField: 'action',
		descriptionField: 'details',
		fields: [ 'last_activity' ],
		layout: { density: 'compact' },
	};

	return (
		<div className="bbpa-realtime-timeline">
			<DataViews
				data={ data }
				fields={ fields }
				view={ view }
				onChangeView={ () => {} }
				paginationInfo={ { totalItems: data.length, totalPages: 1 } }
				defaultLayouts={ { activity: {} } }
				getItemId={ getItemId }
			>
				<DataViews.Layout />
			</DataViews>
		</div>
	);
};

export default RealtimeActivityTimeline;
