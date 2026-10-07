import { __ } from '@wordpress/i18n';

import ReportPanel from './ReportPanel';

const SearchTermsPanel = ( { rangeSelection } ) => (
	<ReportPanel
		title={ __( 'Search terms', 'bimbeau-privacy-analytics' ) }
		labelHeader={ __( 'Search term', 'bimbeau-privacy-analytics' ) }
		endpoint="/search-terms"
		emptyLabel={ __( 'No search terms available.', 'bimbeau-privacy-analytics' ) }
		labelFallback={ __( 'Unknown', 'bimbeau-privacy-analytics' ) }
		rangeSelection={ rangeSelection }
		exportReportKey="search-terms"
	/>
);

export default SearchTermsPanel;
