import { Button, Card, CardBody, Spinner } from '@wordpress/components';
import { useCallback, useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { fetchCmpCheck } from '../../api/cmpCheck';
import { getAdminLocale } from '../../lib/date';
import { formatNumber } from '../../lib/formatters';

export const CMP_CHECK_ALERT_STATUSES = [
	'not_blocked',
	'never_released',
	'script_missing',
];

const STATUS_TONES = {
	ok: 'success',
	collecting: 'muted',
	disabled: 'muted',
	not_blocked: 'error',
	never_released: 'error',
	script_missing: 'warning',
};

const formatShare = ( value ) =>
	formatNumber( Number( value ) || 0, {
		style: 'percent',
		maximumFractionDigits: 0,
	} );

const getStatusLabel = ( status ) => {
	switch ( status ) {
		case 'ok':
			return __( 'Working', 'bimbeau-privacy-analytics' );
		case 'not_blocked':
			return __( 'Not blocked', 'bimbeau-privacy-analytics' );
		case 'never_released':
			return __( 'Never released', 'bimbeau-privacy-analytics' );
		case 'script_missing':
			return __( 'Script missing', 'bimbeau-privacy-analytics' );
		case 'disabled':
			return __( 'Not started', 'bimbeau-privacy-analytics' );
		default:
			return __( 'Collecting data', 'bimbeau-privacy-analytics' );
	}
};

const getVerdictCopy = ( verdict ) => {
	const status = verdict?.status || 'collecting';
	switch ( status ) {
		case 'ok':
			return {
				title: __(
					'Your CMP blocks advanced stats until consent',
					'bimbeau-privacy-analytics'
				),
				text: __(
					'The advanced stats script stays blocked until the visitor accepts statistics cookies, then starts normally. Nothing to do.',
					'bimbeau-privacy-analytics'
				),
			};
		case 'not_blocked':
			return {
				title: __(
					'Advanced stats start before visitors give consent',
					'bimbeau-privacy-analytics'
				),
				text: __(
					'No CMP controls the advanced stats script: it runs from the first page, before any choice. Detailed data is then collected without consent.',
					'bimbeau-privacy-analytics'
				),
			};
		case 'never_released':
			return {
				title: __(
					'Advanced stats never start, even when visitors accept',
					'bimbeau-privacy-analytics'
				),
				text: __(
					'Your CMP blocks the advanced stats script but never releases it after consent: no advanced data was received over the last 7 days.',
					'bimbeau-privacy-analytics'
				),
			};
		case 'script_missing':
			return {
				title: __(
					'The advanced stats script is missing from your pages',
					'bimbeau-privacy-analytics'
				),
				text: sprintf(
					/* translators: %s: share of page views, for example 61%. */
					__(
						'Advanced stats are enabled, but the script tag was missing from %s of page views. A cache, optimization or consent plugin removes it instead of holding it until consent.',
						'bimbeau-privacy-analytics'
					),
					formatShare( verdict?.absent_share )
				),
			};
		case 'disabled':
			return {
				title: __(
					'Save the settings to start the check',
					'bimbeau-privacy-analytics'
				),
				text: __(
					'The check starts once advanced stats are enabled and saved.',
					'bimbeau-privacy-analytics'
				),
			};
		default:
			return {
				title: __(
					'Not enough visits yet',
					'bimbeau-privacy-analytics'
				),
				text: sprintf(
					/* translators: 1: minimum number of page views, 2: page views counted so far. */
					__(
						'The check needs at least %1$s page views over the last 7 days. %2$s counted so far.',
						'bimbeau-privacy-analytics'
					),
					formatNumber( Number( verdict?.minimum_page_views ) || 0 ),
					formatNumber( Number( verdict?.page_views ) || 0 )
				),
			};
	}
};

const getChecks = ( verdict, probe ) => {
	const pageViews = Number( verdict?.page_views ) || 0;
	const status = verdict?.status;
	const hasData = pageViews > 0;

	const beforeConsent = ! hasData
		? {
				tone: 'muted',
				value: __( 'No data yet', 'bimbeau-privacy-analytics' ),
				help: __(
					'Counted with each page view.',
					'bimbeau-privacy-analytics'
				),
		  }
		: Number( verdict?.held_share ) > 0
		? {
				tone: 'success',
				value: __( 'Blocked', 'bimbeau-privacy-analytics' ),
				help: sprintf(
					/* translators: %s: share of page views, for example 58%. */
					__(
						'Held by the CMP on %s of page views.',
						'bimbeau-privacy-analytics'
					),
					formatShare( verdict?.held_share )
				),
		  }
		: {
				tone: 'error',
				value: __( 'Not blocked', 'bimbeau-privacy-analytics' ),
				help: __(
					'Never held by a CMP before the page view was sent.',
					'bimbeau-privacy-analytics'
				),
		  };

	let afterConsent;
	if ( status === 'not_blocked' ) {
		afterConsent = {
			tone: 'muted',
			value: __( 'Not measurable', 'bimbeau-privacy-analytics' ),
			help: __(
				'Without blocking, accepting and refusing cannot be told apart.',
				'bimbeau-privacy-analytics'
			),
		};
	} else if ( ! hasData ) {
		afterConsent = {
			tone: 'muted',
			value: __( 'No data yet', 'bimbeau-privacy-analytics' ),
			help: __(
				'Counted when the advanced stats script starts.',
				'bimbeau-privacy-analytics'
			),
		};
	} else {
		afterConsent = {
			tone:
				Number( verdict?.consent_share ) > 0 ? 'success' : 'error',
			value: sprintf(
				/* translators: %s: share of page views, for example 42%. */
				__( '%s of page views', 'bimbeau-privacy-analytics' ),
				formatShare( verdict?.consent_share )
			),
			help: __(
				'Page views where the visitor accepted and the script started.',
				'bimbeau-privacy-analytics'
			),
		};
	}

	const tagState = probe?.status === 'ok' ? probe?.tag_state : 'unknown';
	const tag = {
		blocked: {
			tone: 'success',
			value: __( 'Held by a CMP', 'bimbeau-privacy-analytics' ),
			help: __(
				'Its type was changed so that it does not run before consent.',
				'bimbeau-privacy-analytics'
			),
		},
		executable: {
			tone: 'warning',
			value: __( 'Executable', 'bimbeau-privacy-analytics' ),
			help: __(
				'No CMP attribute in the HTML. A CMP that blocks scripts in the browser can still hold it.',
				'bimbeau-privacy-analytics'
			),
		},
		absent: {
			tone: 'error',
			value: __( 'Not found', 'bimbeau-privacy-analytics' ),
			help: __(
				'The script tag is not in the home page HTML.',
				'bimbeau-privacy-analytics'
			),
		},
		unknown: {
			tone: 'muted',
			value: __( 'Not checked', 'bimbeau-privacy-analytics' ),
			help: __(
				'The server could not read the home page.',
				'bimbeau-privacy-analytics'
			),
		},
	}[ tagState ] || {
		tone: 'muted',
		value: __( 'Not checked', 'bimbeau-privacy-analytics' ),
		help: '',
	};

	return [
		{
			key: 'before',
			label: __( 'Before consent', 'bimbeau-privacy-analytics' ),
			...beforeConsent,
		},
		{
			key: 'after',
			label: __( 'After consent', 'bimbeau-privacy-analytics' ),
			...afterConsent,
		},
		{
			key: 'tag',
			label: __( 'Tag on the home page', 'bimbeau-privacy-analytics' ),
			...tag,
		},
	];
};

const getTodo = ( status ) => {
	switch ( status ) {
		case 'not_blocked':
			return [
				__(
					'In your CMP, add the advanced stats script (ID bbpa-advanced-tracker-js) to the blocked scripts, in the statistics category.',
					'bimbeau-privacy-analytics'
				),
				__(
					'If the site has no CMP, turn off advanced stats: essential stats keep working without consent.',
					'bimbeau-privacy-analytics'
				),
			];
		case 'never_released':
			return [
				__(
					'In your CMP, check the category of the advanced stats script: it must be the statistics category that visitors accept.',
					'bimbeau-privacy-analytics'
				),
				__(
					'Clear the site cache, then come back tomorrow: the check updates with the visits of the day.',
					'bimbeau-privacy-analytics'
				),
			];
		case 'script_missing':
			return [
				__(
					'Exclude bbpa-advanced-tracker from the JavaScript delay, combine or removal options of your cache or optimization plugin.',
					'bimbeau-privacy-analytics'
				),
				__(
					'Clear the site cache, then check again.',
					'bimbeau-privacy-analytics'
				),
			];
		default:
			return [];
	}
};

const formatDay = ( isoDate, locale ) => {
	const date = new Date( `${ isoDate }T12:00:00` );
	if ( Number.isNaN( date.getTime() ) ) {
		return isoDate;
	}
	try {
		return new Intl.DateTimeFormat( locale, {
			weekday: 'short',
			day: 'numeric',
		} ).format( date );
	} catch {
		return isoDate;
	}
};

const formatDayNumber = ( isoDate ) =>
	String( Number( `${ isoDate }`.slice( 8, 10 ) ) || '' );

const formatCheckedAt = ( timestamp, locale ) => {
	const date = new Date( ( Number( timestamp ) || 0 ) * 1000 );
	if ( ! timestamp || Number.isNaN( date.getTime() ) ) {
		return '';
	}
	try {
		return new Intl.DateTimeFormat( locale, {
			dateStyle: 'medium',
			timeStyle: 'short',
		} ).format( date );
	} catch {
		return date.toISOString();
	}
};

const DailyChart = ( { daily = [], locale } ) => {
	const rows = daily.map( ( row ) => ( {
		date: row.date,
		held: Number( row.held ) || 0,
		running: ( Number( row.ran ) || 0 ) + ( Number( row.open ) || 0 ),
		absent: Number( row.absent ) || 0,
	} ) );
	const max = Math.max(
		1,
		...rows.map( ( row ) => row.held + row.running + row.absent )
	);
	const series = [
		{
			key: 'held',
			label: __( 'Blocked by the CMP', 'bimbeau-privacy-analytics' ),
		},
		{
			key: 'running',
			label: __( 'Script running', 'bimbeau-privacy-analytics' ),
		},
		{
			key: 'absent',
			label: __( 'Missing from the page', 'bimbeau-privacy-analytics' ),
		},
	];

	return (
		<div className="bbpa-cmp-check__chart">
			<div className="bbpa-cmp-check__chart-header">
				<h4>
					{ __(
						'Page views of the last 7 days, by state of the advanced stats script',
						'bimbeau-privacy-analytics'
					) }
				</h4>
				<ul className="bbpa-cmp-check__legend">
					{ series.map( ( item ) => (
						<li key={ item.key }>
							<span
								className={ `bbpa-cmp-check__swatch bbpa-cmp-check__swatch--${ item.key }` }
								aria-hidden="true"
							/>
							{ item.label }
						</li>
					) ) }
				</ul>
			</div>
			<div className="bbpa-cmp-check__bars">
				{ rows.map( ( row ) => {
					const total = row.held + row.running + row.absent;
					const dayLabel = formatDay( row.date, locale );
					const description = sprintf(
						/* translators: 1: day, 2: page views, 3: blocked, 4: script running, 5: missing. */
						__(
							'%1$s: %2$s page views, %3$s blocked, %4$s running, %5$s missing',
							'bimbeau-privacy-analytics'
						),
						dayLabel,
						formatNumber( total ),
						formatNumber( row.held ),
						formatNumber( row.running ),
						formatNumber( row.absent )
					);
					return (
						<div
							key={ row.date }
							className="bbpa-cmp-check__bar-column"
							title={ description }
						>
							<div
								className="bbpa-cmp-check__bar"
								style={ {
									height: `${ ( total / max ) * 100 }%`,
								} }
								role="img"
								aria-label={ description }
							>
								{ series.map( ( item ) =>
									row[ item.key ] > 0 ? (
										<span
											key={ item.key }
											className={ `bbpa-cmp-check__segment bbpa-cmp-check__swatch--${ item.key }` }
											style={ {
												flexGrow: row[ item.key ],
											} }
										/>
									) : null
								) }
							</div>
							<span
								className="bbpa-cmp-check__day"
								aria-hidden="true"
							>
								<span className="bbpa-cmp-check__day-long">
									{ dayLabel }
								</span>
								<span className="bbpa-cmp-check__day-short">
									{ formatDayNumber( row.date ) }
								</span>
							</span>
						</div>
					);
				} ) }
			</div>
		</div>
	);
};

const formatTagAttributes = ( attributes ) =>
	Object.entries( attributes || {} )
		.map( ( [ name, value ] ) =>
			value === '' ? name : `${ name }="${ value }"`
		)
		.join( ' ' );

const CmpCheckCard = () => {
	const [ report, setReport ] = useState( null );
	const [ error, setError ] = useState( null );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ isRefreshing, setIsRefreshing ] = useState( false );
	const locale = getAdminLocale();

	const load = useCallback( async ( refresh = false ) => {
		if ( refresh ) {
			setIsRefreshing( true );
		}
		try {
			const payload = await fetchCmpCheck( { refresh } );
			setReport( payload || null );
			setError( null );
		} catch ( requestError ) {
			setError(
				requestError?.message ||
					__(
						'The CMP check could not be loaded.',
						'bimbeau-privacy-analytics'
					)
			);
		} finally {
			setIsLoading( false );
			setIsRefreshing( false );
		}
	}, [] );

	useEffect( () => {
		load( false );
	}, [ load ] );

	// The notice of the other screens links here with #bbpa-cmp-check: the card renders after the settings
	// load, too late for the browser to scroll to it.
	useEffect( () => {
		if (
			isLoading ||
			typeof window === 'undefined' ||
			window.location?.hash !== '#bbpa-cmp-check'
		) {
			return;
		}
		const element = window.document.getElementById( 'bbpa-cmp-check' );
		if ( element && typeof element.scrollIntoView === 'function' ) {
			element.scrollIntoView( { block: 'start' } );
		}
	}, [ isLoading ] );

	// The server answers `disabled` while advanced stats are not saved as enabled.
	const verdict = report?.verdict;
	const status = verdict?.status || 'collecting';
	const tone = STATUS_TONES[ status ] || 'muted';
	const copy = getVerdictCopy( verdict );
	const checks = getChecks( verdict, report?.probe );
	const todo = getTodo( status );
	const probe = report?.probe;
	const cmps = Array.isArray( probe?.cmps ) ? probe.cmps : [];
	const tagAttributes = formatTagAttributes( probe?.tag_attributes );
	const checkedAt = formatCheckedAt( probe?.checked_at, locale );

	return (
		<Card
			className="bbpa-cmp-check"
			id="bbpa-cmp-check"
			size="small"
		>
			<CardBody>
				<div className="bbpa-cmp-check__header">
					<h4>{ __( 'CMP check', 'bimbeau-privacy-analytics' ) }</h4>
					{ report ? (
						<span
							className={ `bbpa-privacy-pill bbpa-cmp-check__pill bbpa-cmp-check__pill--${ tone }` }
						>
							{ getStatusLabel( status ) }
						</span>
					) : null }
				</div>
				<p className="bbpa-cmp-check__intro">
					{ __(
						'Checks with each page view whether your CMP blocks the advanced stats script before consent and releases it after. Only daily totals are stored.',
						'bimbeau-privacy-analytics'
					) }
				</p>

				{ isLoading ? (
					<div className="bbpa-cmp-check__loading">
						<Spinner />
					</div>
				) : null }

				{ ! isLoading && error ? (
					<p className="bbpa-cmp-check__error" role="alert">
						{ error }
					</p>
				) : null }

				{ ! isLoading && report ? (
					<>
						<div
							className={ `bbpa-cmp-check__verdict bbpa-cmp-check__verdict--${ tone }` }
							role={ tone === 'error' ? 'alert' : 'status' }
						>
							<strong>{ copy.title }</strong>
							<p>{ copy.text }</p>
						</div>

						{ status !== 'disabled' ? (
							<>
								<div className="bbpa-cmp-check__checks">
									{ checks.map( ( check ) => (
										<div
											key={ check.key }
											className="bbpa-cmp-check__check"
										>
											<span className="bbpa-cmp-check__check-label">
												{ check.label }
											</span>
											<span className="bbpa-cmp-check__check-value">
												<span
													className={ `bbpa-cmp-check__dot bbpa-cmp-check__dot--${ check.tone }` }
													aria-hidden="true"
												/>
												{ check.value }
											</span>
											{ check.help ? (
												<span className="bbpa-cmp-check__check-help">
													{ check.help }
												</span>
											) : null }
										</div>
									) ) }
								</div>

								<DailyChart
									daily={ report?.daily || [] }
									locale={ locale }
								/>

								<div className="bbpa-cmp-check__tag">
									<span className="bbpa-cmp-check__check-label">
										{ __(
											'Advanced stats tag read on the home page',
											'bimbeau-privacy-analytics'
										) }
									</span>
									{ probe?.status === 'ok' ? (
										<code>
											{ probe?.tag_state === 'absent'
												? __(
														'No bbpa-advanced-tracker-js tag in the HTML',
														'bimbeau-privacy-analytics'
												  )
												: `<script id="bbpa-advanced-tracker-js"${
														tagAttributes
															? ` ${ tagAttributes }`
															: ''
												  }>` }
										</code>
									) : (
										<p>
											{ __(
												'The server could not read the home page. Some hosts block requests from a site to itself.',
												'bimbeau-privacy-analytics'
											) }
										</p>
									) }
									<p>
										{ cmps.length > 0
											? sprintf(
													/* translators: %s: list of CMP names. */
													__(
														'CMP found: %s.',
														'bimbeau-privacy-analytics'
													),
													cmps.join( ', ' )
											  )
											: __(
													'No known CMP found among active plugins or in the home page HTML.',
													'bimbeau-privacy-analytics'
											  ) }
									</p>
								</div>

								{ todo.length > 0 ? (
									<div className="bbpa-cmp-check__todo">
										<strong>
											{ __(
												'What to do',
												'bimbeau-privacy-analytics'
											) }
										</strong>
										<ol>
											{ todo.map( ( item ) => (
												<li key={ item }>{ item }</li>
											) ) }
										</ol>
									</div>
								) : null }
							</>
						) : null }

						<div className="bbpa-cmp-check__footer">
							<p>
								{ sprintf(
									/* translators: %s: number of page views. */
									__(
										'Based on %s page views over the last 7 days.',
										'bimbeau-privacy-analytics'
									),
									formatNumber(
										Number( verdict?.page_views ) || 0
									)
								) }
								{ checkedAt
									? ` ${ sprintf(
											/* translators: %s: date and time. */
											__(
												'Home page checked on %s.',
												'bimbeau-privacy-analytics'
											),
											checkedAt
									  ) }`
									: '' }
							</p>
							{ status !== 'disabled' ? (
								<Button
									variant="secondary"
									onClick={ () => load( true ) }
									isBusy={ isRefreshing }
									disabled={ isRefreshing }
								>
									{ __(
										'Check again',
										'bimbeau-privacy-analytics'
									) }
								</Button>
							) : null }
						</div>
					</>
				) : null }
			</CardBody>
		</Card>
	);
};

export default CmpCheckCard;
