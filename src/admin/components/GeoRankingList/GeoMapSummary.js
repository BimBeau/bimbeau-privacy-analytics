import { _n } from '@wordpress/i18n';

import { formatNumber } from '../../lib/formatters';

/**
 * Visitors of the period in the top-left corner of the Geolocation map, with the number of
 * places, the same way the real-time map shows its active visitors.
 *
 * @param {Object} props
 * @param {number} props.visitors   Visitors of the period.
 * @param {string} props.placeLabel Number of places, already formatted ("13 countries").
 */
const GeoMapSummary = ( { visitors = 0, placeLabel = '' } ) => (
	<p className="bbpa-geo-map-summary">
		<span className="bbpa-geo-map-summary__value">{ formatNumber( visitors ) }</span>
		<span className="bbpa-geo-map-summary__label">
			{ _n( 'Visitor', 'Visitors', visitors, 'bimbeau-privacy-analytics' ) }
			{ placeLabel ? ` · ${ placeLabel }` : '' }
		</span>
	</p>
);

export default GeoMapSummary;
