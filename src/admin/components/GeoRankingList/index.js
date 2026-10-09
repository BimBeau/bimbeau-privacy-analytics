import { useMemo } from '@wordpress/element';
import { DataViews } from '@wordpress/dataviews';
import { __ } from '@wordpress/i18n';

import { getCountryFlagClass } from '../../lib/countryNames';
import { formatNumber } from '../../lib/formatters';
import { registerDataViewsTranslations } from '../../lib/dataviewsTranslations';

const RANKING_DEFAULT_LIMIT = 8;

/**
 * Compact ranking shown next to the Geolocation map: one line per place with its flag, its name
 * and its visitors, in the DataViews list layout. The table below keeps the full report.
 *
 * @param {Object}   props
 * @param {string}   props.title      Heading of the ranking.
 * @param {Object[]} props.items      Places: `{ id, label, countryCode, value }`.
 * @param {number}   props.limit      Maximum number of places shown.
 * @param {string}   props.emptyLabel Text shown when there is no place.
 */
const GeoRankingList = ( { title, items = [], limit = RANKING_DEFAULT_LIMIT, emptyLabel = '' } ) => {
	registerDataViewsTranslations();

	const data = useMemo(
		() =>
			items
				.filter( ( item ) => Number( item?.value ) > 0 )
				.sort( ( a, b ) => Number( b.value ) - Number( a.value ) )
				.slice( 0, limit ),
		[ items, limit ]
	);

	const fields = useMemo(
		() => [
			{
				id: 'place',
				label: __( 'Location', 'bimbeau-privacy-analytics' ),
				enableSorting: false,
				enableHiding: false,
				getValue: ( { item } ) => item?.label || '',
				render: ( { item } ) => {
					const flagClass = getCountryFlagClass( item?.countryCode );
					return (
						<span className="bbpa-geo-ranking__place">
							<span
								className={ `bbpa-country-flag ${ flagClass || 'bbpa-country-flag--unknown' }` }
								aria-hidden="true"
							/>
							<span className="bbpa-geo-ranking__label">{ item?.label }</span>
						</span>
					);
				},
			},
			{
				id: 'value',
				label: __( 'Visitors', 'bimbeau-privacy-analytics' ),
				enableSorting: false,
				enableHiding: false,
				getValue: ( { item } ) => Number( item?.value ) || 0,
				render: ( { item } ) => (
					<span className="bbpa-geo-ranking__value">
						{ formatNumber( Number( item?.value ) || 0 ) }
					</span>
				),
			},
		],
		[]
	);

	return (
		<section className="bbpa-geo-ranking" aria-label={ title }>
			<h3 className="bbpa-geo-ranking__title">{ title }</h3>
			{ data.length > 0 ? (
				<DataViews
					data={ data }
					fields={ fields }
					view={ {
						type: 'list',
						perPage: limit,
						page: 1,
						titleField: 'place',
						fields: [ 'value' ],
						layout: { density: 'compact' },
					} }
					onChangeView={ () => {} }
					paginationInfo={ { totalItems: data.length, totalPages: 1 } }
					defaultLayouts={ { list: {} } }
					getItemId={ ( item ) => String( item?.id ?? item?.label ?? '' ) }
				>
					<DataViews.Layout />
				</DataViews>
			) : (
				<p className="bbpa-geo-ranking__empty">{ emptyLabel }</p>
			) }
		</section>
	);
};

export default GeoRankingList;
