import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { getRangeFromSelection } from '../lib/date';
import VisitorsTableCard from '../widgets/VisitorsTableCard';

const VisitorsPanel = ( { rangeSelection } ) => {
	const range = useMemo(
		() => getRangeFromSelection( rangeSelection ),
		[ rangeSelection ]
	);

	return (
		<div className="bbpa-report-panel">
			<VisitorsTableCard
				range={ range }
				requestParams={ { visitor_type: 'human' } }
				title={ __( 'Visitors', 'bimbeau-privacy-analytics' ) }
				emptyLabel={ __( 'No visitor data available.', 'bimbeau-privacy-analytics' ) }
				loadingLabel={ __( 'Loading visitors…', 'bimbeau-privacy-analytics' ) }
			/>
		</div>
	);
};

export default VisitorsPanel;
