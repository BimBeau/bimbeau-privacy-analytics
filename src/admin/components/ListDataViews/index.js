import { useCallback, useMemo } from '@wordpress/element';
import { DataViews } from '@wordpress/dataviews';

import useSharedListDensity from '../../hooks/useSharedListDensity';

/**
 * DataViews adds a column shown again from View options at the end of the table. Put it back at
 * its place in the field definitions instead, before the first visible column defined after it,
 * so hiding then showing a column does not change the column order.
 *
 * @param {string[]} previousFieldIds Visible field ids before the change.
 * @param {string[]} nextFieldIds     Visible field ids after the change.
 * @param {Object[]} fields           DataViews field definitions, in their default order.
 * @return {string[]} Visible field ids.
 */
export const restoreShownFieldPosition = ( previousFieldIds, nextFieldIds, fields ) => {
	if (
		! Array.isArray( previousFieldIds ) ||
		! Array.isArray( nextFieldIds ) ||
		nextFieldIds.length !== previousFieldIds.length + 1
	) {
		return nextFieldIds;
	}
	const shownId = nextFieldIds[ nextFieldIds.length - 1 ];
	if ( previousFieldIds.includes( shownId ) ) {
		return nextFieldIds;
	}
	const definitionOrder = ( fields || [] ).map( ( field ) => field.id );
	const shownIndex = definitionOrder.indexOf( shownId );
	if ( shownIndex < 0 ) {
		return nextFieldIds;
	}
	const insertAt = previousFieldIds.findIndex(
		( id ) => definitionOrder.indexOf( id ) > shownIndex
	);
	if ( insertAt < 0 ) {
		return nextFieldIds;
	}

	return [
		...previousFieldIds.slice( 0, insertAt ),
		shownId,
		...previousFieldIds.slice( insertAt ),
	];
};

/**
 * WordPress DataViews with the row density shared by every list of the plugin and saved per user
 * (compact by default), and columns shown again at their default place. Same props as DataViews.
 *
 * @param {Object}   props
 * @param {Object}   props.view         DataViews view.
 * @param {Function} props.onChangeView DataViews view change handler.
 */
const ListDataViews = ( { view, onChangeView, ...props } ) => {
	const { fields } = props;
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
				const nextFields = restoreShownFieldPosition(
					view?.fields,
					nextView?.fields,
					fields
				);
				onChangeView(
					nextFields === nextView?.fields
						? nextView
						: { ...nextView, fields: nextFields }
				);
			}
		},
		[ density, fields, onChangeView, setDensity, view?.fields ]
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
