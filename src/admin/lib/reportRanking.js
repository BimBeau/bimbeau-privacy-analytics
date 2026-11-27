/**
 * Ranking of report rows by a secondary column (change against the previous period, average time
 * on page).
 *
 * The report endpoints only sort by the label and the main metric, so these rankings are built in
 * the browser over a capped page of rows ordered by the main metric (see `ReportDataView`). Rows
 * measured on too little are kept out of the ranking: a page that went from 3 to 21 views is a
 * +600 % that would otherwise head every change ranking.
 *
 * The threshold applies to what the column is measured against, not to the row itself: the value
 * of the previous period for a change (its denominator), the page views for an average time. A
 * page that fell from 200 to 2 views stays ranked — its -99 % is measured against 200 — while the
 * page that rose from 3 to 21 does not.
 */

/**
 * Smallest value a row needs, on what its column is measured against, to enter a ranking.
 *
 * @type {number}
 */
export const MIN_METRIC_FOR_RANKING = 10;

/**
 * Smallest number of rows above `MIN_METRIC_FOR_RANKING` for the threshold to apply.
 *
 * Below it the whole list is small and ranking every row is more useful than ranking none.
 *
 * @type {number}
 */
export const MIN_RANKED_ITEMS = 3;

/**
 * Sort value of a row change against the previous period.
 *
 * Mirrors `MetricTrend`: an unknown previous value and a row that stayed at zero show no change at
 * all, so they are not ranked; a row absent from the previous period is a "New" row, ranked above
 * every percentage.
 *
 * @param {number}                current  Value of the current period.
 * @param {number|null|undefined} previous Value of the previous period, or null when unknown.
 * @return {number|null} Sort value, or null when the row has no change to rank.
 */
export const getChangeSortValue = ( current, previous ) => {
	if ( previous === null || previous === undefined ) {
		return null;
	}

	const currentValue = Number( current ) || 0;
	const previousValue = Number( previous ) || 0;

	if ( previousValue === 0 ) {
		return currentValue === 0 ? null : Number.POSITIVE_INFINITY;
	}

	return ( currentValue - previousValue ) / previousValue;
};

/**
 * Value the ranking threshold applies to for a change.
 *
 * The change is a ratio: its denominator is the previous period. A row absent from it is a "New"
 * row with no denominator, judged on its own value instead.
 *
 * @param {number}                current  Value of the current period.
 * @param {number|null|undefined} previous Value of the previous period, or null when unknown.
 * @return {number} Value to compare with the threshold.
 */
export const getChangeThresholdValue = ( current, previous ) => {
	const previousValue = Number( previous ) || 0;

	return previousValue > 0 ? previousValue : Number( current ) || 0;
};

/**
 * Sort value of an average time cell.
 *
 * A row without measured time (missing or zero) is not ranked: it would otherwise head an
 * ascending ranking with a column of `0:00`.
 *
 * @param {number|null|undefined} value Average time of the row.
 * @return {number|null} Sort value, or null when the row has no measured time.
 */
export const getDurationSortValue = ( value ) => {
	const duration = Number( value ) || 0;

	return duration > 0 ? duration : null;
};

/**
 * Order report rows by a secondary column.
 *
 * Rows that cannot be ranked (no value) and, when the threshold applies, rows under
 * `MIN_METRIC_FOR_RANKING` keep the order they came in with — the main metric, descending — after
 * the ranked ones.
 *
 * @param {Object}   options                   Options.
 * @param {Array}    options.items             Rows, ordered by the main metric, descending.
 * @param {Function} options.getSortValue      Sort value of a row, or null when it cannot be ranked.
 * @param {Function} options.getMetricValue    Main metric of a row, which breaks ties.
 * @param {Function} [options.getThresholdValue] Value the threshold applies to (default: the main
 *                                               metric).
 * @param {string}   [options.direction]       `asc` or `desc` (default).
 * @param {number}   [options.minMetric]       Threshold (default `MIN_METRIC_FOR_RANKING`).
 * @return {{items: Array, rankedCount: number, isThresholdApplied: boolean}} Ordered rows, how
 * many of them are ranked, and whether the threshold left rows out of the ranking.
 */
export const rankReportItems = ( {
	items,
	getSortValue,
	getMetricValue,
	getThresholdValue,
	direction = 'desc',
	minMetric = MIN_METRIC_FOR_RANKING,
} ) => {
	const list = Array.isArray( items ) ? items : [];
	const entries = list.map( ( item, index ) => ( {
		item,
		index,
		sortValue: getSortValue( item ),
		metric: Number( getMetricValue( item ) ) || 0,
		thresholdValue: Number(
			getThresholdValue ? getThresholdValue( item ) : getMetricValue( item )
		) || 0,
	} ) );

	const rankable = entries.filter( ( entry ) => entry.sortValue !== null );
	const aboveThreshold = rankable.filter(
		( entry ) => entry.thresholdValue >= minMetric
	);
	const isThresholdApplied =
		aboveThreshold.length >= MIN_RANKED_ITEMS &&
		aboveThreshold.length < rankable.length;
	const ranked = isThresholdApplied ? aboveThreshold : rankable;
	const rankedIndexes = new Set( ranked.map( ( entry ) => entry.index ) );
	const rest = entries.filter( ( entry ) => ! rankedIndexes.has( entry.index ) );

	const sign = direction === 'asc' ? 1 : -1;
	const sorted = [ ...ranked ].sort( ( left, right ) => {
		if ( left.sortValue !== right.sortValue ) {
			return left.sortValue < right.sortValue ? -sign : sign;
		}

		if ( left.metric !== right.metric ) {
			return right.metric - left.metric;
		}

		return left.index - right.index;
	} );

	return {
		items: [ ...sorted, ...rest ].map( ( entry ) => entry.item ),
		rankedCount: sorted.length,
		isThresholdApplied,
	};
};
