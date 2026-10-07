import { createInterpolateElement } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import {
	Button,
	Dropdown,
	SearchControl,
	SelectControl,
} from '@wordpress/components';
import { chevronLeft, chevronRight, closeSmall, cog } from '@wordpress/icons';

import { formatItemCount } from '../../lib/paginationLabels';


/**
 * List frame in the look of the WordPress DataViews lists (Pages, Templates): toolbar with search, view options
 * and actions, active filter chips, borderless table, compact pagination. It only renders the chrome: the table
 * and its data stay with the caller, so the plugin needs no newer WordPress than its minimum version.
 */

/**
 * Toolbar above the list.
 *
 * @param {Object}   props
 * @param {string}   props.searchValue    Search input value.
 * @param {Function} props.onSearchChange Called with the new search value.
 * @param {string}   props.searchLabel    Accessible label of the search field.
 * @param {*}        props.viewOptions    Content of the view options popover, or null.
 * @param {*}        props.actions        Elements shown at the end of the toolbar (for example the export action).
 */
export const DataViewsToolbar = ( {
	searchValue = '',
	onSearchChange,
	searchLabel = __( 'Search', 'bimbeau-privacy-analytics' ),
	viewOptions = null,
	actions = null,
} ) => (
	<div className="bbpa-dataviews__toolbar">
		{ onSearchChange ? (
			<SearchControl
				className="bbpa-dataviews__search"
				label={ searchLabel }
				placeholder={ __( 'Search…', 'bimbeau-privacy-analytics' ) }
				value={ searchValue }
				onChange={ ( value ) => onSearchChange( value || '' ) }
				size="compact"
				__nextHasNoMarginBottom
			/>
		) : null }
		<span className="bbpa-dataviews__toolbar-spacer" />
		{ viewOptions ? (
			<Dropdown
				className="bbpa-dataviews__view-options"
				contentClassName="bbpa-dataviews__view-options-popover"
				popoverProps={ { placement: 'bottom-end' } }
				renderToggle={ ( { isOpen, onToggle } ) => (
					<Button
						size="compact"
						icon={ cog }
						label={ __( 'View options', 'bimbeau-privacy-analytics' ) }
						aria-expanded={ isOpen }
						isPressed={ isOpen }
						onClick={ onToggle }
					/>
				) }
				renderContent={ () => (
					<div className="bbpa-dataviews__view-options-content">
						{ viewOptions }
					</div>
				) }
			/>
		) : null }
		{ actions }
	</div>
);

/**
 * Active filters, each removable, and a reset link when more than one is active.
 *
 * @param {Object}   props
 * @param {Array}    props.chips   `{ key, label, onRemove }` items.
 * @param {Function} props.onReset Called to remove every filter.
 */
export const DataViewsChips = ( { chips = [], onReset } ) => {
	if ( ! chips.length ) {
		return null;
	}

	return (
		<div className="bbpa-dataviews__chips">
			{ chips.map( ( chip ) => (
				<span key={ chip.key } className="bbpa-dataviews__chip">
					<span>{ chip.label }</span>
					<Button
						className="bbpa-dataviews__chip-remove"
						size="small"
						icon={ closeSmall }
						label={ sprintf(
							/* translators: %s: label of an active list filter. */
							__( 'Remove filter: %s', 'bimbeau-privacy-analytics' ),
							chip.label
						) }
						onClick={ chip.onRemove }
					/>
				</span>
			) ) }
			{ chips.length > 1 && onReset ? (
				<Button variant="tertiary" size="compact" onClick={ onReset }>
					{ __( 'Reset', 'bimbeau-privacy-analytics' ) }
				</Button>
			) : null }
		</div>
	);
};

/**
 * Pagination under the list: item count on the left, page selector and arrows on the right.
 *
 * @param {Object}   props
 * @param {number}   props.page         Current page.
 * @param {number}   props.totalPages   Number of pages.
 * @param {number}   props.totalItems   Number of rows.
 * @param {Function} props.onPageChange Called with the new page.
 * @param {string}   props.meta         Extra text after the item count.
 */
export const DataViewsPagination = ( {
	page,
	totalPages,
	totalItems,
	onPageChange,
	meta = '',
} ) => {
	const pages = Math.max( 1, Number( totalPages ) || 1 );
	const current = Math.min( Math.max( 1, Number( page ) || 1 ), pages );
	const pageOptions = Array.from( { length: pages }, ( _value, index ) => ( {
		label: String( index + 1 ),
		value: String( index + 1 ),
	} ) );

	return (
		<div className="bbpa-dataviews__pagination">
			<span className="bbpa-dataviews__pagination-count">
				{ formatItemCount( totalItems ) }
				{ meta ? ` · ${ meta }` : '' }
			</span>
			<span className="bbpa-dataviews__pagination-pages">
				{ createInterpolateElement(
					sprintf(
						/* translators: %s: number of pages. "<CurrentPage />" is the page selector. */
						__( 'Page <CurrentPage /> of %s', 'bimbeau-privacy-analytics' ),
						pages
					),
					{
						CurrentPage: (
							<SelectControl
								className="bbpa-dataviews__page-select"
								label={ __( 'Current page', 'bimbeau-privacy-analytics' ) }
								hideLabelFromVision
								value={ String( current ) }
								options={ pageOptions }
								onChange={ ( value ) => onPageChange( Number( value ) || 1 ) }
								size="compact"
								__nextHasNoMarginBottom
							/>
						),
					}
				) }
				<Button
					size="compact"
					icon={ chevronLeft }
					label={ __( 'Previous page', 'bimbeau-privacy-analytics' ) }
					disabled={ current <= 1 }
					onClick={ () => onPageChange( current - 1 ) }
				/>
				<Button
					size="compact"
					icon={ chevronRight }
					label={ __( 'Next page', 'bimbeau-privacy-analytics' ) }
					disabled={ current >= pages }
					onClick={ () => onPageChange( current + 1 ) }
				/>
			</span>
		</div>
	);
};
