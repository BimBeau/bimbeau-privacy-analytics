const WIDTH = 64;
const HEIGHT = 18;
const PADDING = 2;

const normalizeSeries = ( series ) =>
	Array.isArray( series )
		? series.map( ( value ) => Math.max( 0, Number( value ) || 0 ) )
		: [];

/**
 * Largest value of several series, to draw them on one scale.
 *
 * @param {Array<Array<number>>} seriesList Series.
 * @return {number} Largest value, 0 without values.
 */
export const getSeriesMaxValue = ( seriesList ) =>
	( Array.isArray( seriesList ) ? seriesList : [] ).reduce(
		( max, series ) => Math.max( max, ...normalizeSeries( series ), 0 ),
		0
	);

const buildPoints = ( values, scaleMaxValue, width, height ) => {
	const series = values.length > 0 ? values : [ 0, 0 ];
	const maxValue = Math.max( ...series, Number( scaleMaxValue ) || 0, 0 );
	const drawableWidth = width - PADDING * 2;
	const drawableHeight = height - PADDING * 2;
	const denominator = Math.max( series.length - 1, 1 );
	const baseline = height - PADDING;

	return series.map( ( value, index ) => {
		const x = PADDING + ( drawableWidth * index ) / denominator;
		const y =
			maxValue > 0
				? PADDING + drawableHeight - ( drawableHeight * value ) / maxValue
				: baseline;

		return [ x, y ];
	} );
};

const toPointList = ( points ) =>
	points.map( ( [ x, y ] ) => `${ x.toFixed( 2 ) },${ y.toFixed( 2 ) }` ).join( ' ' );

/**
 * Small line chart of a row series.
 *
 * @param {Object}   props          Component props.
 * @param {number[]} props.series   Values, oldest first.
 * @param {string}   props.label    Accessible label (the chart is decorative without one).
 * @param {number}   props.maxValue Top of the scale shared by the rows of a list (optional; the
 *                                  series maximum otherwise).
 * @param {boolean}  props.filled   Whether to draw the area under the line and the last point.
 * @param {number}   props.width    Width in pixels.
 * @param {number}   props.height   Height in pixels.
 */
const MiniSparkline = ( {
	series = [],
	label = '',
	maxValue = 0,
	filled = false,
	width = WIDTH,
	height = HEIGHT,
} ) => {
	const values = normalizeSeries( series );
	const points = buildPoints( values, maxValue, width, height );
	const accessibilityProps = label
		? { role: 'img', 'aria-label': label }
		: { 'aria-hidden': 'true', focusable: 'false' };
	const baseline = ( height - PADDING ).toFixed( 2 );
	const first = points[ 0 ];
	const last = points[ points.length - 1 ];

	return (
		<span
			className={ `bbpa-mini-sparkline${ filled ? ' bbpa-mini-sparkline--filled' : '' }` }
			style={ filled ? { width, height } : undefined }
			{ ...accessibilityProps }
		>
			<svg
				className="bbpa-mini-sparkline__svg"
				viewBox={ `0 0 ${ width } ${ height }` }
				width={ width }
				height={ height }
				preserveAspectRatio="none"
			>
				{ filled ? (
					<polygon
						className="bbpa-mini-sparkline__area"
						points={ `${ first[ 0 ].toFixed( 2 ) },${ baseline } ${ toPointList(
							points
						) } ${ last[ 0 ].toFixed( 2 ) },${ baseline }` }
					/>
				) : null }
				<polyline
					className="bbpa-mini-sparkline__line"
					points={ toPointList( points ) }
				/>
				{ filled ? (
					<circle
						className="bbpa-mini-sparkline__point"
						cx={ last[ 0 ].toFixed( 2 ) }
						cy={ last[ 1 ].toFixed( 2 ) }
						r="2"
					/>
				) : null }
			</svg>
		</span>
	);
};

export default MiniSparkline;
