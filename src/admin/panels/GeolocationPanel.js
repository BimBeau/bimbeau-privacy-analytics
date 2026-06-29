import { TabPanel } from '@wordpress/components';
import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import BpaCard from '../components/BpaCard';
import { ADMIN_CONFIG } from '../constants';
import { getRangeFromSelection } from '../lib/date';

import GeoCountriesPanel from './GeoCountriesPanel';

const GeolocationPanel = ( { rangeSelection } ) => {
	const range = useMemo(
		() => getRangeFromSelection( rangeSelection ),
		[ rangeSelection ]
	);
	
	const geolocationTabs = [
		{
			name: 'countries',
			title: __( 'Countries', 'bimbeau-privacy-analytics' ),
		},
		
	];

	

	return (
		<div className="bbpa-report-panel">
			<BpaCard
				className="bbpa-geolocation-listings-card"
				title={ __( 'Geolocation', 'bimbeau-privacy-analytics' ) }
			>
				<TabPanel
					className="bbpa-geolocation-tabs"
					activeClass="is-active"
					tabs={ geolocationTabs }
				>
					{ ( tab ) =>
						
						(
							<GeoCountriesPanel range={ range } />
						)
					}
				</TabPanel>
			</BpaCard>
		</div>
	);
};

export default GeolocationPanel;
