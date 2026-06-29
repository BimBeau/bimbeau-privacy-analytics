const WIDTH = 64;
const HEIGHT = 18;
const PADDING = 2;

const normalizeSeries = ( series ) =>
	Array.isArray( series )
		? series.map( ( value ) => Math.max( 0, Number( value ) || 0 ) )
		: [];

const buildPoints = ( values ) => {
	const series = values.length > 0 ? values : [ 0, 0 ];
	const maxValue = Math.max( ...series, 0 );
	const drawableWidth = WIDTH - PADDING * 2;
	const drawableHeight = HEIGHT - PADDING * 2;
	const denominator = Math.max( series.length - 1, 1 );
	const baseline = HEIGHT - PADDING;

	return series.map( ( value, index ) => {
		const x = PADDING + ( drawableWidth * index ) / denominator;
		const y =
			maxValue > 0
				? PADDING + drawableHeight - ( drawableHeight * value ) / maxValue
				: baseline;

		return `${ x.toFixed( 2 ) },${ y.toFixed( 2 ) }`;
	} );
};

const MiniSparkline = ( { series = [], label = '' } ) => {
	const values = normalizeSeries( series );
	const points = buildPoints( values ).join( ' ' );
	const accessibilityProps = label
		? { role: 'img', 'aria-label': label }
		: { 'aria-hidden': 'true', focusable: 'false' };

	return (
		<span className="bbpa-mini-sparkline" { ...accessibilityProps }>
			<svg
				className="bbpa-mini-sparkline__svg"
				viewBox={ `0 0 ${ WIDTH } ${ HEIGHT }` }
				width={ WIDTH }
				height={ HEIGHT }
				preserveAspectRatio="none"
			>
				<polyline className="bbpa-mini-sparkline__line" points={ points } />
			</svg>
		</span>
	);
};

export default MiniSparkline;
