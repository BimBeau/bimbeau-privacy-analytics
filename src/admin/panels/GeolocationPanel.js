import { useMemo } from '@wordpress/element';

import { getRangeFromSelection } from '../lib/date';
import GeoCountriesPanel from './GeoCountriesPanel';

const GeolocationPanel = ( { rangeSelection } ) => {
	const range = useMemo(
		() => getRangeFromSelection( rangeSelection ),
		[ rangeSelection ]
	);

	return (
		<div className="bbpa-report-panel">
			<GeoCountriesPanel range={ range } />
		</div>
	);
};

export default GeolocationPanel;
