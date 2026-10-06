import { TabPanel } from '@wordpress/components';
import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import BpaCard from '../components/BpaCard';
import Notice from '../components/BrandNotice';
import { ADMIN_CONFIG } from '../constants';
import useVisitorsHidePrivatePreference from '../hooks/useVisitorsHidePrivatePreference';
import { isAdvancedStatsEnabled } from '../lib/adminConstants';
import { getRangeFromSelection } from '../lib/date';
import VisitorsTableCard from '../widgets/VisitorsTableCard';

const HUMANS_TAB = 'humans';
const ROBOTS_TAB = 'robots';
const SUPPORTED_TABS = [ HUMANS_TAB, ROBOTS_TAB ];

/**
 * Initial tab, from the `bbpa_tab` deep link (for example `&bbpa_tab=robots`).
 */
const getInitialTabName = () => {
	if ( typeof window === 'undefined' || ! window.location ) {
		return HUMANS_TAB;
	}

	const params = new URLSearchParams( window.location.search );
	const requestedTab = params.get( 'bbpa_tab' );

	return SUPPORTED_TABS.includes( requestedTab ) ? requestedTab : HUMANS_TAB;
};

const visitorsTabs = [
	{ name: HUMANS_TAB, title: __( 'Humans', 'bimbeau-privacy-analytics' ) },
	{ name: ROBOTS_TAB, title: __( 'Robots', 'bimbeau-privacy-analytics' ) },
];

const HUMAN_REQUEST_PARAMS = { visitor_type: 'human' };
const BOT_REQUEST_PARAMS = { visitor_type: 'bot' };

const HumanVisitorsTab = ( { range } ) => {
	const [ hidePrivateVisitors, setHidePrivateVisitors ] =
		useVisitorsHidePrivatePreference();
	// Without advanced stats every row is private: the toggle would empty the list, so it is not offered.
	const canHidePrivateVisitors = isAdvancedStatsEnabled(
		ADMIN_CONFIG?.settings
	);

	return (
		<VisitorsTableCard
			range={ range }
			requestParams={ HUMAN_REQUEST_PARAMS }
			title={ __( 'Humans', 'bimbeau-privacy-analytics' ) }
			emptyLabel={ __( 'No visitor data available.', 'bimbeau-privacy-analytics' ) }
			loadingLabel={ __( 'Loading visitors…', 'bimbeau-privacy-analytics' ) }
			hidePrivateVisitors={ canHidePrivateVisitors && hidePrivateVisitors }
			onHidePrivateVisitorsChange={
				canHidePrivateVisitors ? setHidePrivateVisitors : undefined
			}
		/>
	);
};

const RobotsTab = ( { range } ) => (
	<div className="bbpa-visitors-tab-content">
		<Notice status="info" isDismissible={ false }>
			<p>
				{ __(
					'Robots are excluded from all statistics. This list only lets you check what was filtered.',
					'bimbeau-privacy-analytics'
				) }
			</p>
		</Notice>
		<VisitorsTableCard
			range={ range }
			requestParams={ BOT_REQUEST_PARAMS }
			title={ __( 'Robots', 'bimbeau-privacy-analytics' ) }
			emptyLabel={ __( 'No robot detected for this period.', 'bimbeau-privacy-analytics' ) }
			loadingLabel={ __( 'Loading robots…', 'bimbeau-privacy-analytics' ) }
		/>
	</div>
);

const VisitorsPanel = ( { rangeSelection } ) => {
	const range = useMemo(
		() => getRangeFromSelection( rangeSelection ),
		[ rangeSelection ]
	);

	return (
		<div className="bbpa-report-panel">
			<BpaCard
				className="bbpa-visitors-listings-card"
				title={ __( 'Visitors', 'bimbeau-privacy-analytics' ) }
			>
				<TabPanel
					className="bbpa-visitors-tabs"
					initialTabName={ getInitialTabName() }
					tabs={ visitorsTabs }
				>
					{ ( tab ) =>
						tab?.name === ROBOTS_TAB ? (
							<RobotsTab range={ range } />
						) : (
							<HumanVisitorsTab range={ range } />
						)
					}
				</TabPanel>
			</BpaCard>
		</div>
	);
};

export default VisitorsPanel;
