import { useMemo } from '@wordpress/element';

import { getRangeFromSelection } from '../lib/date';
import AudienceBreakdownCards from '../widgets/AudienceBreakdownCards';

const DevicesPanel = ( { rangeSelection } ) => {
	const range = useMemo(
		() => getRangeFromSelection( rangeSelection ),
		[ rangeSelection ]
	);

	return (
		<div className="bbpa-report-panel">
			<AudienceBreakdownCards range={ range } includeResolutions />
		</div>
	);
};

export default DevicesPanel;
