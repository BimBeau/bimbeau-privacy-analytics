import { Card, CardBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

export default function SettingsPanel() {
	return <Card><CardBody>{ __( 'Settings are available in the WordPress admin.', 'bimbeau-privacy-analytics' ) }</CardBody></Card>;
}
