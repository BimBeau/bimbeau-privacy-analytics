import { __ } from '@wordpress/i18n';
import {
	Button,
	Card,
	CardBody,
	CardHeader,
	TextControl,
} from '@wordpress/components';
import Notice from '../BrandNotice';
import ProBadge, { ProBadgeText } from '../ProBadge';
import { LuAppWindow } from 'react-icons/lu';

const PwaStatsAppCard = ( {
	isPro = false,
	pwaAppUrl = '',
	pwaNotice = null,
	onCopyPwaUrl,
	onOpenPwaUrl,
} ) => (
	<Card className="bbpa-settings-section bbpa-settings-pwa-card">
		<CardHeader className="bbpa-settings-pwa-card__header">
			<div className="bbpa-settings-pwa-card__title-row">
				<h3 className="bbpa-settings-section__title bbpa-settings-pwa-card__title">
					<span className="bbpa-settings-section__title-icon-wrap">
						<LuAppWindow size={ 16 } aria-hidden="true" />
						<span>{ __( 'PWA Stats App', 'bimbeau-privacy-analytics' ) }</span>
					</span>
				</h3>
				<ProBadge />
			</div>
		</CardHeader>
		<CardBody>
			<fieldset disabled={ ! isPro } className="bbpa-pro-feature-fieldset">
				{ ! isPro && (
					<Notice status="warning" isDismissible={ false }>
						<ProBadgeText
							text={ __(
								'This feature is available in BimBeau Privacy Analytics Pro.',
								'bimbeau-privacy-analytics'
							) }
						/>
					</Notice>
				) }
				{ pwaAppUrl ? (
					<>
						<TextControl
							label={ __( 'PWA URL', 'bimbeau-privacy-analytics' ) }
							value={ pwaAppUrl }
							help={ __(
								'Use this URL to open the standalone analytics app.',
								'bimbeau-privacy-analytics'
							) }
							readOnly
						/>
						<div className="bbpa-settings-pwa__actions">
							<Button
								variant="secondary"
								onClick={ onCopyPwaUrl }
							>
								{ __( 'Copy URL', 'bimbeau-privacy-analytics' ) }
							</Button>
							<Button
								variant="secondary"
								onClick={ onOpenPwaUrl }
							>
								{ __( 'Open PWA', 'bimbeau-privacy-analytics' ) }
							</Button>
						</div>
					</>
				) : null }
			</fieldset>
			{ pwaNotice && (
				<Notice status={ pwaNotice.status } isDismissible={ false }>
					{ pwaNotice.message }
				</Notice>
			) }
		</CardBody>
	</Card>
);

export default PwaStatsAppCard;
