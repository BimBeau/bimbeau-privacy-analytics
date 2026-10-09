import { useEffect, useMemo, useState } from '@wordpress/element';
import { DataViews } from '@wordpress/dataviews';
import { __ } from '@wordpress/i18n';

import PageTitle from '../PageTitle';
import { getCountryFlagClass } from '../../lib/countryNames';
import { formatTimeSince, toUnixSeconds } from '../../lib/relativeTime';
import { registerDataViewsTranslations } from '../../lib/dataviewsTranslations';

const TIMELINE_REFRESH_MS = 15000;
const TIMELINE_DEFAULT_LIMIT = 10;

const getLastActivity = ( row ) =>
	toUnixSeconds( row?.last_view_at ) ?? toUnixSeconds( row?.first_view_at ) ?? 0;

/**
 * Compact vertical timeline of the latest page views, next to the real-time map. It only shows
 * the country flag, the page and the elapsed time: the visits table below keeps the details.
 *
 * @param {Object}   props
 * @param {Object[]} props.rows           Real-time visit rows (`_bbpaRowId`, `_bbpaCountryCode`,
 *                                        `current_page`, `last_view_at`, `visitor_id`).
 * @param {number}   props.limit          Maximum number of visits shown.
 * @param {Function} props.onHoverVisitor Called with the hovered visitor id, or '' on leave.
 */
const RealtimeActivityTimeline = ( { rows = [], limit = TIMELINE_DEFAULT_LIMIT, onHoverVisitor } ) => {
	registerDataViewsTranslations();
	const [ nowSeconds, setNowSeconds ] = useState( () => Date.now() / 1000 );

	useEffect( () => {
		const timer = setInterval( () => setNowSeconds( Date.now() / 1000 ), TIMELINE_REFRESH_MS );
		return () => clearInterval( timer );
	}, [] );

	const data = useMemo(
		() =>
			[ ...rows ]
				.sort( ( a, b ) => getLastActivity( b ) - getLastActivity( a ) )
				.slice( 0, limit ),
		[ rows, limit ]
	);

	const fields = useMemo(
		() => [
			{
				id: 'visit',
				label: __( 'Page', 'bimbeau-privacy-analytics' ),
				enableSorting: false,
				enableHiding: false,
				getValue: ( { item } ) => item?.current_page || '',
				render: ( { item } ) => {
					const flagClass = getCountryFlagClass( item?._bbpaCountryCode || item?.country_code );
					const visitorId = String( item?.visitor_id || '' );
					const hover = () => onHoverVisitor?.( visitorId );
					const leave = () => onHoverVisitor?.( '' );
					return (
						<span
							className="bbpa-realtime-timeline__visit"
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
							<span className="bbpa-realtime-timeline__page">
								<PageTitle>
									{ item?.current_page || __( 'Unknown page', 'bimbeau-privacy-analytics' ) }
								</PageTitle>
							</span>
						</span>
					);
				},
			},
			{
				id: 'last_activity',
				label: __( 'Last activity', 'bimbeau-privacy-analytics' ),
				enableSorting: false,
				enableHiding: false,
				getValue: ( { item } ) => getLastActivity( item ),
				render: ( { item } ) => (
					<span className="bbpa-realtime-timeline__time">
						{ formatTimeSince( getLastActivity( item ), nowSeconds ) }
					</span>
				),
			},
		],
		[ nowSeconds, onHoverVisitor ]
	);

	const view = {
		type: 'activity',
		perPage: limit,
		page: 1,
		titleField: 'visit',
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
				getItemId={ ( item ) => String( item?._bbpaRowId || item?.visitor_id || '' ) }
			>
				<DataViews.Layout />
			</DataViews>
		</div>
	);
};

export default RealtimeActivityTimeline;
