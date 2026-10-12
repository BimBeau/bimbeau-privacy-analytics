import { CHANNEL_LABELS } from './channelLabels';

/**
 * Values of the Channel filter of the lists (channel keys accepted by `source_category`).
 */
export const CHANNEL_FILTER_ELEMENTS = Object.entries( CHANNEL_LABELS ).map(
	( [ value, label ] ) => ( { value, label } )
);

/**
 * Value of a list filter, from the `filters` of a DataViews view.
 *
 * @param {Object} view    DataViews view.
 * @param {string} fieldId Filtered field id.
 * @return {string} First selected value, or '' without filter on the field.
 */
export const getViewFilterValue = ( view, fieldId ) => {
	const filter = ( view?.filters || [] ).find(
		( candidate ) => candidate?.field === fieldId
	);
	const value = Array.isArray( filter?.value ) ? filter.value[ 0 ] : filter?.value;

	return value === undefined || value === null ? '' : String( value );
};
