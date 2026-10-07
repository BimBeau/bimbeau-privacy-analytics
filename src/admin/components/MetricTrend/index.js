import FeatureIcon from '../icons/FeatureIcon';
import {
	calculateChangePercent,
	formatTrendPercent,
} from '../../lib/formatters';

/**
 * Trend of a row metric against the previous period.
 *
 * @param {Object} props               Component props.
 * @param {number} props.value         Current value.
 * @param {number} props.previousValue Value of the previous period.
 */
const MetricTrend = ( { value, previousValue } ) => {
	const change = calculateChangePercent( Number( value ), previousValue );
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

	return (
		<span
			className={ `bbpa-report-table__trend bbpa-report-table__trend--${ modifier }` }
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
