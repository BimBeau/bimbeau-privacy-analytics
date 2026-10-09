import { useCallback, useMemo } from '@wordpress/element';
import { DataViews } from '@wordpress/dataviews';

import useSharedListDensity from '../../hooks/useSharedListDensity';
import { getStoredListColumns, storeListColumns } from '../../lib/storage';

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

const isSameFieldList = ( first, second ) =>
	Array.isArray( first ) &&
	Array.isArray( second ) &&
	first.length === second.length &&
	first.every( ( id, index ) => id === second[ index ] );

/**
 * Visible columns of a list from the columns saved by the user: the saved order and visibility,
 * limited to the fields that still exist. A default column the user never hid (a field added
 * since, or the City field once Pro is active) or cannot hide (`enableHiding: false`) is shown at
 * its default place.
 *
 * @param {Object|null} storedColumns `{ fields, hidden }` saved by `storeListColumns()`, or null.
 * @param {string[]}    defaultFields Visible field ids of the default view.
 * @param {Object[]}    fields        DataViews field definitions, in their default order.
 * @return {string[]} Visible field ids.
 */
export const resolveListColumns = ( storedColumns, defaultFields, fields ) => {
	if ( ! storedColumns || ! Array.isArray( storedColumns.fields ) ) {
		return defaultFields;
	}
	const fieldIds = ( fields || [] ).map( ( field ) => field.id );
	const lockedIds = ( fields || [] )
		.filter( ( field ) => field.enableHiding === false )
		.map( ( field ) => field.id );
	const hidden = ( Array.isArray( storedColumns.hidden ) ? storedColumns.hidden : [] ).filter(
		( id ) => ! lockedIds.includes( id )
	);

	return ( defaultFields || [] ).reduce(
		( visible, id ) =>
			visible.includes( id ) || hidden.includes( id ) || ! fieldIds.includes( id )
				? visible
				: restoreShownFieldPosition( visible, [ ...visible, id ], fields ),
		storedColumns.fields.filter( ( id ) => fieldIds.includes( id ) )
	);
};

/**
 * Visible columns saved for a list by the current user, or the default columns.
 *
 * @param {string}   listId        List identifier used by the `columnsStorageId` prop.
 * @param {string[]} defaultFields Visible field ids of the default view.
 * @param {Object[]} fields        DataViews field definitions, in their default order.
 * @return {string[]} Visible field ids.
 */
export const getInitialListColumns = ( listId, defaultFields, fields ) =>
	resolveListColumns( getStoredListColumns( listId ), defaultFields, fields );

/**
 * WordPress DataViews with the row density shared by every list of the plugin and saved per user
 * (compact by default), and columns shown again at their default place. With `columnsStorageId`, the
 * column order and visibility chosen by the user (View options, Move left / right, Hide column) are
 * saved per user; the list reads them back with `getInitialListColumns()`. Same props as DataViews.
 *
 * With `title`, the list heads its card: the title shares the toolbar row with the search, filter,
 * view options and `header` controls, so the card needs no header of its own. `notice` (an error)
 * is shown under that row, or above the list without `title`.
 *
 * @param {Object}   props
 * @param {Object}   props.view             DataViews view.
 * @param {Function} props.onChangeView     DataViews view change handler.
 * @param {string}   props.columnsStorageId Identifier under which the columns are saved (optional).
 * @param {string}   props.title            Title shown at the start of the toolbar (optional).
 * @param {*}        props.notice           Content shown before the list, such as an error (optional).
 */
const ListDataViews = ( {
	view,
	onChangeView,
	columnsStorageId,
	title,
	notice = null,
	...props
} ) => {
	const { fields, search = true, searchLabel, header } = props;
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
				if (
					columnsStorageId &&
					Array.isArray( nextFields ) &&
					! isSameFieldList( nextFields, view?.fields )
				) {
					storeListColumns( columnsStorageId, {
						fields: nextFields,
						hidden: ( fields || [] )
							.filter(
								( field ) =>
									field.enableHiding !== false &&
									! nextFields.includes( field.id )
							)
							.map( ( field ) => field.id ),
					} );
				}
				onChangeView(
					nextFields === nextView?.fields
						? nextView
						: { ...nextView, fields: nextFields }
				);
			}
		},
		[ columnsStorageId, density, fields, onChangeView, setDensity, view?.fields ]
	);

	if ( ! title ) {
		return (
			<>
				{ notice }
				<DataViews
					{ ...props }
					view={ viewWithDensity }
					onChangeView={ handleChangeView }
				/>
			</>
		);
	}

	// The parts of the default DataViews layout, with the title first in the toolbar row.
	return (
		<DataViews
			{ ...props }
			view={ viewWithDensity }
			onChangeView={ handleChangeView }
		>
			<div className="dataviews__view-actions bbpa-dataviews-header">
				<strong className="bbpa-card__title bbpa-dataviews-header__title">
					{ title }
				</strong>
				<div className="bbpa-dataviews-header__tools">
					{ search ? <DataViews.Search label={ searchLabel } /> : null }
					<DataViews.FiltersToggle />
					<DataViews.ViewConfig />
					{ header }
				</div>
			</div>
			{ notice }
			<DataViews.FiltersToggled className="dataviews-filters__container" />
			<DataViews.Layout />
			<DataViews.Footer />
		</DataViews>
	);
};

export default ListDataViews;
