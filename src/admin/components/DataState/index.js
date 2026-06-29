import { Spinner } from '@wordpress/components';
import Notice from '../BrandNotice';
import { __ } from '@wordpress/i18n';

const DEFAULT_SKELETON_ROWS = 4;
const SKELETON_WIDTH_CLASSES = [
	'bbpa-skeleton__bar--w80',
	'bbpa-skeleton__bar--w74',
	'bbpa-skeleton__bar--w68',
	'bbpa-skeleton__bar--w62',
	'bbpa-skeleton__bar--w56',
	'bbpa-skeleton__bar--w50',
];

const DataState = ( {
	isLoading,
	error,
	isEmpty,
	emptyLabel,
	emptyAsNotice = false,
	emptyNoticeStatus = 'warning',
	loadingLabel = __( 'Loading…', 'bimbeau-privacy-analytics' ),
	skeletonRows = DEFAULT_SKELETON_ROWS,
} ) => {
	if ( isLoading ) {
		const rows = Array.from(
			{ length: skeletonRows },
			( _, index ) => index
		);
		return (
			<div className="bbpa-data-state" aria-live="polite" aria-busy="true">
				<div className="bbpa-data-state__header">
					<Spinner />
					<span>{ loadingLabel }</span>
				</div>
				<div className="bbpa-skeleton">
					{ rows.map( ( row ) => (
						<div
							key={ row }
							className={ `bbpa-skeleton__bar ${
								SKELETON_WIDTH_CLASSES[
									Math.min(
										row,
										SKELETON_WIDTH_CLASSES.length - 1
									)
								]
							}` }
						/>
					) ) }
				</div>
			</div>
		);
	}

	if ( error ) {
		const details = error?.details || null;
		const endpoint = details?.endpoint || '';
		const preview = details?.preview || '';

		return (
			<Notice status="error" isDismissible={ false }>
				<p>{ error?.message || error }</p>
				{ endpoint ? (
					<p>
						<strong>{ __( 'Endpoint:', 'bimbeau-privacy-analytics' ) }</strong>{ ' ' }
						<code>{ endpoint }</code>
					</p>
				) : null }
				{ preview ? (
					<p>
						<strong>{ __( 'Response preview:', 'bimbeau-privacy-analytics' ) }</strong>{ ' ' }
						<code>{ preview }</code>
					</p>
				) : null }
			</Notice>
		);
	}

	if ( isEmpty ) {
		const hasEmptyLabel =
			typeof emptyLabel === 'string'
				? emptyLabel.trim() !== ''
				: Boolean( emptyLabel );

		if ( ! hasEmptyLabel ) {
			return null;
		}

		if ( emptyAsNotice ) {
			return (
				<Notice status={ emptyNoticeStatus } isDismissible={ false }>
					{ emptyLabel }
				</Notice>
			);
		}

		return <p role="status">{ emptyLabel }</p>;
	}

	return null;
};

export default DataState;
