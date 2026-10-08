import { formatNumber } from '../../lib/formatters';

const clampShare = ( value ) => Math.min( 100, Math.max( 0, Number( value ) || 0 ) );

/**
 * Share of a list row: a bar and the percentage of the total. The bar of the largest share of the
 * displayed rows fills the track, so that small shares stay readable.
 *
 * @param {Object}   props        Component props.
 * @param {number}   props.value  Share of the row, in percent.
 * @param {number[]} props.shares Shares of the displayed rows, in percent.
 */
const ShareBar = ( { value, shares = [] } ) => {
	const share = clampShare( value );
	const largestShare = Math.max( share, ...shares.map( clampShare ) );
	const width = largestShare > 0 ? ( share / largestShare ) * 100 : 0;

	return (
		<span className="bbpa-report-table__share">
			<span className="bbpa-report-table__share-bar" aria-hidden="true">
				<span style={ { width: `${ width }%` } } />
			</span>
			<span className="bbpa-report-table__share-value">
				{ `${ formatNumber( Number( value ) || 0, {
					minimumFractionDigits: 1,
					maximumFractionDigits: 1,
				} ) } %` }
			</span>
		</span>
	);
};

export default ShareBar;
