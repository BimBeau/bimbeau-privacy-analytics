import { __, sprintf } from '@wordpress/i18n';

import FeatureIcon from '../icons/FeatureIcon';
import {
	calculateChangePercent,
	formatNumber,
	formatTrendPercent,
} from '../../lib/formatters';

/**
 * Trend of a row metric against the previous period.
 *
 * A row without value in the previous period has no percent change: it shows a "New" badge. An
 * unknown previous value (`null` or `undefined`, for instance a row beyond the compared rows)
 * shows nothing, so a partial comparison never reads as a new row.
 *
 * @param {Object}      props               Component props.
 * @param {number}      props.value         Current value.
 * @param {number|null} props.previousValue Value of the previous period, or null when unknown.
 */
const MetricTrend = ( { value, previousValue } ) => {
	if ( previousValue === null || previousValue === undefined ) {
		return null;
	}

	const current = Number( value ) || 0;
	const previous = Number( previousValue ) || 0;

	if ( previous === 0 ) {
		if ( current === 0 ) {
			return null;
		}

		return (
			<span className="bbpa-report-table__trend bbpa-report-table__trend--new">
				<span className="bbpa-report-table__new-badge">
					{ __( 'New', 'bimbeau-privacy-analytics' ) }
				</span>
			</span>
		);
	}

	const change = calculateChangePercent( current, previous );
	const changeLabel = formatTrendPercent( change );

	if ( changeLabel === null ) {
		return null;
	}

	const isNegative = Number( change ) < 0;
	const isNeutral = Number( change ) === 0;
	let modifier = 'positive';
	if ( isNeutral ) {
		modifier = 'neutral';
	} else if ( isNegative ) {
		modifier = 'negative';
	}

	const difference = current - previous;
	const detail = sprintf(
		/* translators: 1: Value of the previous period, 2: Difference with the current period (+120). */
		__( 'Previous period: %1$s (%2$s)', 'bimbeau-privacy-analytics' ),
		formatNumber( previous ),
		formatNumber( difference, { signDisplay: 'exceptZero' } )
	);

	return (
		<span
			className={ `bbpa-report-table__trend bbpa-report-table__trend--${ modifier }` }
			title={ detail }
		>
			{ changeLabel }
			{ ! isNeutral && (
				<FeatureIcon
					name={ isNegative ? 'trendingDown' : 'trendingUp' }
					size={ 12 }
				/>
			) }
		</span>
	);
};

export default MetricTrend;
