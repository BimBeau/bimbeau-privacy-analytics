import { __ } from '@wordpress/i18n';
import WorldMap from '../components/WorldMap';

const RealtimePanel = () => (
	<section className="bbpa-realtime-panel">
		<WorldMap endpoint="/geo-countries" emptyLabel={ __( 'No country data is available yet.', 'bimbeau-privacy-analytics' ) } />
	</section>
);

export default RealtimePanel;
