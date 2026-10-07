import { useMemo } from '@wordpress/element';

import { getRangeFromSelection } from '../lib/date';
import ReportTableCard from '../widgets/ReportTableCard';

const ReportPanel = ( {
	title,
	endpoint,
	labelHeader,
	emptyLabel,
	labelFallback,
	formatLabel,
	renderLabel,
	metricLabel,
	metricKey,
	metricValueKey,
	supportsPageLabelToggle = false,
	rangeSelection,
	exportReportKey = '',
} ) => {
	const range = useMemo(
		() => getRangeFromSelection( rangeSelection ),
		[ rangeSelection ]
	);

	return (
		<div className="bbpa-report-panel">
			<ReportTableCard
				title={ title }
				labelHeader={ labelHeader }
				range={ range }
				endpoint={ endpoint }
				emptyLabel={ emptyLabel }
				labelFallback={ labelFallback }
				formatLabel={ formatLabel }
				renderLabel={ renderLabel }
				metricLabel={ metricLabel }
				metricKey={ metricKey }
				metricValueKey={ metricValueKey }
				supportsPageLabelToggle={ supportsPageLabelToggle }
				exportReportKey={ exportReportKey }
			/>
		</div>
	);
};

export default ReportPanel;
