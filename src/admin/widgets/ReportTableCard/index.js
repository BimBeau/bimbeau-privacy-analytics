import BpaCard from '../../components/BpaCard';
import ReportDataView, {
	truncateDisplayedLabel,
} from '../../components/ReportDataView';

export { truncateDisplayedLabel };

/**
 * Report list card, rendered by the WordPress DataViews component (ReportDataView).
 * `withCard={ false }` drops the card for lists already framed by a parent card (tabs).
 *
 * @param {Object}  props          ReportDataView props.
 * @param {boolean} props.withCard Whether to wrap the list in a card.
 * @param {string}  props.title    Card title.
 */
const ReportTableCard = ( { withCard = true, ...props } ) =>
	withCard ? (
		// The title heads the list toolbar, with the search and the list controls.
		<BpaCard
			className="bbpa-dataviews-card"
			bodyClassName="bbpa-listing-region bbpa-dataviews"
		>
			<ReportDataView { ...props } cardTitle={ props.title } />
		</BpaCard>
	) : (
		<ReportDataView { ...props } />
	);

export default ReportTableCard;
