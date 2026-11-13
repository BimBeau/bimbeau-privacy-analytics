import { Button } from '@wordpress/components';
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import Notice from '../BrandNotice';
import { getAdminPanelUrl } from '../../lib/adminUrls';

const DISMISS_STORAGE_PREFIX = 'bbpa_cmp_check_notice_dismissed';

const getMessage = ( status ) => {
	switch ( status ) {
		case 'not_blocked':
			return __(
				'Advanced stats run before visitors give consent. Block the script in your CMP or turn off advanced stats.',
				'bimbeau-privacy-analytics'
			);
		case 'never_released':
			return __(
				'Advanced stats never start: your CMP does not release the script after consent.',
				'bimbeau-privacy-analytics'
			);
		case 'script_missing':
			return __(
				'The advanced stats script is missing from most pages: advanced stats are incomplete.',
				'bimbeau-privacy-analytics'
			);
		default:
			return '';
	}
};

const readDismissed = ( status ) => {
	try {
		return (
			window.sessionStorage.getItem(
				`${ DISMISS_STORAGE_PREFIX }:${ status }`
			) === '1'
		);
	} catch {
		return false;
	}
};

const writeDismissed = ( status ) => {
	try {
		window.sessionStorage.setItem(
			`${ DISMISS_STORAGE_PREFIX }:${ status }`,
			'1'
		);
	} catch {
		// Storage can be unavailable (private mode): the notice is hidden for this page only.
	}
};

/**
 * Notice shown on the plugin screens when the CMP check finds a problem.
 *
 * @param {Object} props        Props.
 * @param {string} props.status Verdict status from the localized payload (`cmpCheckStatus`).
 */
const CmpCheckNotice = ( { status = '' } ) => {
	const message = getMessage( status );
	const [ isDismissed, setIsDismissed ] = useState( () =>
		readDismissed( status )
	);

	if ( ! message || isDismissed ) {
		return null;
	}

	const settingsUrl = `${ getAdminPanelUrl( 'settings', {
		bbpa_settings_tab: 'tracking',
	} ) }#bbpa-cmp-check`;

	return (
		<Notice
			status={ status === 'script_missing' ? 'warning' : 'error' }
			isDismissible
			onRemove={ () => {
				writeDismissed( status );
				setIsDismissed( true );
			} }
		>
			<p>{ message }</p>
			<Button variant="secondary" href={ settingsUrl }>
				{ __( 'Open the CMP check', 'bimbeau-privacy-analytics' ) }
			</Button>
		</Notice>
	);
};

export default CmpCheckNotice;
