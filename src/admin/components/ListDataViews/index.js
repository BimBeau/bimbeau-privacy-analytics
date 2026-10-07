import { useCallback, useMemo } from '@wordpress/element';
import { DataViews } from '@wordpress/dataviews';

import useSharedListDensity from '../../hooks/useSharedListDensity';

/**
 * WordPress DataViews with the row density shared by every list of the plugin and saved per user
 * (compact by default). Same props as DataViews.
 *
 * @param {Object}   props
 * @param {Object}   props.view         DataViews view.
 * @param {Function} props.onChangeView DataViews view change handler.
 */
const ListDataViews = ( { view, onChangeView, ...props } ) => {
	const [ density, setDensity ] = useSharedListDensity();

	const viewWithDensity = useMemo(
		() => ( {
			...view,
			layout: { ...( view?.layout || {} ), density },
		} ),
		[ view, density ]
	);

	const handleChangeView = useCallback(
		( nextView ) => {
			const nextDensity = nextView?.layout?.density;
			if ( nextDensity && nextDensity !== density ) {
				setDensity( nextDensity );
			}
			if ( onChangeView ) {
				onChangeView( nextView );
			}
		},
		[ density, onChangeView, setDensity ]
	);

	return (
		<DataViews
			{ ...props }
			view={ viewWithDensity }
			onChangeView={ handleChangeView }
		/>
	);
};

export default ListDataViews;
