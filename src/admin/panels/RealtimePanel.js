import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from '@wordpress/element';
import { Button, Notice, Tooltip } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import { ADMIN_CONFIG } from '../constants';

import DataState from '../components/DataState';
import BpaCard from '../components/BpaCard';
import WorldMap from '../components/WorldMap';
import useRealtimeSnapshot from '../hooks/useRealtimeSnapshot';
import BrandIcon from '../components/icons/BrandIcon';
import { getCountryFlagClass, isUnknownCountryCode } from '../lib/countryNames';
import { formatScreenResolution } from '../lib/formatScreenResolution';
import { getLocationLabel } from '../lib/locationLabel';
import { formatWpDateTime, normalizeUnixTimestampSeconds } from '../lib/date';
import { formatDeviceClassLabel } from '../lib/deviceClassLabel';
import { getChannelLabel } from '../lib/channelLabels';
import { isVisitorOriginUnavailable } from '../lib/geoipStatus';
import { createLogger } from '../logger';

const VisitorOriginUnavailableNotice = () => {
	if (!isVisitorOriginUnavailable()) {
		return null;
	}

	return (
		<Notice status="info" isDismissible={false}>
			<strong>{__('Visitor origin unavailable', 'bimbeau-privacy-analytics')}</strong>
			<p>
				{__(
					'Visitor origin will be available after the local GeoIP database is installed from the plugin geolocation settings.',
					'bimbeau-privacy-analytics'
				)}
			</p>
		</Notice>
	);
};

const formatConnectionTime = (timestamp) => {
	const parsedTimestamp = Number(timestamp);

	if (!Number.isFinite(parsedTimestamp) || parsedTimestamp <= 0) {
		return __('Unknown', 'bimbeau-privacy-analytics');
	}

	const normalizedTimestamp = normalizeUnixTimestampSeconds(parsedTimestamp);
	if (normalizedTimestamp === null) {
		return __('Unknown', 'bimbeau-privacy-analytics');
	}

	return formatWpDateTime(normalizedTimestamp, __('Unknown', 'bimbeau-privacy-analytics'));
};


const getRealtimeVisitField = (visit, fieldNames) => {
	for (const fieldName of fieldNames) {
		const value = visit?.[fieldName];
		if (typeof value === 'string' && value.trim() !== '') {
			return value.trim();
		}
		if (typeof value === 'number' && Number.isFinite(value)) {
			return String(value);
		}
	}

	return '';
};

const getRealtimeVisitGeoField = (visit, fieldNames) => {
	const geoCandidates = [visit?.geo, visit?.geolocation, visit?.location];

	for (const candidate of geoCandidates) {
		if (!candidate || typeof candidate !== 'object') {
			continue;
		}

		const resolvedValue = getRealtimeVisitField(candidate, fieldNames);
		if (resolvedValue !== '') {
			return resolvedValue;
		}
	}

	return '';
};

const parseRealtimeCoordinate = (value) => {
	if (value === null || value === undefined || value === '') {
		return null;
	}

	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue : null;
};

const normalizeRealtimeMapPoint = (point = {}) => {
	const city =
		getRealtimeVisitField(point, ['city', 'city_name', 'cityName', 'label']) ||
		getRealtimeVisitGeoField(point, ['city', 'city_name', 'cityName', 'label']);
	const accuracyRadiusRaw = Number(
		point?.accuracy_radius ??
		point?.accuracyRadius ??
		getRealtimeVisitGeoField(point, ['accuracy_radius', 'accuracyRadius']) ??
		NaN
	);
	const latitudeRaw = parseRealtimeCoordinate(
		point?.latitude ?? point?.lat ?? getRealtimeVisitGeoField(point, ['latitude', 'lat']) ?? NaN
	);
	const longitudeRaw = parseRealtimeCoordinate(
		point?.longitude ?? point?.lng ?? point?.lon ?? getRealtimeVisitGeoField(point, ['longitude', 'lng', 'lon']) ?? NaN
	);

	return {
		...point,
		city,
		accuracy_radius:
			Number.isFinite(accuracyRadiusRaw)
				? Math.max(0, Math.round(accuracyRadiusRaw))
				: null,
		latitude: latitudeRaw,
		longitude: longitudeRaw,
	};
};

const normalizeRealtimeVisit = (visit = {}) => {
	const countryCode =
		getRealtimeVisitField(visit, ['country_code', 'countryCode']) ||
		getRealtimeVisitGeoField(visit, ['country_code', 'countryCode', 'country']);
	const country =
		getRealtimeVisitField(visit, ['country', 'country_name', 'countryName']) ||
		getRealtimeVisitGeoField(visit, ['country_name', 'countryName', 'country']);
	const city =
		getRealtimeVisitField(visit, ['city', 'city_name', 'cityName']) ||
		getRealtimeVisitGeoField(visit, ['city', 'city_name', 'cityName']);
	const accuracyRadiusRaw = Number(
		visit?.accuracy_radius ??
		visit?.accuracyRadius ??
		getRealtimeVisitGeoField(visit, ['accuracy_radius', 'accuracyRadius']) ??
		NaN
	);
	const latitudeRaw = parseRealtimeCoordinate(
		visit?.latitude ?? visit?.lat ?? getRealtimeVisitGeoField(visit, ['latitude', 'lat']) ?? NaN
	);
	const longitudeRaw = parseRealtimeCoordinate(
		visit?.longitude ?? visit?.lng ?? visit?.lon ?? getRealtimeVisitGeoField(visit, ['longitude', 'lng', 'lon']) ?? NaN
	);
	const currentPage = getRealtimeVisitField(visit, ['current_page', 'currentPage', 'page_path', 'path']);
	const referrerDomain = getRealtimeVisitField(visit, ['referrer_domain', 'referrerDomain', 'referrer']);
	const sourceCategory = getRealtimeVisitField(visit, ['source_category', 'sourceCategory', 'channel']);
	const operatingSystem = getRealtimeVisitField(visit, ['operating_system', 'operatingSystem', 'os']);
	const browser = getRealtimeVisitField(visit, ['browser', 'browser_name', 'browserName']);
	const browserVersion = getRealtimeVisitField(visit, ['browser_version', 'browserVersion']);
	const deviceClass = getRealtimeVisitField(visit, ['device_class', 'deviceClass', 'device']);
	const screenResolution = formatScreenResolution(
		getRealtimeVisitField(visit, [
			'screen_resolution',
			'screenResolution',
			'resolution',
			'resolution_label',
			'resolutionLabel',
		])
	);

	const firstViewAt = Number(
		visit?.first_view_at ?? visit?.firstViewAt ?? visit?.last_view_at ?? visit?.lastViewAt ?? 0
	);
	const lastViewAt = Number(visit?.last_view_at ?? visit?.lastViewAt ?? firstViewAt);

	return {
		...visit,
		visitor_id: getRealtimeVisitField(visit, ['visitor_id']),
		country_code: countryCode,
		country,
		city,
		accuracy_radius:
			Number.isFinite(accuracyRadiusRaw)
				? Math.max(0, Math.round(accuracyRadiusRaw))
				: null,
		latitude: latitudeRaw,
		longitude: longitudeRaw,
		first_view_at: Number.isFinite(firstViewAt) ? firstViewAt : 0,
		last_view_at: Number.isFinite(lastViewAt) ? lastViewAt : 0,
		current_page: currentPage,
		referrer_domain: referrerDomain,
		source_category: sourceCategory,
		operating_system: operatingSystem,
		browser,
		browser_version: browserVersion,
		device_class: deviceClass,
		screen_resolution: screenResolution,
	};
};




const getRealtimeVisitChannelValue = (visit = {}) => {
	const sourceCategory = getRealtimeVisitField(visit, ['source_category', 'sourceCategory', 'channel']);
	if (sourceCategory !== '') {
		return sourceCategory;
	}

	const referrerDomain = getRealtimeVisitField(visit, ['referrer_domain', 'referrerDomain', 'referrer']);
	return referrerDomain !== '' ? 'Referrals' : 'Direct';
};

const ChannelLabel = ({ sourceCategory = '', referrerDomain = '' }) => {
	const channelLabel = getChannelLabel(sourceCategory || (referrerDomain ? 'Referrals' : 'Direct'));
	const diagnosticReferrer = typeof referrerDomain === 'string' ? referrerDomain.trim() : '';
	const label = channelLabel || getChannelLabel('Other');

	if (diagnosticReferrer !== '') {
		return (
			<Tooltip text={diagnosticReferrer}>
				<span title={diagnosticReferrer}>{label}</span>
			</Tooltip>
		);
	}

	return <span>{label}</span>;
};

const buildRealtimeGeoKey = (latitude, longitude) => {
	if (
		latitude === null ||
		latitude === undefined ||
		longitude === null ||
		longitude === undefined ||
		(typeof latitude === 'string' && latitude.trim() === '') ||
		(typeof longitude === 'string' && longitude.trim() === '')
	) {
		return '';
	}

	const lat = Number(latitude);
	const lng = Number(longitude);

	if (
		!Number.isFinite(lat) ||
		!Number.isFinite(lng) ||
		lat < -90 ||
		lat > 90 ||
		lng < -180 ||
		lng > 180 ||
		(lat === 0 && lng === 0)
	) {
		return '';
	}

	return `${lat.toFixed(4)}|${lng.toFixed(4)}`;
};

const resolveRealtimePage = (point = {}) =>
	getRealtimeVisitField(point, ['current_page', 'currentPage', 'page_path', 'path']);

export const normalizeRealtimeMapItem = (
	point = {},
	{ individualVisit = false, index = 0 } = {}
) => {
	const normalizedPoint = individualVisit
		? normalizeRealtimeVisit(point)
		: normalizeRealtimeMapPoint(point);
	const metricCandidate = Number(
		normalizedPoint?.weight ?? normalizedPoint?.hits ?? normalizedPoint?.count ?? NaN
	);
	const visits = individualVisit
		? Number.isFinite(metricCandidate) && metricCandidate > 0
			? metricCandidate
			: 1
		: Number.isFinite(metricCandidate)
			? metricCandidate
			: 0;
	const currentPage = resolveRealtimePage(normalizedPoint);

	return {
		id:
			getRealtimeVisitField(normalizedPoint, ['id', 'visitor_id', 'visitorId']) ||
			`realtime-point-${index}`,
		latitude: normalizedPoint.latitude,
		longitude: normalizedPoint.longitude,
		label: getLocationLabel(normalizedPoint),
		visits,
		accuracy_radius: normalizedPoint.accuracy_radius,
		current_page: currentPage,
		currentPageLabel: currentPage || __('Unknown page', 'bimbeau-privacy-analytics'),
		visitor_id: getRealtimeVisitField(normalizedPoint, ['visitor_id', 'visitorId']),
		country_code: getRealtimeVisitField(normalizedPoint, ['country_code', 'countryCode']),
		city: normalizedPoint.city || '',
		country: normalizedPoint.country || '',
	};
};

export const aggregateRealtimeMapVisits = (visits = []) => {
	const visitsByCoordinates = new Map();

	visits.forEach((visit, index) => {
		const item = normalizeRealtimeMapItem(visit, { individualVisit: true, index });
		const coordinateKey = buildRealtimeGeoKey(item.latitude, item.longitude);

		if (coordinateKey === '' || !visitsByCoordinates.has(coordinateKey)) {
			visitsByCoordinates.set(coordinateKey || `invalid-${index}`, item);
			return;
		}

		const existing = visitsByCoordinates.get(coordinateKey);
		const pages = [...new Set([existing.current_page, item.current_page].filter(Boolean))];
		visitsByCoordinates.set(coordinateKey, {
			...existing,
			visits: existing.visits + item.visits,
			current_page: pages.join(', '),
			currentPageLabel:
				pages.join(', ') || __('Unknown page', 'bimbeau-privacy-analytics'),
			visitor_id: '',
		});
	});

	return Array.from(visitsByCoordinates.values());
};

const mergeRealtimeVisitWithConsentedPoint = (visit, mapPointByCoordinates) => {
	const normalizedVisit = normalizeRealtimeVisit(visit);
	const hasVisitAccuracyRadius = Number.isFinite(Number(normalizedVisit?.accuracy_radius)) && Number(normalizedVisit?.accuracy_radius) > 0;

	if (hasVisitAccuracyRadius) {
		return normalizedVisit;
	}

	const coordinateKey = buildRealtimeGeoKey(normalizedVisit?.latitude, normalizedVisit?.longitude);
	if (coordinateKey === '') {
		return normalizedVisit;
	}

	const matchingPoint = mapPointByCoordinates.get(coordinateKey);
	if (!matchingPoint) {
		return normalizedVisit;
	}

	const pointAccuracyRadius = Number(matchingPoint?.accuracy_radius ?? matchingPoint?.accuracyRadius ?? null);
	if (!Number.isFinite(pointAccuracyRadius) || pointAccuracyRadius <= 0) {
		return normalizedVisit;
	}

	return {
		...normalizedVisit,
		accuracy_radius: Math.round(pointAccuracyRadius),
	};
};

const hasResolvedRealtimeCountry = (visit) => {
	const countryCode = getRealtimeVisitField(visit, ['country_code', 'countryCode']);
	if (countryCode && !isUnknownCountryCode(countryCode)) {
		return true;
	}

	const country = getRealtimeVisitField(visit, ['country', 'country_name', 'countryName']);
	if (country && country.toLowerCase() !== 'unknown country') {
		return true;
	}

	return false;
};

const shouldDisplayRealtimeVisitRow = (visit) => {
	const visitorId = getRealtimeVisitField(visit, ['visitor_id']);

	if (!visitorId) {
		return true;
	}

	return hasResolvedRealtimeCountry(visit);
};

const formatVisitorHashForTable = (hash) => {
	if (typeof hash !== 'string') {
		return '';
	}

	const normalizedHash = hash.trim();
	if (normalizedHash.length <= 10) {
		return normalizedHash;
	}

	return `${normalizedHash.slice(0, 10)}...`;
};

const buildRealtimeVisitRowKey = (visit, index) => {
	const visitorId = getRealtimeVisitField(visit, ['visitor_id']);
	const visitLastViewAt = Number(visit?.last_view_at ?? visit?.lastViewAt ?? 0);
	const countryCode = getRealtimeVisitField(visit, ['country_code', 'countryCode']).toLowerCase();
	const currentPage = getRealtimeVisitField(visit, ['current_page', 'currentPage', 'page_path', 'path']);

	if (visitorId) {
		return `realtime-visit-${visitorId}-${Number.isFinite(visitLastViewAt) ? visitLastViewAt : 0}`;
	}

	if (countryCode || currentPage) {
		return `realtime-visit-${countryCode || 'unknown'}-${currentPage || 'unknown-page'}-${index}`;
	}

	return `realtime-visit-${index}`;
};


const NO_AVAILABLE_LABEL = __('No available', 'bimbeau-privacy-analytics');
const UNKNOWN_LABEL = __('Unknown', 'bimbeau-privacy-analytics');
const UNKNOWN_COUNTRY_LABEL = __('Unknown country', 'bimbeau-privacy-analytics');
const MUTED_PLACEHOLDER_LABELS = new Set([
	NO_AVAILABLE_LABEL,
	UNKNOWN_LABEL,
	UNKNOWN_COUNTRY_LABEL,
]);

const getPlaceholderLabelClassName = (label, baseClassName = '') => {
	const classNames = baseClassName ? [baseClassName] : [];

	if (MUTED_PLACEHOLDER_LABELS.has(label)) {
		classNames.push('bbpa-label--unavailable');
	}

	return classNames.join(' ');
};

const VISITOR_TABLE_LABELS = {
	visitorId: __('Visitor ID hash', 'bimbeau-privacy-analytics'),
	country: __('Country', 'bimbeau-privacy-analytics'),
	city: __('City', 'bimbeau-privacy-analytics'),
	connectionTime: __('Connection time', 'bimbeau-privacy-analytics'),
	currentPage: __('Current page', 'bimbeau-privacy-analytics'),
	channel: __('Channel', 'bimbeau-privacy-analytics'),
	operatingSystem: __('Operating system', 'bimbeau-privacy-analytics'),
	browser: __('Browser', 'bimbeau-privacy-analytics'),
	browserVersion: __('Browser version', 'bimbeau-privacy-analytics'),
	device: __('Device', 'bimbeau-privacy-analytics'),
	resolution: __('Resolution', 'bimbeau-privacy-analytics'),
};


const fieldVisibilityMatrix =
	ADMIN_CONFIG?.settings?.fieldVisibilityMatrix?.realtime_visits || {};

const fallbackMatrix = {
	referrer_domain: 'advanced_after_consent',
	source_category: 'advanced_after_consent',
	operating_system: 'advanced_after_consent',
	browser: 'advanced_after_consent',
	browser_version: 'advanced_after_consent',
	device_class: 'advanced_after_consent',
	screen_resolution: 'advanced_after_consent',
};

const isFieldVisible = (field, isAdvancedEnabled) => {
	const mode = fieldVisibilityMatrix?.[field] || fallbackMatrix?.[field] || 'essential';
	if (mode === 'never') {
		return false;
	}
	if (mode === 'advanced_after_consent') {
		return isAdvancedEnabled;
	}
	return true;
};

const RealtimePanel = () => {
	const logger = useMemo(
		() => createLogger({ debugEnabled: () => Boolean(ADMIN_CONFIG?.settings?.debugEnabled) }),
		[]
	);
	const { data, isLoading, error } = useRealtimeSnapshot();
	const [isFullscreenActive, setIsFullscreenActive] = useState(false);
	const [isFullscreenSupported, setIsFullscreenSupported] = useState(true);
	const [cardDimensions, setCardDimensions] = useState({
		width: 0,
		height: 0,
	});
	const cardContainerRef = useRef(null);
	const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);
	const measureCardDimensions = useCallback(() => {
		const cardNode = cardContainerRef.current;
		if (!cardNode) {
			return;
		}

		const nextRect = cardNode.getBoundingClientRect();
		const nextWidth = Math.round(Math.max(0, nextRect.width));
		const nextHeight = Math.round(Math.max(0, nextRect.height));

		setCardDimensions((currentDimensions) => {
			if (
				currentDimensions.width === nextWidth &&
				currentDimensions.height === nextHeight
			) {
				return currentDimensions;
			}

			return {
				width: nextWidth,
				height: nextHeight,
			};
		});
	}, []);

	useEffect(() => {
		const cardNode = cardContainerRef.current;
		const requestFullscreenFn = cardNode?.requestFullscreen;
		const fullscreenEnabled = Boolean(document.fullscreenEnabled);
		const hasRequestFullscreen = typeof requestFullscreenFn === 'function';
		const isSupported = fullscreenEnabled && hasRequestFullscreen;

		setIsFullscreenSupported(isSupported);
	}, []);

	useEffect(() => {
		measureCardDimensions();

		const handleResize = () => {
			measureCardDimensions();
		};

		window.addEventListener('resize', handleResize);

		let resizeObserver;
		if (typeof window.ResizeObserver === 'function') {
			resizeObserver = new window.ResizeObserver(() => {
				measureCardDimensions();
			});
			if (cardContainerRef.current) {
				resizeObserver.observe(cardContainerRef.current);
			}
		}

		return () => {
			window.removeEventListener('resize', handleResize);
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
		};
	}, [measureCardDimensions]);

	useEffect(() => {
		const handleFullscreenChange = () => {
			const cardNode = cardContainerRef.current;
			const isCardFullscreen =
				Boolean(cardNode) && document.fullscreenElement === cardNode;

			setIsFullscreenActive(isCardFullscreen);
			measureCardDimensions();
			window.dispatchEvent(new Event('resize'));
		};

		document.addEventListener('fullscreenchange', handleFullscreenChange);

		return () => {
			document.removeEventListener(
				'fullscreenchange',
				handleFullscreenChange
			);
		};
	}, [measureCardDimensions]);

	const toggleFullscreen = useCallback(async () => {
		const cardNode = cardContainerRef.current;
		if (!cardNode || !isFullscreenSupported) {
			return;
		}

		try {
			if (document.fullscreenElement === cardNode) {
				await document.exitFullscreen();
			} else {
				await cardNode.requestFullscreen();
			}
		} catch {
			setIsFullscreenSupported(false);
		}
	}, [isFullscreenSupported]);

	const fullscreenContentStyle = isFullscreenActive
		? {
			minHeight: `${Math.max(280, cardDimensions.height)}px`,
		}
		: undefined;
	const activeVisitors = Number(
		data?.activeVisitorsTotal ?? data?.activeVisitors ?? 0
	);
	const realtimeVisits = Array.isArray(data?.visits) ? data.visits : [];
	const dataScope = typeof data?.dataScope === 'string' ? data.dataScope.trim() : '';
	const isEssentialOnlyScope = dataScope === 'essential_only';
	const isAdvancedScope = !isEssentialOnlyScope;
	const realtimeMapData = useMemo(
		() => {
			if (isEssentialOnlyScope) {
				return { items: [] };
			}

			const consentedPoints = Array.isArray(data?.consentedMapPoints)
				? data.consentedMapPoints
				: [];
			const isConsentedAggregate = consentedPoints.length > 0;
			const sourcePoints = isConsentedAggregate
				? consentedPoints.map((point, index) =>
					normalizeRealtimeMapItem(point, { index })
				)
				: aggregateRealtimeMapVisits(realtimeVisits);

			return {
				items: sourcePoints,
			};
		},
		[data?.consentedMapPoints, isEssentialOnlyScope, realtimeVisits]
	);
	useEffect(() => {
		const items = realtimeMapData.items;
		const validCoordinates = items.filter((item) => {
			if (item.latitude === null || item.longitude === null) {
				return false;
			}
			const latitude = Number(item.latitude);
			const longitude = Number(item.longitude);
			return Number.isFinite(latitude) && Number.isFinite(longitude) &&
				!(Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001);
		});
		const positiveMarkers = validCoordinates.filter((item) => Number(item.visits) > 0);

		logger.debug('Realtime map marker normalization', {
			action: 'realtime.map_markers.normalized',
			realtimeVisits: realtimeVisits.length,
			consentedMapPoints: Array.isArray(data?.consentedMapPoints)
				? data.consentedMapPoints.length
				: 0,
			source: isEssentialOnlyScope
				? 'essential_only'
				: data?.consentedMapPoints?.length > 0
					? 'consented_map_points'
					: 'realtime_visits',
			normalizedPoints: items.length,
			validCoordinatePoints: validCoordinates.length,
			excludedForZeroMetric: validCoordinates.length - positiveMarkers.length,
			finalMarkers: positiveMarkers.length,
		});
	}, [data?.consentedMapPoints, isEssentialOnlyScope, logger, realtimeMapData, realtimeVisits.length]);
	const realtimeVisitRows = useMemo(() => {
		if (realtimeVisits.length > 0) {
			const consentedPointByCoordinates = new Map();
			if (!isEssentialOnlyScope && Array.isArray(data?.consentedMapPoints)) {
				data.consentedMapPoints.forEach((point) => {
					const normalizedPoint = normalizeRealtimeMapPoint(point);
					const coordinateKey = buildRealtimeGeoKey(
						normalizedPoint?.latitude,
						normalizedPoint?.longitude
					);
					if (coordinateKey !== '' && !consentedPointByCoordinates.has(coordinateKey)) {
						consentedPointByCoordinates.set(coordinateKey, normalizedPoint);
					}
				});
			}

			return realtimeVisits
				.filter((visit) => shouldDisplayRealtimeVisitRow(visit))
				.map((visit) => {
					const mergedVisit = mergeRealtimeVisitWithConsentedPoint(visit, consentedPointByCoordinates);

					if (!isEssentialOnlyScope) {
						return mergedVisit;
					}

					return {
						...mergedVisit,
						referrer_domain: '',
						source_category: '',
						operating_system: '',
						browser: '',
						browser_version: '',
						device_class: '',
						screen_resolution: '',
					};
				})
				.sort(
					(left, right) =>
						Number(right?.first_view_at ?? 0) - Number(left?.first_view_at ?? 0)
				);
		}

		if (!Array.isArray(data?.consentedMapPoints)) {
			return [];
		}

		return data.consentedMapPoints
			.filter((point) => Number(point?.weight ?? 0) > 0)
			.map((point, index) => {
				const normalizedPoint = normalizeRealtimeMapPoint(point);

				return {
					visitor_id: `active-${index + 1}`,
					country_code: '',
					country: __('Unknown country', 'bimbeau-privacy-analytics'),
					city: getLocationLabel(normalizedPoint),
					first_view_at: 0,
					current_page:
						normalizedPoint?.currentPage || __('Unknown page', 'bimbeau-privacy-analytics'),
					referrer_domain: '',
					source_category: '',
					operating_system: __('Unknown', 'bimbeau-privacy-analytics'),
					browser: __('Unknown', 'bimbeau-privacy-analytics'),
					browser_version: __('Unknown', 'bimbeau-privacy-analytics'),
					device_class: __('Unknown', 'bimbeau-privacy-analytics'),
					screen_resolution: __('Unknown', 'bimbeau-privacy-analytics'),
					page_views: Number(normalizedPoint?.weight ?? 0),
				};
			});
	}, [data?.consentedMapPoints, isEssentialOnlyScope, realtimeVisits]);

	const realtimePanelClassName = `bbpa-report-panel bbpa-realtime-panel${activeVisitors === 0 ? ' bbpa-realtime-panel--no-visitors' : ''
		}`;

	return (
		<div className={realtimePanelClassName}>
			<BpaCard
				title={__('Real-time', 'bimbeau-privacy-analytics')}
				className="bbpa-realtime-panel__card"
				ref={cardContainerRef}
				data-fullscreen-active={isFullscreenActive ? 'true' : 'false'}
				style={
					isFullscreenActive
						? {
							width: '100vw',
							height: '100vh',
							maxWidth: '100vw',
							maxHeight: '100vh',
						}
						: undefined
				}
			>
				{!isFullscreenSupported ? (
					<p className="bbpa-realtime-panel__meta">
						{__(
							'Fullscreen is unavailable in this browser context.',
							'bimbeau-privacy-analytics'
						)}
					</p>
				) : null}
				<VisitorOriginUnavailableNotice />
				<DataState
					isLoading={isLoading}
					error={error}
					isEmpty={false}
					emptyLabel=""
					loadingLabel={__('Loading real-time data…', 'bimbeau-privacy-analytics')}
					skeletonRows={2}
				/>
				{!isLoading && !error ? (
					<div className="bbpa-realtime-panel__body" style={fullscreenContentStyle}>
						<WorldMap
							mapMode="realtime-markers"
							dataOverride={realtimeMapData}
							isLoadingOverride={false}
							errorOverride={null}
							topLeftOverlay={
								<p className="bbpa-realtime-panel__kpi bbpa-realtime-panel__kpi--overlay" aria-live="polite">
									<span className="bbpa-realtime-panel__kpi-value">
										{numberFormatter.format(activeVisitors)}
									</span>
									<span className="bbpa-realtime-panel__kpi-label">
										{
											activeVisitors === 1
												? __('Visitor', 'bimbeau-privacy-analytics')
												: __('Visitors', 'bimbeau-privacy-analytics')
										}
									</span>
								</p>
							}
							controlsSlot={
								<Tooltip
									text={
										isFullscreenActive
											? __('Exit fullscreen', 'bimbeau-privacy-analytics')
											: __('Fullscreen', 'bimbeau-privacy-analytics')
									}
								>
									<Button
										variant="secondary"
										icon={isFullscreenActive ? 'fullscreen-exit-alt' : 'fullscreen-alt'}
										label={isFullscreenActive ? __('Exit fullscreen', 'bimbeau-privacy-analytics') : __('Fullscreen', 'bimbeau-privacy-analytics')}
										onClick={toggleFullscreen}
										disabled={!isFullscreenSupported}
										aria-pressed={isFullscreenActive}
									/>
								</Tooltip>
							}
							emptyLabel=""
						/>
						<div className="bbpa-realtime-panel__visits">
							{isEssentialOnlyScope ? (
								<p className="bbpa-realtime-panel__meta">
									{__(
										'Essential-only scope: enriched visit details and precise map markers are unavailable.',
										'bimbeau-privacy-analytics'
									)}
								</p>
							) : null}
							{realtimeVisitRows.length > 0 ? (
								<div className="bbpa-table-scroll">
									<table className="widefat striped bbpa-report-table bbpa-report-table--visitors bbpa-report-table--realtime-visits" aria-label={__('Table: Real-time visitors', 'bimbeau-privacy-analytics')}>
										<thead><tr>
											<th scope="col">{VISITOR_TABLE_LABELS.visitorId}</th>
											<th scope="col">{VISITOR_TABLE_LABELS.country}</th>
											<th scope="col">{VISITOR_TABLE_LABELS.city}</th>
											<th scope="col">{VISITOR_TABLE_LABELS.connectionTime}</th>
											<th scope="col">{VISITOR_TABLE_LABELS.currentPage}</th>
											{isFieldVisible('source_category', isAdvancedScope) ? <th scope="col">{VISITOR_TABLE_LABELS.channel}</th> : null}
											{isFieldVisible('operating_system', isAdvancedScope) ? <th scope="col">{VISITOR_TABLE_LABELS.operatingSystem}</th> : null}
											{isFieldVisible('browser', isAdvancedScope) ? <th scope="col">{VISITOR_TABLE_LABELS.browser}</th> : null}
											{isFieldVisible('browser_version', isAdvancedScope) ? <th scope="col">{VISITOR_TABLE_LABELS.browserVersion}</th> : null}
											{isFieldVisible('device_class', isAdvancedScope) ? <th scope="col">{VISITOR_TABLE_LABELS.device}</th> : null}
											{isFieldVisible('screen_resolution', isAdvancedScope) ? <th scope="col">{VISITOR_TABLE_LABELS.resolution}</th> : null}
										</tr></thead>
										<tbody>
											{realtimeVisitRows.map((visit, index) => {
												const countryCode = (visit?.country_code || '').toLowerCase();
												const flagClass = getCountryFlagClass(countryCode);
												const hasCountry = !isUnknownCountryCode(countryCode) && flagClass;
												const countryLabel = visit?.country || UNKNOWN_COUNTRY_LABEL;
												const countryFlagFallbackCandidate =
													typeof visit?.country_flag === 'string' ? visit.country_flag.trim() : '';
												const countryFallbackLabel =
													countryFlagFallbackCandidate && ! /^[A-Za-z]{2}$/.test(countryFlagFallbackCandidate)
														? countryFlagFallbackCandidate
														: '';
												const locationLabel = getLocationLabel(visit);
												const screenResolutionLabel =
													formatScreenResolution(visit?.screen_resolution) || UNKNOWN_LABEL;
												const locationLabelClassName = getPlaceholderLabelClassName(
													locationLabel,
													'bbpa-location-label'
												);
												return (
													<tr key={buildRealtimeVisitRowKey(visit, index)}>
														<td>
															{visit?.visitor_id ? (
																<Tooltip text={visit.visitor_id}>
																	<code>{formatVisitorHashForTable(visit.visitor_id)}</code>
																</Tooltip>
															) : (
																'—'
															)}
														</td>
														<td><span className="bbpa-country-label">{hasCountry ? <span className={`bbpa-country-flag ${flagClass}`} role="img" aria-label={countryLabel} /> : <span className="bbpa-country-flag bbpa-country-flag--unknown" role="img" aria-label={__('Unknown country', 'bimbeau-privacy-analytics')} />}{countryFallbackLabel ? <span className="bbpa-country-flag-fallback" aria-hidden="true">{countryFallbackLabel}</span> : null}<span className={getPlaceholderLabelClassName(countryLabel)}>{countryLabel}</span></span></td>
														<td><span className={locationLabelClassName}>{locationLabel}</span></td>
														<td>{formatConnectionTime(visit?.first_view_at)}</td>
														<td className="bbpa-realtime-current-page-cell">
															{visit?.current_page || __('Unknown page', 'bimbeau-privacy-analytics')}
														</td>
														{!isEssentialOnlyScope ? (
															<>
																<td><ChannelLabel sourceCategory={getRealtimeVisitChannelValue(visit)} referrerDomain={visit?.referrer_domain || ''} /></td>
																<td><span className="bbpa-brand-label"><BrandIcon kind="os" value={visit?.operating_system} className="bbpa-brand-icon" /><span className={getPlaceholderLabelClassName(visit?.operating_system || UNKNOWN_LABEL)}>{visit?.operating_system || UNKNOWN_LABEL}</span></span></td>
																<td><span className="bbpa-brand-label"><BrandIcon kind="browser" value={visit?.browser} className="bbpa-brand-icon" /><span className={getPlaceholderLabelClassName(visit?.browser || UNKNOWN_LABEL)}>{visit?.browser || UNKNOWN_LABEL}</span></span></td>
																<td><span className={getPlaceholderLabelClassName(visit?.browser_version || UNKNOWN_LABEL)}>{visit?.browser_version || UNKNOWN_LABEL}</span></td>
																<td><span className="bbpa-brand-label"><BrandIcon kind="device" value={visit?.device_class} className="bbpa-brand-icon" /><span className={getPlaceholderLabelClassName(formatDeviceClassLabel(visit?.device_class, UNKNOWN_LABEL))}>{formatDeviceClassLabel(visit?.device_class, UNKNOWN_LABEL)}</span></span></td>
																<td><span className={getPlaceholderLabelClassName(screenResolutionLabel)}>{screenResolutionLabel}</span></td>
															</>
														) : null}
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
							) : (
								<p className="bbpa-realtime-panel__meta">{__('No visits in the current activity window.', 'bimbeau-privacy-analytics')}</p>
							)}
						</div>
					</div>
				) : null}
			</BpaCard>
		</div>
	);
};

export default RealtimePanel;
