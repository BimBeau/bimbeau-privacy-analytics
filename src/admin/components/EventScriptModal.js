import { __ } from '@wordpress/i18n';
import { Button, Flex, FlexItem, Modal } from '@wordpress/components';

import { resolveEventScript } from '../utils/event-script-resolver';

const EventScriptModal = ( { selectedEvent, onClose } ) => {
	if ( ! selectedEvent ) {
		return null;
	}

	const { eventType, previewText } = resolveEventScript( selectedEvent );
	const capturedVariables = previewText;

	return (
		<Modal
			title={ `${ __( 'Event:', 'bimbeau-privacy-analytics' ) } ${ eventType || __( 'unknown', 'bimbeau-privacy-analytics' ) }` }
			onRequestClose={ onClose }
		>
			<Flex direction="column" gap={ 3 }>
				<FlexItem>
					<p><strong>{ __( 'Event ID:', 'bimbeau-privacy-analytics' ) }</strong> { selectedEvent?.event_id || 'null' }</p>
					<p><strong>{ __( 'Timestamp:', 'bimbeau-privacy-analytics' ) }</strong> { selectedEvent?.occurrence_date || selectedEvent?.occurrence_day || 'null' }</p>
				</FlexItem>
				<FlexItem>
					<pre className="bbpa-events-panel__script-preview" aria-label={ __( 'Captured variables', 'bimbeau-privacy-analytics' ) }>{ capturedVariables }</pre>
				</FlexItem>
				<Flex justify="flex-end" gap={ 2 }>
					<Button
						variant="secondary"
						onClick={ async () => {
							if ( navigator?.clipboard?.writeText ) {
								await navigator.clipboard.writeText( capturedVariables );
							}
						} }
					>
						{ __( 'Copy', 'bimbeau-privacy-analytics' ) }
					</Button>
					<Button variant="primary" onClick={ onClose }>{ __( 'Close', 'bimbeau-privacy-analytics' ) }</Button>
				</Flex>
			</Flex>
		</Modal>
	);
};

export default EventScriptModal;
