import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { Button, Popover } from '@wordpress/components';
import { DayPicker } from 'react-day-picker';

import FeatureIcon from '../../components/icons/FeatureIcon';
import { PERIOD_PRESET_OPTIONS } from '../../constants';
import {
	formatDate,
	formatDateStringForLocale,
	getRangeFromSelection,
	MAX_CUSTOM_RANGE_DAYS,
	parseDateString,
} from '../../lib/date';

const CalendarNavIconLeft = ( props ) => (
	<FeatureIcon name="chevronLeft" size={ 12 } { ...props } />
);

const CalendarNavIconRight = ( props ) => (
	<FeatureIcon name="chevronRight" size={ 12 } { ...props } />
);

const PeriodFilter = ( { value, onChange, isCompact = false } ) => {
	const [ isTabletOrMobileViewport, setIsTabletOrMobileViewport ] =
		useState( () => {
			if ( typeof window === 'undefined' || ! window.matchMedia ) {
				return false;
			}

			return window.matchMedia( '(max-width: 1024px)' ).matches;
		} );
	const range = useMemo( () => getRangeFromSelection( value ), [ value ] );
	const calendarValue = useMemo(
		() => ( {
			start: parseDateString( range.start ),
			end: parseDateString( range.end ),
		} ),
		[ range.end, range.start ]
	);
	const activePreset = value?.type === 'preset' ? value.preset : null;
	const activePresetLabel = useMemo( () => {
		if ( ! activePreset ) {
			return __( 'Custom', 'bimbeau-privacy-analytics' );
		}

		const presetOption = PERIOD_PRESET_OPTIONS.find(
			( option ) => option.value === activePreset
		);

		if ( ! presetOption ) {
			return __( 'Custom', 'bimbeau-privacy-analytics' );
		}

		return isTabletOrMobileViewport
			? presetOption.labelShort
			: presetOption.labelLong;
	}, [ activePreset, isTabletOrMobileViewport ] );
	const [ isOpen, setIsOpen ] = useState( false );
	const [ draftRange, setDraftRange ] = useState( null );
	const triggerRef = useRef( null );
	const presetButtonRefs = useRef( {} );
	const selectedRange = useMemo(
		() => ( {
			from: calendarValue.start,
			to: calendarValue.end,
		} ),
		[ calendarValue.end, calendarValue.start ]
	);
	const initialCalendarMonth = draftRange?.from || selectedRange.from;
	const rangeLabel = useMemo(
		() =>
			sprintf(
				/* translators: 1: start date, 2: end date. */
				__( '%1$s – %2$s', 'bimbeau-privacy-analytics' ),
				formatDateStringForLocale( range.start, { shortYear: true } ),
				formatDateStringForLocale( range.end, { shortYear: true } )
			),
		[ range.end, range.start ]
	);
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

	useEffect( () => {
		if ( typeof window === 'undefined' || ! window.matchMedia ) {
			return undefined;
		}

		const mediaQueryList = window.matchMedia( '(max-width: 1024px)' );
		const handleViewportChange = ( event ) => {
			setIsTabletOrMobileViewport( event.matches );
		};

		setIsTabletOrMobileViewport( mediaQueryList.matches );

		mediaQueryList.addEventListener( 'change', handleViewportChange );

		return () => {
			mediaQueryList.removeEventListener(
				'change',
				handleViewportChange
			);
		};
	}, [] );

	useEffect( () => {
		if ( isOpen ) {
			setDraftRange( selectedRange );
			return;
		}

		setDraftRange( null );
	}, [ isOpen, selectedRange ] );

	useEffect( () => {
		if ( ! isOpen || ! activePreset ) {
			return;
		}

		presetButtonRefs.current?.[ activePreset ]?.focus();
	}, [ activePreset, isOpen ] );

	const handlePresetChange = ( preset ) => {
		if ( ! preset ) {
			return;
		}

		onChange( { type: 'preset', preset } );
		setIsOpen( false );
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

		const nextRange = {
			from: draftRange.from,
			to: day,
		};

		setDraftRange( nextRange );
		setIsOpen( false );

		onChange( {
			type: 'custom',
			start: formatDate( nextRange.from ),
			end: formatDate( nextRange.to ),
		} );
	};

	const handlePopoverClose = () => {
		setIsOpen( false );
	};

	return (
		<div
			className={
				isCompact
					? 'bbpa-period-filter bbpa-period-filter--compact'
					: 'bbpa-period-filter'
			}
		>
			<div className="bbpa-period-filter__header">
				<Button
					ref={ triggerRef }
					variant="secondary"
					onClick={ () => setIsOpen( ( current ) => ! current ) }
					aria-haspopup="dialog"
					aria-expanded={ isOpen }
					className="bbpa-period-filter__trigger"
				>
					<span className="bbpa-period-filter__trigger-preset">
						{ activePresetLabel }
					</span>
					<span className="bbpa-period-filter__trigger-range">
						{ rangeLabel }
					</span>
					<FeatureIcon
						name="chevronDown"
						size={ 14 }
						className="bbpa-period-filter__trigger-icon"
					/>
				</Button>
			</div>
			{ isOpen && (
				<Popover
					anchor={ triggerRef.current }
					onClose={ handlePopoverClose }
					placement="bottom-start"
					focusOnMount={ false }
					className="bbpa-period-filter__popover"
				>
					<div className="bbpa-period-filter__popover-content">
						<div className="bbpa-period-filter__presets">
							<span className="bbpa-period-filter__presets-label">
								{ __( 'Quick ranges', 'bimbeau-privacy-analytics' ) }
							</span>
							<div className="bbpa-period-filter__presets-links">
								{ PERIOD_PRESET_OPTIONS.map( ( option ) => {
									const isActive =
										activePreset === option.value;

									return (
										<Button
											key={ option.value }
											variant="secondary"
											onClick={ () =>
												handlePresetChange(
													option.value
												)
											}
											className={
												isActive
													? 'bbpa-period-filter__preset-link is-active'
													: 'bbpa-period-filter__preset-link'
											}
											aria-pressed={ isActive }
											ref={ ( element ) => {
												if ( element ) {
													presetButtonRefs.current[
														option.value
													] = element;
													return;
												}

												delete presetButtonRefs.current[
													option.value
												];
											} }
										>
											{ isTabletOrMobileViewport
												? option.labelShort
												: option.labelLong }
										</Button>
									);
								} ) }
							</div>
						</div>
						<DayPicker
							mode="range"
							numberOfMonths={ isTabletOrMobileViewport ? 1 : 2 }
							selected={ draftRange }
							defaultMonth={ initialCalendarMonth }
							onDayClick={ handleDayClick }
							disabled={ disabledDays }
							className="bbpa-period-filter__calendar"
							weekStartsOn={ 1 }
							components={ {
								IconLeft: CalendarNavIconLeft,
								IconRight: CalendarNavIconRight,
							} }
						/>
					</div>
				</Popover>
			) }
		</div>
	);
};

export default PeriodFilter;
