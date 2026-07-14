import { useState } from '@wordpress/element';
import { Button, Dropdown, Tooltip } from '@wordpress/components';
import Notice from '../../../components/BrandNotice';
import { __, _n, sprintf } from '@wordpress/i18n';

import { buildRestUrl, parseEndpointError } from '../../../api/useAdminEndpoint';
import { ADMIN_CONFIG } from '../../../constants';
import FeatureIcon from '../../../components/icons/FeatureIcon';

const DEFAULT_EXPORT_LIMIT = 10000;
const getExportLimit = () => {
	const configuredLimit = Number( ADMIN_CONFIG?.settings?.exportMaxRows );

	return Number.isFinite( configuredLimit ) && configuredLimit > 0
		? Math.floor( configuredLimit )
		: DEFAULT_EXPORT_LIMIT;
};
const EXPORT_POLL_INTERVAL_MS = 2000;
const EXPORT_MAX_POLL_ATTEMPTS = 30;
const XLSX_UNAVAILABLE_MESSAGE = __(
	'Excel export requires the PHP Zip extension to be installed on this server.',
	'bimbeau-privacy-analytics'
);

const getExportRows = ( totalItems, exportLimit ) =>
	Math.min( Math.max( Number( totalItems ) || 0, 0 ), exportLimit );

const getPluralTranslation = ( single, plural, count, domain ) => {
	if ( typeof _n === 'function' ) {
		return _n( single, plural, count, domain );
	}

	return count === 1 ? single : plural;
};

const getExportSummary = ( totalItems, exportRows ) => {
	if ( exportRows === 0 ) {
		return __( 'No results match the current filters.', 'bimbeau-privacy-analytics' );
	}

	const normalizedTotal = Math.max( Number( totalItems ) || 0, 0 );

	if ( normalizedTotal > exportRows ) {
		return sprintf(
			/* translators: %d: maximum number of rows included in the export file. */
			getPluralTranslation(
				'Only the first %d row will be exported.',
				'Only the first %d rows will be exported.',
				exportRows,
				'bimbeau-privacy-analytics'
			),
			exportRows
		);
	}

	return sprintf(
		/* translators: %d: number of rows included in the export file. */
		getPluralTranslation(
			'%d row will be exported.',
			'%d rows will be exported.',
			exportRows,
			'bimbeau-privacy-analytics'
		),
		exportRows
	);
};

const getFilenameFromDisposition = ( disposition, fallback ) => {
	if ( typeof disposition !== 'string' || disposition === '' ) {
		return fallback;
	}

	const match = disposition.match( /filename="?([^";]+)"?/i );
	return match?.[ 1 ] || fallback;
};

const downloadBlob = ( blob, filename ) => {
	const url = window.URL.createObjectURL( blob );
	const link = document.createElement( 'a' );
	link.href = url;
	link.download = filename;
	document.body.appendChild( link );
	link.click();
	link.remove();
	window.URL.revokeObjectURL( url );
};

const delay = ( timeout ) =>
	new Promise( ( resolve ) => {
		window.setTimeout( resolve, timeout );
	} );

const getExportErrorMessage = ( error ) => {
	const code = error?.code || '';
	const status = Number( error?.status || 0 );

	if ( code === 'bbpa_export_limit_exceeded' || status === 413 ) {
		return sprintf(
			/* translators: %d: maximum export row count. */
			__(
				'The export exceeds the %d row limit. Narrow the date range or search filter, then try again.',
				'bimbeau-privacy-analytics'
			),
			getExportLimit()
		);
	}

	if (
		status === 401 ||
		status === 403 ||
		code === 'bbpa_export_pro_required'
	) {
		return __(
			'Export access is refused for the current account or license.',
			'bimbeau-privacy-analytics'
		);
	}

	return (
		error?.message ||
		__( 'The export file could not be generated.', 'bimbeau-privacy-analytics' )
	);
};

const fetchExportUrl = async ( url ) => {
	const response = await fetch( url, {
		cache: 'no-store',
		headers: {
			'X-WP-Nonce': ADMIN_CONFIG?.restNonce || '',
		},
	} );

	if ( ! response.ok ) {
		throw await parseEndpointError( response );
	}

	return response;
};

const downloadExportResponse = async ( response, report, format ) => {
	const blob = await response.blob();
	const fallback = `bbpa-${ report }.${ format }`;
	downloadBlob(
		blob,
		getFilenameFromDisposition(
			response.headers?.get?.( 'content-disposition' ),
			fallback
		)
	);
};

const getQueuedExportMessage = ( status ) => {
	if ( status === 'running' ) {
		return __(
			'Export is running. The file downloads when ready.',
			'bimbeau-privacy-analytics'
		);
	}

	return __(
		'Export is queued. The file downloads when ready.',
		'bimbeau-privacy-analytics'
	);
};

const pollExportJob = async ( initialJob, report, format, setNotice ) => {
	let job = initialJob;

	for ( let attempt = 0; attempt < EXPORT_MAX_POLL_ATTEMPTS; attempt += 1 ) {
		const status = job?.status || 'queued';
		setNotice( {
			status: 'info',
			message: getQueuedExportMessage( status ),
		} );

		if ( status === 'completed' ) {
			if ( ! job?.downloadUrl ) {
				throw new Error(
					__(
						'The completed export is missing a download URL.',
						'bimbeau-privacy-analytics'
					)
				);
			}

			const downloadResponse = await fetchExportUrl( job.downloadUrl );
			await downloadExportResponse( downloadResponse, report, format );
			return;
		}

		if ( status === 'failed' || status === 'expired' ) {
			throw new Error(
				job?.message ||
					__( 'The export job could not be completed.', 'bimbeau-privacy-analytics' )
			);
		}

		if ( ! job?.statusUrl ) {
			throw new Error(
				__( 'The export job is missing a status URL.', 'bimbeau-privacy-analytics' )
			);
		}

		await delay( EXPORT_POLL_INTERVAL_MS );
		const statusResponse = await fetchExportUrl( job.statusUrl );
		job = await statusResponse.json();
	}

	throw new Error(
		__(
			'The export is still running. Try again in a few moments.',
			'bimbeau-privacy-analytics'
		)
	);
};

const ReportExportAction = ( {
	report,
	params,
	totalItems = 0,
	isPro = Boolean( ADMIN_CONFIG?.settings?.isPro ),
	supportsXlsxExport = ADMIN_CONFIG?.settings?.supportsXlsxExport !== false,
} ) => {
	const [ isExporting, setIsExporting ] = useState( false );
	const [ notice, setNotice ] = useState( null );

	if ( ! report ) {
		return null;
	}

	const exportLimit = getExportLimit();
	const exportRows = getExportRows( totalItems, exportLimit );
	const exportSummary = getExportSummary( totalItems, exportRows );
	const isEmpty = exportRows === 0;

	const exportToggleLabel = __( 'Export report', 'bimbeau-privacy-analytics' );
	const exportIcon = (
		<FeatureIcon
			name="download"
			className="bbpa-report-export-action__icon"
			size={ 16 }
		/>
	);

	if ( ! isPro ) {
		return null;
	}

	const runExport = async ( format ) => {
		if ( isEmpty ) {
			setNotice( {
				status: 'info',
				message: __(
					'No results match the current filters.',
					'bimbeau-privacy-analytics'
				),
			} );
			return;
		}

		setIsExporting( true );
		setNotice( null );

		try {
			const exportParams = {
				...( params || {} ),
				report,
				format,
			};

			exportParams.page = 1;
			exportParams.per_page = exportRows;

			const response = await fetchExportUrl(
				buildRestUrl(
					'/export',
					exportParams,
					ADMIN_CONFIG?.settings?.restNamespace,
					{ includeAdminCacheVersion: false }
				)
			);

			if ( response.status === 202 ) {
				const job = await response.json();
				await pollExportJob( job, report, format, setNotice );
				setNotice( {
					status: 'success',
					message: __(
						'Export ready. Download started.',
						'bimbeau-privacy-analytics'
					),
				} );
				return;
			}

			await downloadExportResponse( response, report, format );
		} catch ( error ) {
			setNotice( {
				status: 'error',
				message: getExportErrorMessage( error ),
			} );
		} finally {
			setIsExporting( false );
		}
	};

	const excelButton = (
		<Button
			className="bbpa-report-export-action__control"
			disabled={ isEmpty || ! supportsXlsxExport }
			icon={
				<FeatureIcon
					name="fileSpreadsheet"
					className="bbpa-report-export-action__control-icon"
					size={ 16 }
				/>
			}
			onClick={ () => runExport( 'xlsx' ) }
		>
			{ __( 'Export Excel', 'bimbeau-privacy-analytics' ) }
		</Button>
	);

	return (
		<div className="bbpa-report-export-action">
			<Dropdown
				className="bbpa-report-export-action__dropdown"
				popoverProps={ {
					className: 'bbpa-report-export-action__popover',
					placement: 'bottom-start',
				} }
				renderToggle={ ( { isOpen, onToggle } ) => (
					<Button
						aria-expanded={ isOpen }
						aria-label={ exportToggleLabel }
						className="bbpa-report-export-action__toggle is-secondary"
						disabled={ isExporting }
						icon={ exportIcon }
						isBusy={ isExporting }
						label={ exportToggleLabel }
						variant="secondary"
						onClick={ onToggle }
					/>
				) }
				renderContent={ () => (
					<div className="bbpa-report-export-action__menu">
						<p className="bbpa-report-export-action__summary">
							{ exportSummary }
						</p>
						<Button
							className="bbpa-report-export-action__control"
							disabled={ isEmpty }
							icon={
								<FeatureIcon
									name="fileSpreadsheet"
									className="bbpa-report-export-action__control-icon"
									size={ 16 }
								/>
							}
							onClick={ () => runExport( 'csv' ) }
						>
							{ __( 'Export CSV', 'bimbeau-privacy-analytics' ) }
						</Button>
						<Button
							className="bbpa-report-export-action__control"
							disabled={ isEmpty }
							icon={
								<FeatureIcon
									name="fileBraces"
									className="bbpa-report-export-action__control-icon"
									size={ 16 }
								/>
							}
							onClick={ () => runExport( 'json' ) }
						>
							{ __( 'Export JSON', 'bimbeau-privacy-analytics' ) }
						</Button>
						{ supportsXlsxExport ? (
							excelButton
						) : (
							<Tooltip text={ XLSX_UNAVAILABLE_MESSAGE }>
								<span>{ excelButton }</span>
							</Tooltip>
						) }
					</div>
				) }
			/>
			{ notice ? (
				<Notice
					status={ notice.status }
					onRemove={ () => setNotice( null ) }
				>
					{ notice.message }
				</Notice>
			) : null }
		</div>
	);
};

export default ReportExportAction;
