import { __ } from '@wordpress/i18n';

import { ADMIN_CONFIG } from '../constants';
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

/**
 * Channel filter of a report list (ReportDataView `filterFields`), sent as `source_category`.
 *
 * @return {Object} Filter field.
 */
export const getChannelFilterField = () => ( {
	id: 'channel',
	label: __( 'Channel', 'bimbeau-privacy-analytics' ),
	elements: CHANNEL_FILTER_ELEMENTS,
	param: 'source_category',
} );

/**
 * Values of the Content type filter: the post types of the site that have public pages.
 *
 * @param {Object[]} postTypes `{ key, label, viewable }` post types of the admin settings.
 * @return {Object[]} `{ value, label }` DataViews filter elements, by label.
 */
export const getContentTypeFilterElements = (
	postTypes = ADMIN_CONFIG?.settings?.postTypes
) =>
	( Array.isArray( postTypes ) ? postTypes : [] )
		.filter( ( postType ) => postType?.key && postType.viewable === true )
		.map( ( postType ) => ( {
			value: String( postType.key ),
			label: String( postType.label || postType.key ),
		} ) )
		.sort( ( left, right ) => left.label.localeCompare( right.label ) );

/**
 * Content type filter of a page report list (ReportDataView `filterFields`), sent as `post_type`.
 * Null when the site has no post type with public pages.
 *
 * @return {Object|null} Filter field.
 */
export const getContentTypeFilterField = () => {
	const elements = getContentTypeFilterElements();

	return elements.length
		? {
				id: 'content_type',
				label: __( 'Content type', 'bimbeau-privacy-analytics' ),
				elements,
				param: 'post_type',
		  }
		: null;
};

/**
 * Filters of a page report list, applied by the server: the channel of the page views (top pages
 * only, `withChannel`) and the content type of the page.
 *
 * @param {Object}  options
 * @param {boolean} options.withChannel Whether the list offers the Channel filter.
 * @return {Object[]} ReportDataView `filterFields`.
 */
export const getPageListFilterFields = ( { withChannel = false } = {} ) =>
	[ withChannel ? getChannelFilterField() : null, getContentTypeFilterField() ].filter(
		Boolean
	);
