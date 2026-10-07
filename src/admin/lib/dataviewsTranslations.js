import { __, _n, _x, getLocaleData, setLocaleData } from '@wordpress/i18n';

const TEXT_DOMAIN = 'bimbeau-privacy-analytics';
const CONTEXT_SEPARATOR = '\u0004';

/**
 * Strings of @wordpress/dataviews used by the plugin lists (table layout, filters with the "is"
 * operator, view options, search and pagination). DataViews translates them in the WordPress
 * `default` domain, which older WordPress versions do not translate; the plugin ships them in its
 * own domain and fills the gaps of the `default` domain.
 *
 * Each entry is `[ msgid, context ]`; plural entries are listed in DATAVIEWS_PLURAL_MSGIDS.
 */
export const DATAVIEWS_MSGIDS = [
	[ 'Add filter' ],
	[ 'Actions' ],
	[ 'Appearance' ],
	[ 'Cancel' ],
	[ 'Conditions' ],
	[ 'Current page' ],
	[ 'Density' ],
	[ 'Comfortable', 'Density option for DataView layout' ],
	[ 'Balanced', 'Density option for DataView layout' ],
	[ 'Compact', 'Density option for DataView layout' ],
	[ 'Deselect all' ],
	[ 'Filter', 'verb' ],
	[ 'Filter by: %1$s' ],
	[ 'Hide column' ],
	[ 'Insert left' ],
	[ 'Insert right' ],
	[ 'Is' ],
	[ 'Is not' ],
	[ 'Items per page' ],
	[ 'Layout' ],
	[ 'List of: %1$s' ],
	[ 'Move left' ],
	[ 'Move right' ],
	[ 'Next page' ],
	[ 'No elements found' ],
	[ 'No results' ],
	[ 'No results found' ],
	[ 'Order' ],
	[ 'Page %1$d of %2$d' ],
	[ '<div>Page</div>%1$s<div>of %2$d</div>', 'paging' ],
	[ 'Previous page' ],
	[ 'Properties' ],
	[ 'Remove' ],
	[ 'Reset' ],
	[ 'Reset view' ],
	[ 'Search' ],
	[ 'Search items' ],
	[ 'Select all' ],
	[ 'Sort ascending' ],
	[ 'Sort by' ],
	[ 'Sort descending' ],
	[ 'View options', 'View is used as a noun' ],
	[ '(no title)' ],
	[ '<Name>%1$s is: </Name><Value>%2$s</Value>' ],
	[ '<Name>%1$s is not: </Name><Value>%2$s</Value>' ],
];

/**
 * DataViews strings the plugin always replaces, whatever WordPress translates: the view options
 * section that shows or hides the columns of a table is called "Columns" instead of "Properties".
 */
const getDataViewsOverrides = () => ( {
	Properties: [ __( 'Columns', 'bimbeau-privacy-analytics' ) ],
} );

export const DATAVIEWS_PLURAL_MSGIDS = [
	'%d Item',
	'%1$d of %2$d Item',
	'%d Item selected',
];

/**
 * Literal calls read by the translation extraction (POT); never called at runtime.
 */
/* eslint-disable no-unused-vars */
const declareDataViewsStrings = () => [
	__( 'Add filter', 'bimbeau-privacy-analytics' ),
	__( 'Actions', 'bimbeau-privacy-analytics' ),
	__( 'Appearance', 'bimbeau-privacy-analytics' ),
	__( 'Cancel', 'bimbeau-privacy-analytics' ),
	__( 'Conditions', 'bimbeau-privacy-analytics' ),
	__( 'Current page', 'bimbeau-privacy-analytics' ),
	__( 'Density', 'bimbeau-privacy-analytics' ),
	_x( 'Comfortable', 'Density option for DataView layout', 'bimbeau-privacy-analytics' ),
	_x( 'Balanced', 'Density option for DataView layout', 'bimbeau-privacy-analytics' ),
	_x( 'Compact', 'Density option for DataView layout', 'bimbeau-privacy-analytics' ),
	__( 'Deselect all', 'bimbeau-privacy-analytics' ),
	_x( 'Filter', 'verb', 'bimbeau-privacy-analytics' ),
	/* translators: %1$s: field label of a list filter. */
	__( 'Filter by: %1$s', 'bimbeau-privacy-analytics' ),
	__( 'Hide column', 'bimbeau-privacy-analytics' ),
	__( 'Insert left', 'bimbeau-privacy-analytics' ),
	__( 'Insert right', 'bimbeau-privacy-analytics' ),
	__( 'Is', 'bimbeau-privacy-analytics' ),
	__( 'Is not', 'bimbeau-privacy-analytics' ),
	__( 'Items per page', 'bimbeau-privacy-analytics' ),
	__( 'Layout', 'bimbeau-privacy-analytics' ),
	/* translators: %1$s: field label of a list filter. */
	__( 'List of: %1$s', 'bimbeau-privacy-analytics' ),
	__( 'Move left', 'bimbeau-privacy-analytics' ),
	__( 'Move right', 'bimbeau-privacy-analytics' ),
	__( 'Next page', 'bimbeau-privacy-analytics' ),
	__( 'No elements found', 'bimbeau-privacy-analytics' ),
	__( 'No results', 'bimbeau-privacy-analytics' ),
	__( 'No results found', 'bimbeau-privacy-analytics' ),
	__( 'Order', 'bimbeau-privacy-analytics' ),
	/* translators: 1: current page number, 2: total number of pages. */
	__( 'Page %1$d of %2$d', 'bimbeau-privacy-analytics' ),
	/* translators: 1: page selector, 2: total number of pages. Keep the <div> tags. */
	_x( '<div>Page</div>%1$s<div>of %2$d</div>', 'paging', 'bimbeau-privacy-analytics' ),
	__( 'Previous page', 'bimbeau-privacy-analytics' ),
	__( 'Properties', 'bimbeau-privacy-analytics' ),
	__( 'Remove', 'bimbeau-privacy-analytics' ),
	__( 'Reset', 'bimbeau-privacy-analytics' ),
	__( 'Reset view', 'bimbeau-privacy-analytics' ),
	__( 'Search', 'bimbeau-privacy-analytics' ),
	__( 'Search items', 'bimbeau-privacy-analytics' ),
	__( 'Select all', 'bimbeau-privacy-analytics' ),
	__( 'Sort ascending', 'bimbeau-privacy-analytics' ),
	__( 'Sort by', 'bimbeau-privacy-analytics' ),
	__( 'Sort descending', 'bimbeau-privacy-analytics' ),
	_x( 'View options', 'View is used as a noun', 'bimbeau-privacy-analytics' ),
	__( '(no title)', 'bimbeau-privacy-analytics' ),
	/* translators: 1: filter field label, 2: filter value. Keep the <Name> and <Value> tags. */
	__( '<Name>%1$s is: </Name><Value>%2$s</Value>', 'bimbeau-privacy-analytics' ),
	/* translators: 1: filter field label, 2: filter value. Keep the <Name> and <Value> tags. */
	__( '<Name>%1$s is not: </Name><Value>%2$s</Value>', 'bimbeau-privacy-analytics' ),
	/* translators: %d: number of list items. */
	_n( '%d Item', '%d Items', 1, 'bimbeau-privacy-analytics' ),
	/* translators: 1: items shown, 2: total number of list items. */
	_n( '%1$d of %2$d Item', '%1$d of %2$d Items', 1, 'bimbeau-privacy-analytics' ),
	/* translators: %d: number of selected list items. */
	_n( '%d Item selected', '%d Items selected', 1, 'bimbeau-privacy-analytics' ),
];
/* eslint-enable no-unused-vars */

const getLocaleEntryKey = ( msgid, context ) =>
	context ? `${ context }${ CONTEXT_SEPARATOR }${ msgid }` : msgid;

const hasTranslation = ( entry ) =>
	Array.isArray( entry ) && entry.some( ( form ) => form !== '' );

let isRegistered = false;

/**
 * Copies the plugin translations of the DataViews strings into the `default` domain, only where
 * WordPress does not translate them already, then applies the plugin overrides. Runs once.
 */
export const registerDataViewsTranslations = () => {
	if ( isRegistered ) {
		return;
	}
	isRegistered = true;

	const pluginData = getLocaleData( TEXT_DOMAIN ) || {};
	const defaultData = getLocaleData( 'default' ) || {};
	const missing = {};
	const keys = [
		...DATAVIEWS_MSGIDS.map( ( [ msgid, context ] ) =>
			getLocaleEntryKey( msgid, context )
		),
		...DATAVIEWS_PLURAL_MSGIDS,
	];

	keys.forEach( ( key ) => {
		if ( hasTranslation( pluginData[ key ] ) && ! hasTranslation( defaultData[ key ] ) ) {
			missing[ key ] = pluginData[ key ];
		}
	} );

	Object.assign( missing, getDataViewsOverrides() );

	if ( Object.keys( missing ).length ) {
		// setLocaleData merges into the existing domain data.
		setLocaleData( missing, 'default' );
	}
};

/** Test helper: lets the next call register again. */
export const resetDataViewsTranslationsForTests = () => {
	isRegistered = false;
};
