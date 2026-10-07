import { __ } from '@wordpress/i18n';

import BpaCard from '../../components/BpaCard';
import VisitorsDataView from '../../components/VisitorsDataView';

/**
 * Visitors or robots list (WordPress DataViews layout), in its own card unless `withCard` is false.
 *
 * @param {Object}  props
 * @param {boolean} props.withCard Whether the list renders inside a card with `title`.
 * @param {string}  props.title    Card title.
 */
const VisitorsTableCard = ( {
	withCard = true,
	title = __( 'Visitors', 'bimbeau-privacy-analytics' ),
	...listProps
} ) => {
	const list = <VisitorsDataView showCity={ false } { ...listProps } />;

	return withCard ? (
		<BpaCard
			title={ title }
			className="bbpa-dataviews-card"
			bodyClassName="bbpa-listing-region bbpa-dataviews"
		>
			{ list }
		</BpaCard>
	) : (
		list
	);
};

export default VisitorsTableCard;
