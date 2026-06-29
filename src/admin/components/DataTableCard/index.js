import { __, sprintf } from '@wordpress/i18n';

import DataState from '../DataState';
import BpaCard from '../BpaCard';

const DataTableCard = ( {
	title,
	headers,
	rows,
	isLoading,
	error,
	emptyLabel,
} ) => (
	<BpaCard title={ title }>
		<DataState
			isLoading={ isLoading }
			error={ error }
			isEmpty={ ! isLoading && ! error && rows.length === 0 }
			emptyLabel={ emptyLabel }
			/* translators: %s: card title. */
			loadingLabel={ sprintf( __( 'Loading: %s', 'bimbeau-privacy-analytics' ), title ) }
		/>
		{ ! isLoading && ! error && rows.length > 0 && (
			<div className="bbpa-table-scroll">
				<table className="widefat striped" aria-label={ title }>
					<thead>
						<tr>
							{ headers.map( ( header ) => (
								<th key={ header } scope="col">
									{ header }
								</th>
							) ) }
						</tr>
					</thead>
					<tbody>
						{ rows.map( ( row ) => (
							<tr key={ row.key }>
								<td>{ row.label }</td>
								<td>{ row.value }</td>
							</tr>
						) ) }
					</tbody>
				</table>
			</div>
		) }
	</BpaCard>
);

export default DataTableCard;
