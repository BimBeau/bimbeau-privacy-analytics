import { __ } from '@wordpress/i18n';

// Continent of each ISO 3166-1 alpha-2 country code: AF Africa, AN Antarctica, AS Asia, EU Europe,
// NA North America (with Central America and the Caribbean), OC Oceania, SA South America.
// Countries spanning two continents are listed under the usual one (Russia: Europe, Turkey: Asia).
const CONTINENT_COUNTRIES = {
	AF: 'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW',
	AN: 'AQ BV GS HM TF',
	AS: 'AE AF AM AZ BD BH BN BT CC CN CX CY GE HK ID IL IN IO IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE',
	EU: 'AD AL AT AX BA BE BG BY CH CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK',
	NA: 'AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI',
	OC: 'AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV UM VU WF WS',
	SA: 'AR BO BR CL CO EC FK GF GY PE PY SR UY VE',
};

const CONTINENT_BY_COUNTRY = Object.entries( CONTINENT_COUNTRIES ).reduce(
	( byCountry, [ continent, countries ] ) => {
		countries.split( ' ' ).forEach( ( country ) => {
			byCountry[ country ] = continent;
		} );

		return byCountry;
	},
	{}
);

/**
 * Continent code of a country.
 *
 * @param {string} countryCode Two-letter country code, any case.
 * @return {string} Continent code (AF, AN, AS, EU, NA, OC, SA), or '' for an unknown code.
 */
export const getCountryContinent = ( countryCode ) =>
	CONTINENT_BY_COUNTRY[ String( countryCode || '' ).toUpperCase() ] || '';

/**
 * Values of the Continent filter of the country lists, in alphabetical order of their label.
 *
 * @return {Object[]} `{ value, label }` DataViews filter elements.
 */
export const getContinentFilterElements = () =>
	[
		{ value: 'AF', label: __( 'Africa', 'bimbeau-privacy-analytics' ) },
		{ value: 'NA', label: __( 'North America', 'bimbeau-privacy-analytics' ) },
		{ value: 'SA', label: __( 'South America', 'bimbeau-privacy-analytics' ) },
		{ value: 'AN', label: __( 'Antarctica', 'bimbeau-privacy-analytics' ) },
		{ value: 'AS', label: __( 'Asia', 'bimbeau-privacy-analytics' ) },
		{ value: 'EU', label: __( 'Europe', 'bimbeau-privacy-analytics' ) },
		{ value: 'OC', label: __( 'Oceania', 'bimbeau-privacy-analytics' ) },
	].sort( ( left, right ) => left.label.localeCompare( right.label ) );

/**
 * Continent filter of a country report list (ReportDataView `filterFields`, applied in the browser).
 *
 * @param {string} countryKey Item key holding the country code.
 * @return {Object} Filter field.
 */
export const getContinentFilterField = ( countryKey = 'country_code' ) => ( {
	id: 'continent',
	label: __( 'Continent', 'bimbeau-privacy-analytics' ),
	elements: getContinentFilterElements(),
	matches: ( item, continent ) =>
		getCountryContinent( item?.[ countryKey ] || item?.label ) === continent,
} );
