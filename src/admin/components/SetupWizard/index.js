import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { Button, Card, CardBody, CardFooter, CardHeader, Modal, Notice, Spinner, VStack } from '@wordpress/components';
import { fetchAdminJson } from '../../api/useAdminEndpoint';

const STEPS = [ 'tracking', 'geolocation', 'referrers', 'complete' ];
const stepNumber = ( step ) => Math.max( 0, STEPS.indexOf( step ) ) + 1;
const postWizard = ( action, extra = {} ) => fetchAdminJson( '/admin/setup-wizard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { action, ...extra } ) } );
const saveSettings = ( settings ) => fetchAdminJson( '/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( settings ) } );

export const SetupWizard = ( { initial, onClose, onComplete } ) => {
	const [ payload, setPayload ] = useState( initial );
	const [ busy, setBusy ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ skipOpen, setSkipOpen ] = useState( false );
	const state = payload?.state || {};
	const step = state.current_step || 'tracking';
	const settings = payload?.settings || {};
	const update = async ( action, extra ) => {
		const result = await postWizard( action, extra );
		setPayload( ( current ) => ( { ...current, state: result.state } ) );
		return result;
	};
	const moveTo = ( next ) => update( 'set_step', { step: next } );
	const chooseTracking = async ( enabled ) => {
		setBusy( true ); setError( '' );
		try { await saveSettings( { ...settings, advanced_stats_enabled: enabled } ); await update( 'set_choice', { choice: 'advanced_stats', value: enabled } ); await moveTo( 'geolocation' ); }
		catch ( requestError ) { setError( requestError?.message || __( 'Unable to save this choice. Please try again.', 'bimbeau-privacy-analytics' ) ); }
		finally { setBusy( false ); }
	};
	const downloadGeoIp = async () => {
		setBusy( true ); setError( '' );
		try { await fetchAdminJson( '/admin/geoip-database/update', { method: 'POST', headers: { 'Content-Type': 'application/json' } } ); const status = await fetchAdminJson( '/admin/geoip-database/status' ); if ( status?.database?.operational !== true ) throw new Error( __( 'The GeoIP database could not be validated after download.', 'bimbeau-privacy-analytics' ) ); await update( 'set_choice', { choice: 'geoip_database', value: true } ); await update( 'mark_geoip_downloaded' ); setPayload( ( current ) => ( { ...current, geoip: { local_database_available: true }, geoipStatus: status.database } ) ); await moveTo( 'referrers' ); }
		catch ( requestError ) { setError( requestError?.message || __( 'Unable to download the GeoIP database. Please try again.', 'bimbeau-privacy-analytics' ) ); }
		finally { setBusy( false ); }
	};
	const skipGeoIp = async () => { setBusy( true ); try { await update( 'set_choice', { choice: 'geoip_database', value: false } ); await moveTo( 'referrers' ); setSkipOpen( false ); } catch ( requestError ) { setError( requestError?.message || __( 'Unable to save this choice. Please try again.', 'bimbeau-privacy-analytics' ) ); } finally { setBusy( false ); } };
	const chooseFavicons = async ( enabled ) => { setBusy( true ); setError( '' ); try { await saveSettings( { ...settings, referrer_favicons_enabled: enabled } ); await update( 'set_choice', { choice: 'referrer_favicons', value: enabled } ); if ( enabled ) await update( 'mark_favicons_enabled' ); setPayload( ( current ) => ( { ...current, settings: { ...current.settings, referrer_favicons_enabled: enabled } } ) ); await moveTo( 'complete' ); } catch ( requestError ) { setError( requestError?.message || __( 'Unable to save this choice. Please try again.', 'bimbeau-privacy-analytics' ) ); } finally { setBusy( false ); } };
	const finish = async () => { setBusy( true ); try { await update( 'complete' ); onComplete?.(); } catch ( requestError ) { setError( requestError?.message || __( 'Unable to finish configuration. Please try again.', 'bimbeau-privacy-analytics' ) ); } finally { setBusy( false ); } };
	const finishLater = async () => { setBusy( true ); try { await update( 'start' ); onClose?.(); } finally { setBusy( false ); } };
	const back = () => moveTo( STEPS[ Math.max( 0, stepNumber( step ) - 2 ) ] );
	const labels = { tracking: __( 'Configure analytics tracking', 'bimbeau-privacy-analytics' ), geolocation: __( 'Install the local GeoIP database', 'bimbeau-privacy-analytics' ), referrers: __( 'Display referrer favicons', 'bimbeau-privacy-analytics' ), complete: __( 'Your configuration is ready', 'bimbeau-privacy-analytics' ) };
	return <Modal title={ labels[ step ] } onRequestClose={ finishLater } shouldReturnFocusAfterClose>
		<VStack spacing={ 4 } className="bbpa-setup-wizard">
			<p aria-live="polite">{ __( 'Step', 'bimbeau-privacy-analytics' ) } { stepNumber( step ) } { __( 'of 4', 'bimbeau-privacy-analytics' ) }</p>
			{ error ? <Notice status="error" isDismissible={ false }>{ error }</Notice> : null }
			<Card><CardHeader><strong>{ labels[ step ] }</strong></CardHeader><CardBody>
				{ step === 'tracking' && <><p>{ __( 'BimBeau Privacy Analytics stores analytics data in your WordPress installation. Optional external features remain inactive until you explicitly enable them.', 'bimbeau-privacy-analytics' ) }</p><h3>{ __( 'Enable advanced statistics', 'bimbeau-privacy-analytics' ) }</h3><p>{ __( 'Advanced statistics add device details, screen resolution, active time, and other enriched information when available.', 'bimbeau-privacy-analytics' ) }</p><Notice status="info" isDismissible={ false }>{ __( 'If your website requires prior analytics consent, your CMP must block the BimBeau Privacy Analytics advanced tracker until the visitor accepts the Analytics or Statistics category. BimBeau Privacy Analytics does not replace your CMP and does not record visitor consent.', 'bimbeau-privacy-analytics' ) } <a href="https://bimbeau.com" target="_blank" rel="noopener noreferrer">{ __( 'Read the CMP documentation.', 'bimbeau-privacy-analytics' ) }</a></Notice></> }
				{ step === 'geolocation' && <><p>{ __( 'The local GeoIP database allows BimBeau Privacy Analytics to display the geographic origin of visitors while performing IP lookups inside your WordPress installation.', 'bimbeau-privacy-analytics' ) }</p><Notice status="info" isDismissible={ false }>{ __( 'Downloading the database contacts the documented BimBeau GeoIP Database Service. The service can receive your server IP address and a technical User-Agent. Visitor IP addresses are not sent to BimBeau for local lookups.', 'bimbeau-privacy-analytics' ) }</Notice></> }
				{ step === 'referrers' && <><p>{ __( 'BimBeau Privacy Analytics can contact referrer domains to retrieve their icons and cache validated copies inside your WordPress installation.', 'bimbeau-privacy-analytics' ) }</p><Notice status="info" isDismissible={ false }>{ __( "The contacted domains can receive your server IP address and a generic technical User-Agent. No request is sent directly from the administrator's browser, and no WordPress site URL is included in the User-Agent.", 'bimbeau-privacy-analytics' ) }</Notice><p>{ __( 'This feature is visual only and can be disabled later.', 'bimbeau-privacy-analytics' ) }</p></> }
				{ step === 'complete' && <><p>{ __( 'Advanced statistics:', 'bimbeau-privacy-analytics' ) } { settings.advanced_stats_enabled ? __( 'Enabled', 'bimbeau-privacy-analytics' ) : __( 'Disabled', 'bimbeau-privacy-analytics' ) }</p><p>{ __( 'Local GeoIP database:', 'bimbeau-privacy-analytics' ) } { payload?.geoip?.local_database_available ? __( 'Installed', 'bimbeau-privacy-analytics' ) : __( 'Not installed', 'bimbeau-privacy-analytics' ) }</p><p>{ __( 'Automatic GeoIP updates:', 'bimbeau-privacy-analytics' ) } { settings.geoip_update_frequency === 'disabled' ? __( 'Disabled', 'bimbeau-privacy-analytics' ) : __( 'Enabled', 'bimbeau-privacy-analytics' ) }</p><p>{ __( 'Referrer favicons:', 'bimbeau-privacy-analytics' ) } { settings.referrer_favicons_enabled ? __( 'Enabled', 'bimbeau-privacy-analytics' ) : __( 'Disabled', 'bimbeau-privacy-analytics' ) }</p><p>{ __( 'Other settings use the recommended defaults and can be changed later from the BimBeau Privacy Analytics settings.', 'bimbeau-privacy-analytics' ) }</p></> }
			</CardBody><CardFooter>{ step === 'tracking' ? <><Button variant="primary" isBusy={ busy } disabled={ busy } onClick={ () => chooseTracking( true ) }>{ __( 'Enable advanced statistics and continue', 'bimbeau-privacy-analytics' ) }</Button><Button variant="link" disabled={ busy } onClick={ () => chooseTracking( false ) }>{ __( 'Continue with essential statistics only', 'bimbeau-privacy-analytics' ) }</Button></> : null }{ step === 'geolocation' ? <><Button variant="primary" isBusy={ busy } disabled={ busy } onClick={ downloadGeoIp }>{ __( 'Download the GeoIP database and continue', 'bimbeau-privacy-analytics' ) }</Button><Button variant="link" disabled={ busy } onClick={ () => setSkipOpen( true ) }>{ __( 'Continue without local geolocation', 'bimbeau-privacy-analytics' ) }</Button></> : null }{ step === 'referrers' ? <><Button variant="primary" isBusy={ busy } disabled={ busy } onClick={ () => chooseFavicons( true ) }>{ __( 'Allow referrer favicons and continue', 'bimbeau-privacy-analytics' ) }</Button><Button variant="link" disabled={ busy } onClick={ () => chooseFavicons( false ) }>{ __( 'Continue without enabling favicons', 'bimbeau-privacy-analytics' ) }</Button></> : null }{ step === 'complete' ? <Button variant="primary" isBusy={ busy } disabled={ busy } onClick={ finish }>{ __( 'Finish configuration', 'bimbeau-privacy-analytics' ) }</Button> : null }{ step !== 'tracking' && step !== 'complete' ? <Button variant="link" disabled={ busy } onClick={ back }>{ __( 'Back', 'bimbeau-privacy-analytics' ) }</Button> : null }</CardFooter></Card>
			<Button variant="link" disabled={ busy } onClick={ finishLater }>{ busy ? <Spinner /> : null }{ __( 'Finish later', 'bimbeau-privacy-analytics' ) }</Button>
		</VStack>
		{ skipOpen && <Modal title={ __( 'Continue without geolocation?', 'bimbeau-privacy-analytics' ) } onRequestClose={ () => setSkipOpen( false ) } shouldReturnFocusAfterClose><p>{ __( 'Without a local GeoIP database, BimBeau Privacy Analytics will not be able to determine the geographic origin of visitors.', 'bimbeau-privacy-analytics' ) }</p><p>{ __( 'Page views, visits, and traffic sources will continue to be measured, but country, region, and city information will not be available.', 'bimbeau-privacy-analytics' ) }</p><p>{ __( 'You can download the GeoIP database later from the geolocation settings.', 'bimbeau-privacy-analytics' ) }</p><Button variant="primary" isBusy={ busy } onClick={ skipGeoIp }>{ __( 'Continue without geolocation', 'bimbeau-privacy-analytics' ) }</Button><Button variant="link" onClick={ () => setSkipOpen( false ) }>{ __( 'Return to the download', 'bimbeau-privacy-analytics' ) }</Button></Modal> }
	</Modal>;
};

export default SetupWizard;
