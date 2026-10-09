import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { Button, Modal, Popover } from '@wordpress/components';
import { DayPicker } from 'react-day-picker';

import FeatureIcon from '../../components/icons/FeatureIcon';
import { PERIOD_PRESET_OPTIONS, RANGE_PRESET_OPTIONS } from '../../constants';
import {
	formatDate,
	formatDateStringForLocale,
	getAdminLocale,
	getPresetForRange,
	getPreviousRange,
	getRangeFromSelection,
	getShiftedRange,
	isRangeWithinMaxDays,
	MAX_CUSTOM_RANGE_DAYS,
	parseDateString,
} from '../../lib/date';

let periodFilterInstanceCount = 0;

const TABLET_QUERY = '(max-width: 1024px)';
// Same breakpoint as the WordPress admin mobile layout: below it the panel opens as a bottom sheet.
const PHONE_QUERY = '(max-width: 782px)';

const CalendarNavIconLeft = ( props ) => (
	<FeatureIcon name="chevronLeft" size={ 12 } { ...props } />
);

const CalendarNavIconRight = ( props ) => (
	<FeatureIcon name="chevronRight" size={ 12 } { ...props } />
);

const matchesQuery = ( query ) =>
	typeof window !== 'undefined' && window.matchMedia
		? window.matchMedia( query ).matches
		: false;

const useMediaQuery = ( query ) => {
	const [ matches, setMatches ] = useState( () => matchesQuery( query ) );

	useEffect( () => {
		if ( typeof window === 'undefined' || ! window.matchMedia ) {
			return undefined;
		}

		const mediaQueryList = window.matchMedia( query );
		const handleChange = ( event ) => setMatches( event.matches );

		setMatches( mediaQueryList.matches );
		mediaQueryList.addEventListener( 'change', handleChange );

		return () => mediaQueryList.removeEventListener( 'change', handleChange );
	}, [ query ] );

	return matches;
};

const formatRangeLabel = ( range, options ) =>
	sprintf(
		/* translators: 1: start date, 2: end date. */
		__( '%1$s – %2$s', 'bimbeau-privacy-analytics' ),
		formatDateStringForLocale( range.start, options ),
		formatDateStringForLocale( range.end, options )
	);

const PRESET_GROUPS = [
	{
		key: 'rolling',
		label: __( 'Rolling periods', 'bimbeau-privacy-analytics' ),
		options: PERIOD_PRESET_OPTIONS.filter(
			( option ) => option.group !== 'calendar'
		),
	},
	{
		key: 'calendar',
		label: __( 'Calendar periods', 'bimbeau-privacy-analytics' ),
		options: PERIOD_PRESET_OPTIONS.filter(
			( option ) => option.group === 'calendar'
		),
	},
];

const PeriodFilter = ( { value, onChange, isCompact = false } ) => {
	const isTabletOrMobileViewport = useMediaQuery( TABLET_QUERY );
	const isPhoneViewport = useMediaQuery( PHONE_QUERY );
	const [ instanceId ] = useState( () => ++periodFilterInstanceCount );
	const fromInputId = `bbpa-period-filter-from-${ instanceId }`;
	const toInputId = `bbpa-period-filter-to-${ instanceId }`;
	const adminLocale = useMemo( () => getAdminLocale(), [] );
	const calendarFormatters = useMemo( () => {
		const captionFormatter = new Intl.DateTimeFormat( adminLocale, {
			month: 'long',
			year: 'numeric',
		} );
		const monthFormatter = new Intl.DateTimeFormat( adminLocale, {
			month: 'long',
		} );
		const weekdayFormatter = new Intl.DateTimeFormat( adminLocale, {
			weekday: 'short',
		} );
		const yearFormatter = new Intl.DateTimeFormat( adminLocale, {
			year: 'numeric',
		} );

		return {
			formatCaption: ( date ) => captionFormatter.format( date ),
			formatMonthCaption: ( date ) => monthFormatter.format( date ),
			formatWeekdayName: ( date ) =>
				weekdayFormatter.format( date ).replace( /\.$/u, '' ),
			formatYearCaption: ( date ) => yearFormatter.format( date ),
		};
	}, [ adminLocale ] );
	const calendarLabels = useMemo( () => {
		const weekdayFormatter = new Intl.DateTimeFormat( adminLocale, {
			weekday: 'long',
		} );

		return {
			labelNext: () => __( 'Next', 'bimbeau-privacy-analytics' ),
			labelPrevious: () => __( 'Previous', 'bimbeau-privacy-analytics' ),
			labelWeekday: ( date ) => weekdayFormatter.format( date ),
		};
	}, [ adminLocale ] );
	const range = useMemo( () => getRangeFromSelection( value ), [ value ] );
	const selectedRange = useMemo(
		() => ( {
			from: parseDateString( range.start ),
			to: parseDateString( range.end ),
		} ),
		[ range.end, range.start ]
	);
	const activePreset = value?.type === 'preset' ? value.preset : null;
	const getPresetLabel = ( option ) =>
		isTabletOrMobileViewport ? option.labelShort : option.labelLong;
	const activePresetOption = PERIOD_PRESET_OPTIONS.find(
		( option ) => option.value === activePreset
	);
	const activePresetLabel = activePresetOption
		? getPresetLabel( activePresetOption )
		: __( 'Custom', 'bimbeau-privacy-analytics' );
	const [ isOpen, setIsOpen ] = useState( false );
	const [ draftRange, setDraftRange ] = useState( null );
	const [ calendarMonth, setCalendarMonth ] = useState( null );
	const triggerRef = useRef( null );
	const presetButtonRefs = useRef( {} );
	const numberOfMonths = isTabletOrMobileViewport ? 1 : 2;
	const rangeLabel = formatRangeLabel( range, { shortYear: true } );
	const comparisonRange = useMemo( () => getPreviousRange( range ), [ range ] );
	const comparisonLabel = comparisonRange
		? sprintf(
				/* translators: %s: date range of the comparison period, e.g. "10/08/26 – 08/09/26". */
				__( 'vs %s', 'bimbeau-privacy-analytics' ),
				formatRangeLabel( comparisonRange, { shortYear: true } )
		  )
		: '';
	const today = useMemo( () => {
		const date = new Date();
		date.setHours( 0, 0, 0, 0 );

		return date;
	}, [] );
	const minSelectableDate = useMemo( () => {
		const date = new Date( today );
		date.setDate( date.getDate() - ( MAX_CUSTOM_RANGE_DAYS - 1 ) );
		return date;
	}, [ today ] );
	const previousRange = useMemo( () => {
		const shifted = getShiftedRange( range, -1 );
		const shiftedStart = parseDateString( shifted?.start );

		return shiftedStart && shiftedStart >= minSelectableDate
			? shifted
			: null;
	}, [ minSelectableDate, range ] );
	const nextRange = useMemo(
		() =>
			parseDateString( range.end ) < today
				? getShiftedRange( range, 1 )
				: null,
		[ range, today ]
	);
	const disabledDays = useMemo( () => {
		const defaultDisabledDays = [
			{
				before: minSelectableDate,
			},
			{
				after: today,
			},
		];

		if ( ! draftRange?.from || draftRange?.to ) {
			return defaultDisabledDays;
		}

		return [
			...defaultDisabledDays,
			{
				before: draftRange.from,
			},
		];
	}, [ draftRange, minSelectableDate, today ] );
	const isDraftComplete = Boolean(
		draftRange?.from &&
			draftRange?.to &&
			isRangeWithinMaxDays(
				formatDate( draftRange.from ),
				formatDate( draftRange.to )
			)
	);
	const draftComparisonRange = isDraftComplete
		? getPreviousRange( {
				start: formatDate( draftRange.from ),
				end: formatDate( draftRange.to ),
		  } )
		: null;

	// The calendar opens on the month of the end date, with the month before it on the left
	// when two months are shown.
	const getInitialMonth = () => {
		const end = selectedRange.to || today;

		return new Date(
			end.getFullYear(),
			end.getMonth() - ( numberOfMonths - 1 ),
			1
		);
	};

	useEffect( () => {
		if ( isOpen ) {
			setDraftRange( selectedRange );
			return;
		}

		setDraftRange( null );
	}, [ isOpen, selectedRange ] );

	useEffect( () => {
		if ( ! isOpen || ! activePreset || isPhoneViewport ) {
			return;
		}

		presetButtonRefs.current?.[ activePreset ]?.focus();
	}, [ activePreset, isOpen, isPhoneViewport ] );

	const openPanel = () => {
		setCalendarMonth( getInitialMonth() );
		setIsOpen( true );
	};

	const closePanel = () => {
		setIsOpen( false );
	};

	const handlePresetChange = ( preset ) => {
		if ( ! preset ) {
			return;
		}

		onChange( { type: 'preset', preset } );
		setIsOpen( false );
	};

	const handleShift = ( shiftedRange ) => {
		if ( ! shiftedRange ) {
			return;
		}

		const preset = getPresetForRange( shiftedRange, RANGE_PRESET_OPTIONS );

		onChange(
			preset
				? { type: 'preset', preset }
				: { type: 'custom', start: shiftedRange.start, end: shiftedRange.end }
		);
	};

	const handleDayClick = ( day ) => {
		if ( day > today ) {
			return;
		}

		if ( ! draftRange?.from || draftRange?.to ) {
			setDraftRange( {
				from: day,
				to: undefined,
			} );
			return;
		}

		if ( day < draftRange.from ) {
			return;
		}

		setDraftRange( {
			from: draftRange.from,
			to: day,
		} );
	};

	const handleDateInputChange = ( key, inputValue ) => {
		const date = parseDateString( inputValue );

		if ( ! date || date < minSelectableDate || date > today ) {
			return;
		}

		let nextDraft = {
			from: draftRange?.from || selectedRange.from,
			to: draftRange?.to || selectedRange.to,
			[ key ]: date,
		};

		if ( nextDraft.from && nextDraft.to && nextDraft.from > nextDraft.to ) {
			nextDraft = { from: nextDraft.to, to: nextDraft.from };
		}

		setDraftRange( nextDraft );

		const visibleMonth = nextDraft.to || nextDraft.from;
		setCalendarMonth(
			new Date(
				visibleMonth.getFullYear(),
				visibleMonth.getMonth() - ( numberOfMonths - 1 ),
				1
			)
		);
	};

	const handleApply = () => {
		if ( ! isDraftComplete ) {
			return;
		}

		const nextSelection = {
			start: formatDate( draftRange.from ),
			end: formatDate( draftRange.to ),
		};
		const preset = getPresetForRange( nextSelection, RANGE_PRESET_OPTIONS );

		onChange(
			preset
				? { type: 'preset', preset }
				: { type: 'custom', ...nextSelection }
		);
		setIsOpen( false );
	};

	const presetButtons = PRESET_GROUPS.map( ( group ) => (
		<div
			key={ group.key }
			className="bbpa-period-filter__preset-group"
			role="group"
			aria-label={ group.label }
		>
			<span
				className="bbpa-period-filter__presets-label"
				aria-hidden="true"
			>
				{ group.label }
			</span>
			<div className="bbpa-period-filter__presets-links">
				{ group.options.map( ( option ) => {
					const isActive = activePreset === option.value;

					return (
						<Button
							key={ option.value }
							variant="tertiary"
							onClick={ () => handlePresetChange( option.value ) }
							className={
								isActive
									? 'bbpa-period-filter__preset-link is-active'
									: 'bbpa-period-filter__preset-link'
							}
							aria-pressed={ isActive }
							ref={ ( element ) => {
								if ( element ) {
									presetButtonRefs.current[ option.value ] =
										element;
									return;
								}

								delete presetButtonRefs.current[ option.value ];
							} }
						>
							{ isPhoneViewport
								? option.labelShort
								: option.labelLong }
						</Button>
					);
				} ) }
			</div>
		</div>
	) );

	const formatInputDate = ( date ) => ( date ? formatDate( date ) : '' );

	const panel = (
		<div className="bbpa-period-filter__popover-content">
			<div className="bbpa-period-filter__body">
				<div className="bbpa-period-filter__presets">{ presetButtons }</div>
				<DayPicker
					mode="range"
					numberOfMonths={ numberOfMonths }
					selected={ draftRange }
					month={ calendarMonth || undefined }
					onMonthChange={ setCalendarMonth }
					onDayClick={ handleDayClick }
					disabled={ disabledDays }
					className="bbpa-period-filter__calendar"
					lang={ adminLocale }
					weekStartsOn={ 1 }
					formatters={ calendarFormatters }
					labels={ calendarLabels }
					components={ {
						IconLeft: CalendarNavIconLeft,
						IconRight: CalendarNavIconRight,
					} }
				/>
			</div>
			<div className="bbpa-period-filter__footer">
				<div className="bbpa-period-filter__inputs">
					<span className="bbpa-period-filter__input">
						<label htmlFor={ fromInputId }>
							{ __( 'From', 'bimbeau-privacy-analytics' ) }
						</label>
						<input
							id={ fromInputId }
							type="date"
							value={ formatInputDate( draftRange?.from ) }
							min={ formatDate( minSelectableDate ) }
							max={ formatDate( today ) }
							onChange={ ( event ) =>
								handleDateInputChange( 'from', event.target.value )
							}
						/>
					</span>
					<span className="bbpa-period-filter__input">
						<label htmlFor={ toInputId }>
							{ __( 'To', 'bimbeau-privacy-analytics' ) }
						</label>
						<input
							id={ toInputId }
							type="date"
							value={ formatInputDate( draftRange?.to ) }
							min={ formatDate( minSelectableDate ) }
							max={ formatDate( today ) }
							onChange={ ( event ) =>
								handleDateInputChange( 'to', event.target.value )
							}
						/>
					</span>
				</div>
				<p className="bbpa-period-filter__comparison">
					{ draftComparisonRange
						? sprintf(
								/* translators: %s: date range of the comparison period. */
								__(
									'Compared with %s',
									'bimbeau-privacy-analytics'
								),
								formatRangeLabel( draftComparisonRange )
						  )
						: __(
								'Choose the last day of the period.',
								'bimbeau-privacy-analytics'
						  ) }
				</p>
				<div className="bbpa-period-filter__actions">
					<Button variant="tertiary" onClick={ closePanel }>
						{ __( 'Cancel', 'bimbeau-privacy-analytics' ) }
					</Button>
					<Button
						variant="primary"
						onClick={ handleApply }
						disabled={ ! isDraftComplete }
					>
						{ __( 'Apply', 'bimbeau-privacy-analytics' ) }
					</Button>
				</div>
			</div>
		</div>
	);

	return (
		<div
			className={
				isCompact
					? 'bbpa-period-filter bbpa-period-filter--compact'
					: 'bbpa-period-filter'
			}
		>
			<div className="bbpa-period-filter__header">
				<div className="bbpa-period-filter__control">
					<Button
						className="bbpa-period-filter__step"
						onClick={ () => handleShift( previousRange ) }
						disabled={ ! previousRange }
						label={ __( 'Previous period', 'bimbeau-privacy-analytics' ) }
						showTooltip
					>
						<FeatureIcon name="chevronLeft" size={ 16 } />
					</Button>
					<Button
						ref={ triggerRef }
						onClick={ () => ( isOpen ? closePanel() : openPanel() ) }
						aria-haspopup="dialog"
						aria-expanded={ isOpen }
						className="bbpa-period-filter__trigger"
					>
						<span className="bbpa-period-filter__trigger-preset">
							{ activePresetLabel }
						</span>
						<span className="bbpa-period-filter__trigger-dates">
							<span className="bbpa-period-filter__trigger-range">
								{ rangeLabel }
							</span>
							{ comparisonLabel ? (
								<span className="bbpa-period-filter__trigger-comparison">
									{ comparisonLabel }
								</span>
							) : null }
						</span>
						<FeatureIcon
							name="chevronDown"
							size={ 16 }
							className="bbpa-period-filter__trigger-icon"
						/>
					</Button>
					<Button
						className="bbpa-period-filter__step"
						onClick={ () => handleShift( nextRange ) }
						disabled={ ! nextRange }
						label={ __( 'Next period', 'bimbeau-privacy-analytics' ) }
						showTooltip
					>
						<FeatureIcon name="chevronRight" size={ 16 } />
					</Button>
				</div>
			</div>
			{ isOpen && isPhoneViewport ? (
				<Modal
					title={ __( 'Period', 'bimbeau-privacy-analytics' ) }
					onRequestClose={ closePanel }
					className="bbpa-period-filter__sheet"
					overlayClassName="bbpa-period-filter__sheet-overlay"
				>
					{ panel }
				</Modal>
			) : null }
			{ isOpen && ! isPhoneViewport ? (
				<Popover
					anchor={ triggerRef.current }
					onClose={ closePanel }
					placement="bottom-end"
					focusOnMount={ false }
					className="bbpa-period-filter__popover"
				>
					{ panel }
				</Popover>
			) : null }
		</div>
	);
};

export default PeriodFilter;
