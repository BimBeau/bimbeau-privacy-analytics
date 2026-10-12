import { useCallback, useMemo, useState } from '@wordpress/element';
import { DataViews } from '@wordpress/dataviews';

import useSharedListDensity from '../../hooks/useSharedListDensity';
import {
	getStoredListColumns,
	getStoredListView,
	storeListColumns,
	storeListView,
} from '../../lib/storage';

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
 * Initial view of a list: the default view with the sort and the number of items per page saved
 * for the list by the current user, when they are still offered.
 *
 * @param {string}   listId                List identifier used by the `columnsStorageId` prop.
 * @param {Object}   defaultView           Default DataViews view.
 * @param {Object}   options
 * @param {number[]} options.perPageSizes  Items per page offered by the list.
 * @param {Object[]} options.fields        Field definitions; a saved sort on a field that is
 *                                         missing or not sortable is ignored (optional).
 * @return {Object} DataViews view.
 */
export const getInitialListView = ( listId, defaultView, { perPageSizes, fields } = {} ) => {
	const stored = getStoredListView( listId );
	if ( ! stored ) {
		return defaultView;
	}
	const view = { ...defaultView };
	if ( stored.perPage && ( perPageSizes || [] ).includes( stored.perPage ) ) {
		view.perPage = stored.perPage;
	}
	if (
		stored.sort &&
		( ! Array.isArray( fields ) ||
			fields.some(
				( field ) => field.id === stored.sort.field && field.enableSorting !== false
			) )
	) {
		view.sort = stored.sort;
	}

	return view;
};

/**
 * Whether DataViews offers a filter for at least one field: a field filtered by value lists its
 * values in `elements` (or `getElements`) and does not opt out with `filterBy: false`.
 *
 * @param {Object[]} fields DataViews field definitions.
 * @return {boolean} Whether the list has a filter.
 */
export const hasFilterableField = ( fields ) =>
	( fields || [] ).some(
		( field ) =>
			field.filterBy !== false &&
			( ( Array.isArray( field.elements ) && field.elements.length > 0 ) ||
				typeof field.getElements === 'function' )
	);

const isSameSort = ( first, second ) =>
	( first?.field || '' ) === ( second?.field || '' ) &&
	( first?.direction || '' ) === ( second?.direction || '' );

/**
 * WordPress DataViews with a row density saved per user (compact by default), and columns shown
 * again at their default place. With `columnsStorageId`, the appearance chosen by the user is saved
 * per list and per user: column order and visibility (View options, Move left / right, Hide column),
 * read back with `getInitialListColumns()`; sort and items per page, read back with
 * `getInitialListView()`; density, applied here (the shared density until the list has its own).
 * Lists without `columnsStorageId` share one density. Same props as DataViews.
 *
 * Every list has the same toolbar: the search (unless `search` is false), the filter button
 * (only when a field can be filtered), the view options and the `header` controls. With
 * `title`, the list heads its card: the title starts that row, so the card needs no header of its
 * own. `notice` (an error) is shown under that row.
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
	const [ sharedDensity, setSharedDensity ] = useSharedListDensity();
	const [ listDensity, setListDensity ] = useState(
		() => ( columnsStorageId && getStoredListView( columnsStorageId )?.density ) || null
	);
	const density = listDensity || sharedDensity;

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
			const densityChanged = Boolean( nextDensity ) && nextDensity !== density;
			if ( columnsStorageId ) {
				const changes = {
					...( densityChanged ? { density: nextDensity } : {} ),
					...( nextView?.perPage && nextView.perPage !== view?.perPage
						? { perPage: nextView.perPage }
						: {} ),
					...( nextView?.sort?.field && ! isSameSort( nextView.sort, view?.sort )
						? { sort: nextView.sort }
						: {} ),
				};
				if ( Object.keys( changes ).length ) {
					storeListView( columnsStorageId, changes );
				}
				if ( densityChanged ) {
					setListDensity( nextDensity );
				}
			} else if ( densityChanged ) {
				setSharedDensity( nextDensity );
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
		[
			columnsStorageId,
			density,
			fields,
			onChangeView,
			setSharedDensity,
			view?.fields,
			view?.perPage,
			view?.sort,
		]
	);

	// The parts of the default DataViews layout in the same toolbar for every list: the title (when
	// the list heads its card), then the search, the filters, the view options and `header`.
	return (
		<DataViews
			{ ...props }
			view={ viewWithDensity }
			onChangeView={ handleChangeView }
		>
			<div
				className={ `dataviews__view-actions bbpa-dataviews-header${
					title ? '' : ' bbpa-dataviews-header--untitled'
				}` }
			>
				{ title ? (
					<strong className="bbpa-card__title bbpa-dataviews-header__title">
						{ title }
					</strong>
				) : null }
				<div className="bbpa-dataviews-header__tools">
					{ search ? <DataViews.Search label={ searchLabel } /> : null }
					{ hasFilterableField( fields ) ? <DataViews.FiltersToggle /> : null }
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
