export const VIEWPORT_ZOOM_MIN = 1;
export const VIEWPORT_ZOOM_MAX = 24;
export const VIEWPORT_ZOOM_STEP = 1;

const clamp = ( value, min, max ) => Math.min( max, Math.max( min, value ) );

export const INITIAL_VIEWPORT = Object.freeze( {
	scale: VIEWPORT_ZOOM_MIN,
	translateX: 0,
	translateY: 0,
} );

export const clampViewportToMapBounds = ( viewport, mapWidth, mapHeight ) => {
	const width = Math.max( 0, Number( mapWidth ) || 0 );
	const height = Math.max( 0, Number( mapHeight ) || 0 );
	const scale = clamp(
		Number( viewport?.scale ) || VIEWPORT_ZOOM_MIN,
		VIEWPORT_ZOOM_MIN,
		VIEWPORT_ZOOM_MAX
	);
	const minX = width - width * scale;
	const minY = height - height * scale;

	return {
		scale,
		translateX: clamp( Number( viewport?.translateX ) || 0, minX, 0 ),
		translateY: clamp( Number( viewport?.translateY ) || 0, minY, 0 ),
	};
};

export const zoomViewportAtPoint = (
	viewport,
	nextScale,
	pointX,
	pointY,
	width,
	height
) => {
	const previousScale = clamp(
		Number( viewport?.scale ) || VIEWPORT_ZOOM_MIN,
		VIEWPORT_ZOOM_MIN,
		VIEWPORT_ZOOM_MAX
	);
	const scale = clamp(
		Number( nextScale ) || previousScale,
		VIEWPORT_ZOOM_MIN,
		VIEWPORT_ZOOM_MAX
	);
	const anchorX = Number( pointX ) || 0;
	const anchorY = Number( pointY ) || 0;
	const translateX = Number( viewport?.translateX ) || 0;
	const translateY = Number( viewport?.translateY ) || 0;

	return clampViewportToMapBounds(
		{
			scale,
			translateX:
				anchorX - ( ( anchorX - translateX ) / previousScale ) * scale,
			translateY:
				anchorY - ( ( anchorY - translateY ) / previousScale ) * scale,
		},
		width,
		height
	);
};
