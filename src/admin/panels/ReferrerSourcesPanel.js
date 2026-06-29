import { useMemo } from '@wordpress/element';

import { getRangeFromSelection } from '../lib/date';
import ReferrerSourcesTableCard from '../widgets/ReferrerSourcesTableCard';

const ReferrerSourcesPanel = ( { rangeSelection } ) => {
	const range = useMemo(
		() => getRangeFromSelection( rangeSelection ),
		[ rangeSelection ]
	);

	return (
		<div className="bbpa-report-panel">
			<ReferrerSourcesTableCard range={ range } />
		</div>
	);
};

export default ReferrerSourcesPanel;
