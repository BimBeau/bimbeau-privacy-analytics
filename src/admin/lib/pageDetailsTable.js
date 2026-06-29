export const getPageDetailsMetricLabels = ( source ) => {
	switch ( source ) {
		case 'entry-pages':
			return {
				metricLabel: 'Entries (approx.)',
				currentSeriesLabel: 'Current entries (approx.)',
				previousSeriesLabel: 'Previous entries (approx.)',
			};
		case 'exit-pages':
			return {
				metricLabel: 'Exits (approx.)',
				currentSeriesLabel: 'Current exits (approx.)',
				previousSeriesLabel: 'Previous exits (approx.)',
			};
		case '404s':
		case 'not-found':
			return {
				metricLabel: 'Page views',
				currentSeriesLabel: 'Current page views',
				previousSeriesLabel: 'Previous page views',
			};
		default:
			return {
				metricLabel: 'Page views',
				currentSeriesLabel: 'Current page views',
				previousSeriesLabel: 'Previous page views',
			};
	}
};

export const sortPageDetailItems = (
	items,
	sortBy = 'value',
	order = 'desc'
) => {
	const sortedItems = [ ...( items || [] ) ];
	const direction = order === 'asc' ? 1 : -1;

	sortedItems.sort( ( left, right ) => {
		const leftBucket = String( left?.bucket || '' );
		const rightBucket = String( right?.bucket || '' );

		if ( sortBy === 'bucket' ) {
			return leftBucket.localeCompare( rightBucket ) * direction;
		}

		if ( left.value === right.value ) {
			return leftBucket.localeCompare( rightBucket ) * direction;
		}

		return ( ( left.value || 0 ) - ( right.value || 0 ) ) * direction;
	} );

	return sortedItems;
};

export const paginatePageDetailItems = ( items, page = 1, perPage = 10 ) => {
	const normalizedPage = Math.max( 1, Number( page ) || 1 );
	const normalizedPerPage = Math.max( 1, Number( perPage ) || 10 );
	const totalItems = items.length;
	const totalPages = Math.max(
		1,
		Math.ceil( totalItems / normalizedPerPage )
	);
	const currentPage = Math.min( normalizedPage, totalPages );
	const offset = ( currentPage - 1 ) * normalizedPerPage;

	return {
		items: items.slice( offset, offset + normalizedPerPage ),
		pagination: {
			page: currentPage,
			perPage: normalizedPerPage,
			totalItems,
			totalPages,
		},
	};
};
